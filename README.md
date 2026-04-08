# Scholar Graph

An interactive collaboration graph explorer for CS researchers, powered by [DBLP](https://dblp.org).

Search any CS professor, visualize their co-author network, expand nodes to explore further, and find degrees of separation between any two researchers.

![Scholar Graph](https://img.shields.io/badge/data-DBLP-blue) ![Python](https://img.shields.io/badge/backend-FastAPI-green) ![React](https://img.shields.io/badge/frontend-React-61dafb)

## Features

- **Author search** — search by name + optional institution filter
- **Collaboration graph** — click any node to expand their co-author network; nodes sized by paper count
- **Cross-edges** — edges between any two co-authors who share a paper, not just center-to-coauthor
- **Hover tooltips** — shows affiliation and number of shared papers with the expanded author
- **Find in graph** — fuzzy search within already-loaded nodes, animates to the result
- **Find Path (In Graph)** — instant BFS shortest path between any two people already in the graph
- **Find Path (auto-expand)** — search any two researchers; automatically loads their networks and finds the connection
- Drag to rearrange nodes; layout re-runs smoothly when new nodes are added

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Python 3.11+, FastAPI, httpx (HTTP/2) |
| Data | DBLP official API (`/pid/{id}.xml`, `/search/author/api`) |
| Frontend | React 18, Cytoscape.js (cose layout) |
| Graph rendering | Cytoscape.js |

## Getting Started

### Prerequisites

- Python 3.11+
- Node.js 18+

### Install & Run

```bash
# Clone
git clone https://github.com/YabingQi/scholar-graph.git
cd scholar-graph

# Backend
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install fastapi "uvicorn[standard]" "httpx[http2]"
uvicorn main:app --reload --port 8000

# Frontend (new terminal)
cd frontend
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

Alternatively, use the convenience script (after setting up both environments):

```bash
./start.sh
```

## Project Structure

```
scholar-graph/
├── backend/
│   ├── main.py          # FastAPI routes
│   ├── dblp.py          # DBLP API client (HTTP/2, caching)
│   └── graph.py         # Bidirectional BFS path finder
└── frontend/
    └── src/
        ├── App.jsx
        ├── api/client.js
        └── components/
            ├── Graph.jsx        # Cytoscape graph
            ├── SearchBar.jsx    # Author search
            ├── PathFinder.jsx   # Find path (auto-expand)
            ├── GraphPath.jsx    # Find path (in-graph only)
            └── FindInGraph.jsx  # Search within loaded graph
```

## Data Source

All data comes from the [DBLP Computer Science Bibliography](https://dblp.org) via their official API. DBLP covers CS publications only, which keeps results clean and avoids cross-discipline author confusion.

No API key required.
