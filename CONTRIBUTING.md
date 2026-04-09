# Contributing to Scholar Graph

Thanks for your interest! Bug fixes, features, and improvements are all welcome.

## Quick start

```bash
git clone https://github.com/YabingQi/scholar-graph.git
cd scholar-graph
docker compose up          # starts backend + frontend with hot reload
```

Or follow the **Manual Setup** steps in the README.

## Running tests

**Backend:**
```bash
cd backend
pip install -r requirements-dev.txt
pytest -v
```

**Frontend:**
```bash
cd frontend
npm install
npm test
```

## Making changes

- **Backend** lives in `backend/`. The main files are:
  - `main.py` — FastAPI routes
  - `dblp.py` — DBLP API client
  - `graph_db.py` — local SQLite BFS
- **Frontend** lives in `frontend/src/`. Components are in `components/`.

Keep PRs focused — one logical change per PR. If you're adding a feature, add tests for the new code. If you're fixing a bug, a regression test is appreciated but not required.

## Submitting a PR

1. Fork the repo and create a branch from `main`
2. Make your changes and run the tests
3. Open a pull request with a short description of what and why

## Reporting bugs

Open a [GitHub issue](https://github.com/YabingQi/scholar-graph/issues) with:
- What you expected to happen
- What actually happened
- Steps to reproduce (OS, Python/Node version, browser if relevant)

## Data source

All data comes from [DBLP](https://dblp.org) via their official API and XML dump. Contributions that add other data sources should consider licensing and rate-limit implications.
