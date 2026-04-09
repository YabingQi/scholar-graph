# Changelog

All notable changes to this project are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [Unreleased]

### Added
- `max_depth` parameter now validated server-side (range 1–12); requests outside this range return HTTP 422
- Structured HTTP request logging in backend (method, path, status, duration)
- FastAPI interactive docs available at `/docs` and `/redoc`
- Frontend `findPath` now passes `max_depth` through to the backend API
- Tests for `FindInGraph`, `PathFinder`, and `GraphPath` components (31 total frontend tests)
- `CODE_OF_CONDUCT.md`
- `SECURITY.md` with vulnerability reporting instructions
- GitHub Issue templates (bug report, feature request) and PR template

---

## [1.0.0] — 2026-04-08

### Added
- Author search via DBLP official API
- Interactive coauthor graph (Cytoscape.js, cose layout)
- Node hover tooltips showing affiliation and shared paper counts
- Find-in-graph fuzzy search within loaded nodes
- Shortest-path finder using local SQLite BFS (30 M coauthor pairs)
- In-graph path finder (client-side BFS on loaded subgraph)
- Docker Compose setup (backend + nginx frontend + one-shot DB builder)
- GitHub Actions CI (backend pytest, frontend lint/test/build)
- MIT License, CONTRIBUTING.md
