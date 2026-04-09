from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import asyncio

from dblp import search_authors, get_author, get_coauthors
import graph_db

app = FastAPI(title="Scholar Graph API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Search ──────────────────────────────────────────────────────────────────

@app.get("/api/search")
async def search(
    name: str = Query(..., min_length=2),
    affiliation: Optional[str] = Query(None),
):
    """Search authors by name + optional affiliation filter."""
    authors = await search_authors(name, affiliation)
    return {"results": authors}


# ── Author detail ────────────────────────────────────────────────────────────

@app.get("/api/author/{author_id:path}")
async def author_detail(author_id: str):
    try:
        author = await get_author(author_id)
    except Exception:
        raise HTTPException(status_code=404, detail="Author not found")
    return author


# ── Co-authors (graph expansion) ─────────────────────────────────────────────

@app.get("/api/coauthors/{author_id:path}")
async def coauthors(author_id: str):
    """Return the center author + ALL their co-authors as graph nodes/edges.
    Coauthor list comes from local SQLite (fast). Center node affiliation/paperCount
    comes from DBLP API (one request only).
    """
    if graph_db.db_available():
        # Fast path: local DB for coauthor list + one API call for center node
        loop = asyncio.get_event_loop()
        collaborators, cross_edges = await loop.run_in_executor(
            None, graph_db.get_coauthors_local, author_id
        )
        try:
            author = await get_author(author_id)
        except Exception:
            author = {"authorId": author_id, "name": graph_db.get_name(author_id) or author_id,
                      "affiliations": [], "paperCount": 0}
    else:
        # Fallback: full DBLP API (no local DB)
        (collaborators, cross_edges), author = await asyncio.gather(
            get_coauthors(author_id, top_n=0),
            get_author(author_id),
        )

    nodes = [_author_to_node(author, center=True)]
    edges = []

    for coauthor in collaborators:
        cid = coauthor.get("authorId")
        if not cid:
            continue
        nodes.append(_author_to_node(coauthor))
        edges.append({
            "id": f"{author_id}-{cid}",
            "source": author_id,
            "target": cid,
            "weight": coauthor.get("sharedPapers", 1),
        })

    edges.extend(cross_edges)
    return {"nodes": nodes, "edges": edges}


# ── Shortest path ─────────────────────────────────────────────────────────────

class PathRequest(BaseModel):
    source_id: str
    target_id: str
    max_depth: int = 6


@app.post("/api/path")
async def shortest_path(req: PathRequest):
    """
    Find the shortest collaboration path between two authors.
    Uses local SQLite graph if available (fast, no rate limits).
    Returns 503 with instructions if DB not built yet.
    """
    if not graph_db.db_available():
        raise HTTPException(
            status_code=503,
            detail="Local graph DB not built yet. Run: python build_graph.py"
        )

    # Run blocking BFS in a thread so it doesn't block the event loop
    loop = asyncio.get_event_loop()
    path_ids = await loop.run_in_executor(
        None, graph_db.find_path, req.source_id, req.target_id, req.max_depth
    )

    if path_ids is None:
        raise HTTPException(status_code=404, detail="No path found within depth limit")

    # Fetch full details only for the two endpoints; use local DB for intermediates
    endpoints = await asyncio.gather(
        get_author(path_ids[0]),
        get_author(path_ids[-1]),
        return_exceptions=True,
    )

    nodes = []
    for i, pid in enumerate(path_ids):
        is_endpoint = i == 0 or i == len(path_ids) - 1
        if is_endpoint:
            a = endpoints[0] if i == 0 else endpoints[-1]
            if isinstance(a, Exception):
                label = graph_db.get_name(pid) or pid
                nodes.append({"id": pid, "label": label, "affiliation": "", "paperCount": 0, "center": False})
            else:
                nodes.append(_author_to_node(a))
        else:
            # Intermediate node: use local DB name only, no API call
            label = graph_db.get_name(pid) or pid
            nodes.append({"id": pid, "label": label, "affiliation": "", "paperCount": 0, "center": False})

    return {
        "path": path_ids,
        "degrees": len(path_ids) - 1,
        "nodes": nodes,
    }


@app.get("/api/db-status")
async def db_status():
    """Check whether the local graph DB is available and when it was built."""
    return {
        "available": graph_db.db_available(),
        "built_at": graph_db.db_built_at(),
    }


# ── Helpers ───────────────────────────────────────────────────────────────────

def _author_to_node(author: dict, center: bool = False) -> dict:
    affiliations = author.get("affiliations") or []
    node = {
        "id": author.get("authorId", ""),
        "label": author.get("name", "Unknown"),
        "affiliation": affiliations[0] if affiliations else "",
        "paperCount": author.get("paperCount", 0),
        "center": center,
    }
    shared = author.get("sharedPapers")
    if shared is not None and not center:
        node["sharedPapers"] = shared
    return node
