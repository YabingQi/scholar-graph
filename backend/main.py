from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import asyncio

from dblp import search_authors, get_author, get_coauthors
from graph import find_path

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
    """
    Return the center author + ALL their co-authors as graph nodes/edges.
    Scans up to 500 papers.
    """
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
    max_depth: int = 4


@app.post("/api/path")
async def shortest_path(req: PathRequest):
    """Find the shortest collaboration path between two authors."""
    path_ids = await find_path(req.source_id, req.target_id, req.max_depth)
    if path_ids is None:
        raise HTTPException(status_code=404, detail="No path found within depth limit")

    # Fetch details for each node in path
    authors = await asyncio.gather(*[get_author(aid) for aid in path_ids])
    return {
        "path": path_ids,
        "degrees": len(path_ids) - 1,
        "nodes": [_author_to_node(a) for a in authors],
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
    # sharedPapers: only present on coauthor nodes (not center)
    shared = author.get("sharedPapers")
    if shared is not None and not center:
        node["sharedPapers"] = shared
    return node
