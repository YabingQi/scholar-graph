"""
Bidirectional BFS shortest-path finder between two authors.
Expanding from both ends reduces worst-case fetches from 20^d to ~2×20^(d/2).
Frontier nodes at each level are fetched concurrently (bounded by dblp._sem).
"""
import asyncio
from dblp import get_coauthors


async def _expand(frontier: dict[str, list[str]], visited_self: set[str], visited_other: set[str],
                  top_n: int) -> tuple[dict[str, list[str]], list[str] | None]:
    """Expand one BFS level, fetching all frontier nodes concurrently."""
    # Fetch all nodes in this frontier concurrently
    async def fetch_one(current_id: str) -> tuple[str, list]:
        coauthors, _ = await get_coauthors(current_id, top_n=top_n)
        return current_id, coauthors

    results = await asyncio.gather(*[fetch_one(nid) for nid in frontier], return_exceptions=True)

    new_frontier: dict[str, list[str]] = {}
    for res in results:
        if isinstance(res, Exception):
            continue
        current_id, coauthors = res
        path = frontier[current_id]
        for coauthor in coauthors:
            nid = coauthor.get("authorId")
            if not nid or nid in visited_self:
                continue
            new_path = path + [nid]
            if nid in visited_other:
                return new_frontier, new_path  # meeting point found
            new_frontier[nid] = new_path
            visited_self.add(nid)

    return new_frontier, None


async def find_path(source_id: str, target_id: str, max_depth: int = 4) -> list[str] | None:
    """
    Bidirectional BFS from source and target simultaneously.
    Returns list of authorIds (shortest path), or None if not found within max_depth.
    """
    if source_id == target_id:
        return [source_id]

    # Check direct connection first (depth 1) — single fetch, uses cache
    coauthors_src, _ = await get_coauthors(source_id, top_n=0)
    src_coauthor_ids = {c["authorId"] for c in coauthors_src}
    if target_id in src_coauthor_ids:
        return [source_id, target_id]

    # frontier maps node_id → path from that side's root
    frontier_a: dict[str, list[str]] = {source_id: [source_id]}
    frontier_b: dict[str, list[str]] = {target_id: [target_id]}
    visited_a: set[str] = {source_id}
    visited_b: set[str] = {target_id}

    half = max_depth // 2 + 1
    top_n = 25

    for _ in range(half):
        if not frontier_a and not frontier_b:
            break

        # Expand smaller frontier first
        if frontier_a and (not frontier_b or len(frontier_a) <= len(frontier_b)):
            frontier_a, path = await _expand(frontier_a, visited_a, visited_b, top_n)
            if path is not None:
                mid = path[-1]
                path_b = frontier_b.get(mid, [mid])
                return path + list(reversed(path_b[:-1]))

        if frontier_b:
            frontier_b, path = await _expand(frontier_b, visited_b, visited_a, top_n)
            if path is not None:
                mid = path[-1]
                path_a = frontier_a.get(mid, [mid])
                return path_a[:-1] + list(reversed(path))

    return None
