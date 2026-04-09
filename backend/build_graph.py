"""
Download DBLP XML dump and build a local SQLite coauthor graph.

Usage:
    python build_graph.py            # download + build if missing or >7 days old
    python build_graph.py --force    # always rebuild

Output: data/dblp_coauthors.db
  Table coauthors(pid_a, pid_b, weight)  — undirected, pid_a < pid_b
  Table author_names(pid, name)
  Table meta(key, value)                 — stores 'built_at' timestamp

Strategy:
  DBLP XML dump author elements do NOT have pid= attributes.
  PIDs live only in <www key="homepages/PID"> person records.
  So we do a single-pass parse:
    - publications  → raw_coauthors(name_a, name_b, weight)  [temp]
    - www records   → name_pid(name, pid)                    [temp]
  Then a SQL JOIN creates the final coauthors table.
"""
import argparse
import gzip
import html.entities
import re
import sqlite3
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from lxml import etree as ET

# DBLP dump URL (stable)
DUMP_URL = "https://dblp.org/xml/dblp.xml.gz"
DATA_DIR = Path(__file__).parent / "data"
DB_PATH  = DATA_DIR / "dblp_coauthors.db"
GZ_PATH  = DATA_DIR / "dblp.xml.gz"

# Publication element tags we care about
PUB_TAGS = {
    "article", "inproceedings", "proceedings",
    "book", "incollection", "phdthesis", "mastersthesis",
}

STALE_DAYS = 7

# Pre-built map: b'uuml' -> b'&#252;'  (all HTML named entities → numeric refs)
_XML_SAFE = {b'amp', b'lt', b'gt', b'quot', b'apos'}
_ENTITY_MAP: dict[bytes, bytes] = {
    name.encode(): f'&#{cp};'.encode()
    for name, cp in html.entities.name2codepoint.items()
}
_ENTITY_RE = re.compile(rb'&([a-zA-Z][a-zA-Z0-9]*);')


def _fix_entities(data: bytes) -> bytes:
    """Replace HTML named entities with numeric refs so lxml can parse them."""
    return _ENTITY_RE.sub(
        lambda m: _ENTITY_MAP.get(m.group(1), m.group(0))
                  if m.group(1) not in _XML_SAFE else m.group(0),
        data,
    )


def is_stale() -> bool:
    if not DB_PATH.exists():
        return True
    con = sqlite3.connect(DB_PATH)
    row = con.execute("SELECT value FROM meta WHERE key='built_at'").fetchone()
    con.close()
    if not row:
        return True
    built = datetime.fromisoformat(row[0])
    age = (datetime.now(timezone.utc) - built).days
    return age >= STALE_DAYS


def download():
    import urllib.request
    DATA_DIR.mkdir(exist_ok=True)
    print(f"Downloading {DUMP_URL} …", flush=True)
    start = time.time()

    def reporthook(count, block_size, total_size):
        elapsed = time.time() - start
        downloaded = count * block_size
        mb = downloaded / 1_000_000
        if total_size > 0:
            pct = downloaded / total_size * 100
            print(f"\r  {mb:.0f} MB / {total_size/1_000_000:.0f} MB  ({pct:.1f}%)  {mb/elapsed:.1f} MB/s  ", end="", flush=True)
        else:
            print(f"\r  {mb:.0f} MB  {mb/elapsed:.1f} MB/s  ", end="", flush=True)

    urllib.request.urlretrieve(DUMP_URL, GZ_PATH, reporthook)
    print(f"\nDownloaded in {time.time()-start:.0f}s", flush=True)


def build_db():
    DATA_DIR.mkdir(exist_ok=True)
    tmp = DB_PATH.with_suffix(".tmp")
    if tmp.exists():
        tmp.unlink()

    con = sqlite3.connect(tmp)
    con.execute("PRAGMA journal_mode=WAL")
    con.execute("PRAGMA synchronous=NORMAL")
    con.execute("PRAGMA cache_size=-524288")  # 512 MB cache

    # Temporary tables: name-based pairs + name→pid mapping
    con.execute("""
        CREATE TABLE raw_coauthors (
            name_a TEXT NOT NULL,
            name_b TEXT NOT NULL,
            weight INTEGER NOT NULL DEFAULT 1,
            PRIMARY KEY (name_a, name_b)
        )
    """)
    con.execute("""
        CREATE TABLE name_pid (
            name TEXT PRIMARY KEY,
            pid  TEXT NOT NULL
        )
    """)
    # Final tables (populated at end via JOIN)
    con.execute("""
        CREATE TABLE coauthors (
            pid_a TEXT NOT NULL,
            pid_b TEXT NOT NULL,
            weight INTEGER NOT NULL DEFAULT 1,
            PRIMARY KEY (pid_a, pid_b)
        )
    """)
    con.execute("""
        CREATE TABLE author_names (
            pid  TEXT PRIMARY KEY,
            name TEXT NOT NULL
        )
    """)
    con.execute("""
        CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT)
    """)

    print("Parsing DBLP XML …", flush=True)
    start = time.time()

    # In-memory buffers flushed periodically to SQLite
    raw_pair_buf: dict[tuple[str, str], int] = {}
    name_pid_buf: dict[str, str] = {}      # name → pid (from www records)
    FLUSH_EVERY = 200_000

    papers = 0
    persons = 0

    def flush_raw():
        con.executemany(
            "INSERT INTO raw_coauthors(name_a,name_b,weight) VALUES(?,?,?) "
            "ON CONFLICT(name_a,name_b) DO UPDATE SET weight=weight+excluded.weight",
            [(a, b, w) for (a, b), w in raw_pair_buf.items()]
        )
        con.executemany(
            "INSERT OR IGNORE INTO name_pid(name,pid) VALUES(?,?)",
            name_pid_buf.items()
        )
        raw_pair_buf.clear()
        name_pid_buf.clear()
        con.commit()

    pull = ET.XMLPullParser(events=("start", "end"), load_dtd=False, no_network=True)

    in_pub = False
    in_www = False
    www_pid = ""
    current_authors: list[str] = []   # author names for current publication
    www_names: list[str] = []         # author names inside current www record
    CHUNK = 1 << 20  # 1 MB

    def _process_events():
        nonlocal in_pub, in_www, www_pid, papers, persons

        for event, elem in pull.read_events():
            tag = elem.tag

            # ── Publication records ──────────────────────────────────────
            if event == "start" and tag in PUB_TAGS:
                in_pub = True
                current_authors.clear()

            elif event == "end" and in_pub and tag == "author":
                name = (elem.text or "").strip()
                if name:
                    current_authors.append(name)

            elif event == "end" and tag in PUB_TAGS:
                in_pub = False
                if len(current_authors) >= 2:
                    papers += 1
                    names = current_authors[:]
                    for i in range(len(names)):
                        for j in range(i + 1, len(names)):
                            a = min(names[i], names[j])
                            b = max(names[i], names[j])
                            raw_pair_buf[(a, b)] = raw_pair_buf.get((a, b), 0) + 1
                    if len(raw_pair_buf) >= FLUSH_EVERY:
                        flush_raw()
                        elapsed = time.time() - start
                        print(f"\r  {papers:,} papers  {persons:,} persons  {elapsed:.0f}s  ",
                              end="", flush=True)
                elem.clear()

            # ── Person records (<www key="homepages/PID">) ───────────────
            elif event == "start" and tag == "www":
                key = (elem.get("key") or "")
                if key.startswith("homepages/"):
                    in_www = True
                    www_pid = key[len("homepages/"):]
                    www_names.clear()

            elif event == "end" and in_www and tag == "author":
                name = (elem.text or "").strip()
                if name:
                    www_names.append(name)

            elif event == "end" and tag == "www":
                if in_www and www_pid and www_names:
                    persons += 1
                    for n in www_names:
                        name_pid_buf[n] = www_pid
                    if len(name_pid_buf) >= FLUSH_EVERY:
                        flush_raw()
                        elapsed = time.time() - start
                        print(f"\r  {papers:,} papers  {persons:,} persons  {elapsed:.0f}s  ",
                              end="", flush=True)
                in_www = False
                www_pid = ""
                elem.clear()

    with gzip.open(GZ_PATH, "rb") as f:
        pending = b""
        while True:
            raw = f.read(CHUNK)
            if not raw:
                if pending:
                    pull.feed(_fix_entities(pending))
                    _process_events()
                break
            chunk = pending + raw
            # Avoid splitting in the middle of an entity ref
            amp_pos = chunk.rfind(b'&')
            if amp_pos != -1 and amp_pos > len(chunk) - 20 and b';' not in chunk[amp_pos:]:
                pending = chunk[amp_pos:]
                chunk = chunk[:amp_pos]
            else:
                pending = b""
            pull.feed(_fix_entities(chunk))
            _process_events()

    flush_raw()

    elapsed_parse = time.time() - start
    print(f"\n  Parsed {papers:,} papers, {persons:,} persons in {elapsed_parse:.0f}s", flush=True)

    # ── Join names → PIDs to build final coauthor table ─────────────────
    print("Joining name pairs → PIDs …", flush=True)
    con.execute("CREATE INDEX idx_np ON name_pid(name)")
    con.execute("""
        INSERT INTO coauthors(pid_a, pid_b, weight)
        SELECT
            CASE WHEN np1.pid < np2.pid THEN np1.pid ELSE np2.pid END AS pa,
            CASE WHEN np1.pid < np2.pid THEN np2.pid ELSE np1.pid END AS pb,
            SUM(r.weight)
        FROM raw_coauthors r
        JOIN name_pid np1 ON r.name_a = np1.name
        JOIN name_pid np2 ON r.name_b = np2.name
        WHERE np1.pid != np2.pid
        GROUP BY pa, pb
    """)
    con.execute("""
        INSERT OR IGNORE INTO author_names(pid, name)
        SELECT pid, name FROM name_pid
    """)
    con.commit()

    # Drop temp tables
    con.execute("DROP TABLE raw_coauthors")
    con.execute("DROP TABLE name_pid")

    # ── Indexes for fast BFS lookup ──────────────────────────────────────
    print("Building indexes …", flush=True)
    con.execute("CREATE INDEX idx_ca_a ON coauthors(pid_a)")
    con.execute("CREATE INDEX idx_ca_b ON coauthors(pid_b)")
    con.execute("INSERT INTO meta VALUES('built_at', ?)", (datetime.now(timezone.utc).isoformat(),))
    con.commit()
    con.close()

    # Atomically replace old DB
    tmp.replace(DB_PATH)
    elapsed = time.time() - start
    size_mb = DB_PATH.stat().st_size / 1_000_000
    coauthor_count = sqlite3.connect(DB_PATH).execute("SELECT COUNT(*) FROM coauthors").fetchone()[0]
    print(f"Done. {papers:,} papers, {persons:,} persons, {coauthor_count:,} coauthor pairs, "
          f"{size_mb:.0f} MB, {elapsed:.0f}s", flush=True)
    if GZ_PATH.exists():
        GZ_PATH.unlink()
        print("Removed downloaded gz file.", flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--force", action="store_true", help="Rebuild even if fresh")
    args = parser.parse_args()

    if not args.force and not is_stale():
        built = sqlite3.connect(DB_PATH).execute("SELECT value FROM meta WHERE key='built_at'").fetchone()[0]
        print(f"DB is up to date (built {built}). Use --force to rebuild.")
        sys.exit(0)

    # Skip download if gz already exists and is complete
    if not GZ_PATH.exists() or GZ_PATH.stat().st_size < 100_000_000:
        download()
    else:
        print(f"Using existing gz ({GZ_PATH.stat().st_size // 1_000_000} MB)", flush=True)
    build_db()
