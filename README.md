# Scholar Graph

An interactive CS collaboration graph explorer powered by [DBLP](https://dblp.org). Search researchers, explore coauthor networks, and find the shortest path between any two people in computer science.

![Scholar Graph](https://img.shields.io/badge/data-DBLP-blue) ![Python](https://img.shields.io/badge/backend-FastAPI-green) ![React](https://img.shields.io/badge/frontend-React-61dafb)

## Features

- **Author search** — search any CS researcher by name
- **Collaboration graph** — click any node to expand their coauthor network; nodes sized by paper count
- **Hover tooltips** — shows affiliation and shared paper counts
- **Find in graph** — fuzzy search within already-loaded nodes
- **Find Path** — find shortest collaboration path between any two researchers (instant, fully local BFS on 30M coauthor pairs)

## Setup

### Prerequisites

- Python 3.11+
- Node.js 18+

### 1. Clone

```bash
git clone https://github.com/YabingQi/scholar-graph.git
cd scholar-graph
```

### 2. Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install fastapi "uvicorn[standard]" "httpx[http2]" lxml
```

### 3. Build the local graph database

The graph database (~5.6 GB) is not included in the repo. Build it with:

```bash
python3 build_graph.py
```

This will automatically:
1. Download the DBLP XML dump (~1 GB compressed) from `dblp.org`
2. Parse ~7 million publications
3. Build a SQLite coauthor graph with ~30 million pairs

**Expected time:** ~5 min to download, ~5 hours to parse. Find Path requires it; search and graph exploration work without it.

To update the database with the latest DBLP data, run:

```bash
python3 build_graph.py --force
```

### 4. Frontend

```bash
cd frontend
npm install
```

### 5. Run

**Backend** (in `backend/`):
```bash
uvicorn main:app --reload --port 8000
```

**Frontend** (in `frontend/`):
```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

## Project Structure

```
scholar-graph/
├── backend/
│   ├── main.py          # FastAPI routes
│   ├── dblp.py          # DBLP API client (HTTP/2, caching)
│   ├── graph_db.py      # Local SQLite BFS path finder
│   └── build_graph.py   # Download + parse DBLP dump → SQLite
└── frontend/
    └── src/
        ├── App.jsx
        ├── api/client.js
        └── components/
            ├── Graph.jsx        # Cytoscape graph
            ├── SearchBar.jsx    # Author search
            ├── PathFinder.jsx   # Find path
            ├── GraphPath.jsx    # In-graph path finder
            └── FindInGraph.jsx  # Search within loaded graph
```

## Data Source

All data comes from the [DBLP Computer Science Bibliography](https://dblp.org) via their official API and XML dump. No API key required.
