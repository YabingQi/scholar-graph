"""
SQLite-based BFS shortest-path finder.
Uses the local dblp_coauthors.db built by build_graph.py.
Much faster than live DBLP API calls — no rate limits.
"""
import sqlite3
from collections import deque
from pathlib import Path

DB_PATH = Path(__file__).parent / "data" / "dblp_coauthors.db"

_con: sqlite3.Connection | None = None


def get_con() -> sqlite3.Connection:
    global _con
    if _con is None:
        if not DB_PATH.exists():
            raise FileNotFoundError(
                f"Graph DB not found at {DB_PATH}. "
                "Run: python build_graph.py"
            )
        _con = sqlite3.connect(DB_PATH, check_same_thread=False)
        _con.execute("PRAGMA query_only=True")
    return _con


def neighbors(pid: str) -> list[str]:
    """Return all co-author PIDs for a given author PID."""
    con = get_con()
    rows = con.execute(
        "SELECT pid_b FROM coauthors WHERE pid_a=? "
        "UNION ALL "
        "SELECT pid_a FROM coauthors WHERE pid_b=?",
        (pid, pid)
    ).fetchall()
    return [r[0] for r in rows]


def find_path(source_id: str, target_id: str, max_depth: int = 6) -> list[str] | None:
    """
    BFS shortest path using local SQLite graph.
    Returns path as list of PIDs, or None if not found within max_depth.
    Runs entirely locally — no DBLP API calls.
    """
    if source_id == target_id:
        return [source_id]

    visited = {source_id}
    queue: deque[list[str]] = deque([[source_id]])

    while queue:
        path = queue.popleft()
        if len(path) > max_depth:
            break
        for nb in neighbors(path[-1]):
            if nb == target_id:
                return path + [nb]
            if nb not in visited:
                visited.add(nb)
                queue.append(path + [nb])

    return None


def get_name(pid: str) -> str | None:
    """Return the display name for a PID from the local DB, or None."""
    try:
        con = get_con()
        row = con.execute("SELECT name FROM author_names WHERE pid=?", (pid,)).fetchone()
        return row[0] if row else None
    except Exception:
        return None


def db_available() -> bool:
    return DB_PATH.exists()


def db_built_at() -> str | None:
    if not DB_PATH.exists():
        return None
    try:
        con = get_con()
        row = con.execute("SELECT value FROM meta WHERE key='built_at'").fetchone()
        return row[0] if row else None
    except Exception:
        return None
