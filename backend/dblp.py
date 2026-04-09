"""
DBLP official API client.
Endpoints used:
  - Author search: GET /search/author/api?q=...&format=json
  - Author/coauthor data: GET /pid/{pid}.xml
Both are documented official DBLP APIs (no authentication required).
Uses httpx with HTTP/2, which matches DBLP's server and avoids TLS reset issues.
"""
import asyncio
import json
import xml.etree.ElementTree as ET
from typing import Optional
import httpx

BASE = "https://dblp.org"
UA = "scholar-graph/1.0 (https://github.com/YabingQi/scholar-graph; bot)"

# Shared async HTTP/2 client — reuses connections across requests
_client: httpx.AsyncClient | None = None
# Semaphore: max 5 concurrent DBLP requests (HTTP/2 multiplexing handles this well)
_sem = asyncio.Semaphore(5)

_CACHE_MAX = 1000  # max entries per in-memory cache


def _evict(cache: dict) -> None:
    """Drop the oldest half of the cache when it exceeds _CACHE_MAX."""
    if len(cache) >= _CACHE_MAX:
        keep = list(cache.keys())[_CACHE_MAX // 2:]
        for k in list(cache.keys()):
            if k not in keep:
                del cache[k]


def _get_client() -> httpx.AsyncClient:
    global _client
    if _client is None or _client.is_closed:
        _client = httpx.AsyncClient(
            http2=True,
            headers={"User-Agent": UA},
            timeout=30,
            follow_redirects=True,
        )
    return _client


async def _afetch(url: str) -> bytes:
    """Fetch via DBLP official API using HTTP/2, with concurrency limiting."""
    async with _sem:
        client = _get_client()
        for attempt in range(2):
            try:
                resp = await client.get(url)
                resp.raise_for_status()
                return resp.content
            except (httpx.HTTPError, httpx.TimeoutException):
                if attempt == 1:
                    raise
                await asyncio.sleep(1.0)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _pid_from_url(url: str) -> str:
    """'https://dblp.org/pid/h/NicholasJAHarvey' → 'h/NicholasJAHarvey'"""
    return url.replace(f"{BASE}/pid/", "").strip("/")


def _parse_notes(notes) -> list[str]:
    """Extract affiliation strings from DBLP notes field (dict or list)."""
    if not notes:
        return []
    note = notes.get("note", [])
    if isinstance(note, dict):
        note = [note]
    return [n.get("#text", "") for n in note if n.get("@type") == "affiliation" and n.get("#text")]


# ── Search ────────────────────────────────────────────────────────────────────

_search_cache: dict[str, list[dict]] = {}


async def search_authors(name: str, affiliation: Optional[str] = None, limit: int = 10) -> list[dict]:
    from urllib.parse import urlencode
    cache_key = f"{name.lower()}|{(affiliation or '').lower()}"
    if cache_key in _search_cache:
        return _search_cache[cache_key]

    qs = urlencode({"q": name, "format": "json", "h": limit})
    data = json.loads(await _afetch(f"{BASE}/search/author/api?{qs}"))

    hits = data.get("result", {}).get("hits", {}).get("hit", [])
    if isinstance(hits, dict):
        hits = [hits]

    authors = []
    for hit in hits:
        info = hit.get("info", {})
        url = info.get("url", "")
        if not url:
            continue
        pid = _pid_from_url(url)
        affiliations = _parse_notes(info.get("notes"))
        authors.append({
            "authorId": pid,
            "name": info.get("author", ""),
            "affiliations": affiliations,
            "paperCount": 0,
            "citationCount": 0,
            "hIndex": 0,
        })

    if affiliation:
        aff_lower = affiliation.lower()
        filtered = [a for a in authors if any(aff_lower in s.lower() for s in a["affiliations"])]
        authors = filtered if filtered else authors

    _evict(_search_cache)
    _search_cache[cache_key] = authors
    return authors


# ── XML cache ─────────────────────────────────────────────────────────────────
# Keyed by author_id → parsed ElementTree root. Avoids re-fetching during BFS.
_xml_cache: dict[str, ET.Element] = {}


async def _get_xml(author_id: str) -> ET.Element:
    if author_id not in _xml_cache:
        _evict(_xml_cache)
        _xml_cache[author_id] = ET.fromstring(await _afetch(f"{BASE}/pid/{author_id}.xml"))
    return _xml_cache[author_id]


# ── Author detail ─────────────────────────────────────────────────────────────

async def get_author(author_id: str) -> dict:
    """Fetch author info from the DBLP person XML page."""
    root = await _get_xml(author_id)

    name = root.get("name", author_id)
    paper_count = len(root.findall(".//r/*"))

    affiliations = []
    for note in root.findall(".//note"):
        if note.get("type") == "affiliation" and note.text:
            affiliations.append(note.text)

    return {
        "authorId": author_id,
        "name": name,
        "affiliations": affiliations,
        "paperCount": paper_count,
        "citationCount": 0,
        "hIndex": 0,
    }


# ── Co-authors ────────────────────────────────────────────────────────────────

async def get_coauthors(author_id: str, top_n: int = 0) -> tuple[list[dict], list[dict]]:
    """
    Parse the DBLP person XML to find all co-authors and cross-edges.
    Returns (coauthors, cross_edges). Each coauthor has sharedPapers count.
    """
    root = await _get_xml(author_id)

    coauthor_count: dict[str, int] = {}
    coauthor_names: dict[str, str] = {}
    pair_count: dict[tuple[str, str], int] = {}

    for paper in root.findall(".//r/*"):
        paper_pids = []
        for a_elem in paper.findall("author"):
            pid = a_elem.get("pid", "")
            if not pid or pid == author_id:
                continue
            paper_pids.append(pid)
            coauthor_count[pid] = coauthor_count.get(pid, 0) + 1
            if pid not in coauthor_names:
                coauthor_names[pid] = a_elem.text or ""

        for i in range(len(paper_pids)):
            for j in range(i + 1, len(paper_pids)):
                key = (min(paper_pids[i], paper_pids[j]), max(paper_pids[i], paper_pids[j]))
                pair_count[key] = pair_count.get(key, 0) + 1

    if not coauthor_count:
        return [], []

    all_pids = sorted(coauthor_count, key=coauthor_count.get, reverse=True)
    if top_n > 0:
        all_pids = all_pids[:top_n]

    coauthor_details = [
        {
            "authorId": pid,
            "name": coauthor_names.get(pid, pid),
            "affiliations": [],
            "paperCount": coauthor_count[pid],
            "citationCount": 0,
            "hIndex": 0,
            "sharedPapers": coauthor_count[pid],
        }
        for pid in all_pids
    ]

    result_ids = {a["authorId"] for a in coauthor_details}
    cross_edges = []
    seen: set[tuple[str, str]] = set()
    for (a, b), count in pair_count.items():
        if a not in result_ids or b not in result_ids:
            continue
        key = (min(a, b), max(a, b))
        if key in seen:
            continue
        seen.add(key)
        cross_edges.append({"id": f"{a}-{b}", "source": a, "target": b, "weight": count})

    return coauthor_details, cross_edges
