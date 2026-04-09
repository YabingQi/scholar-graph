"""
Integration tests for FastAPI routes.
External dependencies (DBLP API, SQLite DB) are mocked so tests run offline.
"""
from unittest.mock import AsyncMock, patch
from fastapi.testclient import TestClient
import pytest

from main import app

client = TestClient(app)


# ── /api/search ───────────────────────────────────────────────────────────────

def test_search_query_too_short():
    """min_length=2 validation: single char should return 422."""
    resp = client.get("/api/search?name=a")
    assert resp.status_code == 422


@patch("main.search_authors", new_callable=AsyncMock)
def test_search_returns_results(mock_search):
    mock_search.return_value = [
        {"authorId": "x/Test", "name": "Test Author", "affiliations": ["MIT"]}
    ]
    resp = client.get("/api/search?name=Test")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["results"]) == 1
    assert data["results"][0]["name"] == "Test Author"


@patch("main.search_authors", new_callable=AsyncMock)
def test_search_passes_affiliation(mock_search):
    mock_search.return_value = []
    client.get("/api/search?name=Test&affiliation=MIT")
    mock_search.assert_called_once_with("Test", "MIT")


# ── /api/db-status ────────────────────────────────────────────────────────────

@patch("main.graph_db.db_available", return_value=False)
@patch("main.graph_db.db_built_at", return_value=None)
def test_db_status_no_db(*_):
    resp = client.get("/api/db-status")
    assert resp.status_code == 200
    data = resp.json()
    assert data["available"] is False
    assert data["built_at"] is None


@patch("main.graph_db.db_available", return_value=True)
@patch("main.graph_db.db_built_at", return_value="2026-01-01T00:00:00+00:00")
def test_db_status_available(*_):
    resp = client.get("/api/db-status")
    assert resp.status_code == 200
    data = resp.json()
    assert data["available"] is True
    assert data["built_at"] == "2026-01-01T00:00:00+00:00"


# ── /api/path ─────────────────────────────────────────────────────────────────

@patch("main.graph_db.db_available", return_value=False)
def test_path_returns_503_when_no_db(*_):
    resp = client.post("/api/path", json={"source_id": "a/A", "target_id": "b/B"})
    assert resp.status_code == 503


@patch("main.graph_db.db_available", return_value=True)
@patch("main.graph_db.find_path", return_value=None)
def test_path_returns_404_when_no_path(*_):
    resp = client.post("/api/path", json={"source_id": "a/A", "target_id": "b/B"})
    assert resp.status_code == 404


@patch("main.graph_db.db_available", return_value=True)
@patch("main.graph_db.find_path", return_value=["a/Alice", "b/Bob"])
@patch("main.graph_db.get_name", side_effect=lambda pid: pid.split("/")[-1])
@patch("main.get_author", new_callable=AsyncMock)
def test_path_returns_path(mock_get_author, *_):
    mock_get_author.side_effect = [
        {"authorId": "a/Alice", "name": "Alice", "affiliations": [], "paperCount": 10},
        {"authorId": "b/Bob",   "name": "Bob",   "affiliations": [], "paperCount": 5},
    ]
    resp = client.post("/api/path", json={"source_id": "a/Alice", "target_id": "b/Bob"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["degrees"] == 1
    assert data["path"] == ["a/Alice", "b/Bob"]
