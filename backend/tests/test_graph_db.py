"""
Unit tests for graph_db — BFS path finding and neighbor lookup.
Uses a tiny in-memory SQLite graph so no DBLP data is needed.

Test graph topology:
  Alice ↔ Bob  (weight 5)
  Alice ↔ Carol (weight 3)
  Bob   ↔ Dave (weight 2)
  Eve             (isolated — no edges)
"""
import sqlite3
import pytest
import graph_db as gdb


def _build_db(path):
    con = sqlite3.connect(str(path))
    con.executescript("""
        CREATE TABLE coauthors (
            pid_a TEXT NOT NULL, pid_b TEXT NOT NULL, weight INTEGER NOT NULL DEFAULT 1,
            PRIMARY KEY (pid_a, pid_b)
        );
        CREATE INDEX idx_ca_a ON coauthors(pid_a);
        CREATE INDEX idx_ca_b ON coauthors(pid_b);
        CREATE TABLE author_names (pid TEXT PRIMARY KEY, name TEXT NOT NULL);
        CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT);

        INSERT INTO coauthors VALUES ('a/Alice', 'b/Bob',   5);
        INSERT INTO coauthors VALUES ('a/Alice', 'c/Carol', 3);
        INSERT INTO coauthors VALUES ('b/Bob',   'd/Dave',  2);

        INSERT INTO author_names VALUES ('a/Alice', 'Alice');
        INSERT INTO author_names VALUES ('b/Bob',   'Bob');
        INSERT INTO author_names VALUES ('c/Carol', 'Carol');
        INSERT INTO author_names VALUES ('d/Dave',  'Dave');
        INSERT INTO meta VALUES ('built_at', '2026-01-01T00:00:00+00:00');
    """)
    con.commit()
    con.close()


@pytest.fixture()
def db(tmp_path, monkeypatch):
    db_path = tmp_path / "test.db"
    _build_db(db_path)
    monkeypatch.setattr(gdb, "DB_PATH", db_path)
    monkeypatch.setattr(gdb, "_con", None)
    yield db_path
    if gdb._con is not None:
        gdb._con.close()


# ── find_path ─────────────────────────────────────────────────────────────────

def test_find_path_direct(db):
    assert gdb.find_path("a/Alice", "b/Bob") == ["a/Alice", "b/Bob"]


def test_find_path_two_hops(db):
    assert gdb.find_path("a/Alice", "d/Dave") == ["a/Alice", "b/Bob", "d/Dave"]


def test_find_path_same_node(db):
    assert gdb.find_path("a/Alice", "a/Alice") == ["a/Alice"]


def test_find_path_no_path(db):
    # Eve is not in the graph at all — BFS exhausts without finding her
    assert gdb.find_path("a/Alice", "e/Eve") is None


def test_find_path_exceeds_max_depth(db):
    # Alice → Bob → Dave is 2 hops; max_depth=1 only reaches direct neighbors
    assert gdb.find_path("a/Alice", "d/Dave", max_depth=1) is None


def test_find_path_reverse_direction(db):
    # Graph is undirected; should work both ways
    assert gdb.find_path("d/Dave", "a/Alice") == ["d/Dave", "b/Bob", "a/Alice"]


# ── neighbors ────────────────────────────────────────────────────────────────

def test_neighbors_returns_all(db):
    assert set(gdb.neighbors("a/Alice")) == {"b/Bob", "c/Carol"}


def test_neighbors_leaf_node(db):
    # Dave only connected to Bob
    assert gdb.neighbors("d/Dave") == ["b/Bob"]


def test_neighbors_unknown_node(db):
    assert gdb.neighbors("x/Unknown") == []


# ── get_name ─────────────────────────────────────────────────────────────────

def test_get_name_exists(db):
    assert gdb.get_name("a/Alice") == "Alice"


def test_get_name_missing(db):
    assert gdb.get_name("x/Unknown") is None


# ── db_available / db_built_at ───────────────────────────────────────────────

def test_db_available_true(db):
    assert gdb.db_available() is True


def test_db_available_false(tmp_path, monkeypatch):
    monkeypatch.setattr(gdb, "DB_PATH", tmp_path / "nonexistent.db")
    assert gdb.db_available() is False


def test_db_built_at(db):
    assert gdb.db_built_at() == "2026-01-01T00:00:00+00:00"
