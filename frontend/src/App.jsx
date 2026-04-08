import { useState, useCallback, useRef } from "react";
import SearchBar from "./components/SearchBar";
import Graph from "./components/Graph";
import PathFinder from "./components/PathFinder";
import FindInGraph from "./components/FindInGraph";
import GraphPath from "./components/GraphPath";
import { getCoauthors } from "./api/client";
import "./App.css";

export default function App() {
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  // edgesRef keeps a sync copy for BFS (state updates are async)
  const edgesRef = useRef([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [pathNodeIds, setPathNodeIds] = useState([]);
  const [activeTab, setActiveTab] = useState("explore");
  const graphRef = useRef(null);

  // Returns a promise that resolves with updated node ids after expansion
  const expandAuthorData = useCallback(async (authorId) => {
    const data = await getCoauthors(authorId);
    const centerNode = data.nodes.find((n) => n.id === authorId);
    const centerName = centerNode?.label || authorId;
    setNodes((prev) => {
      const existing = new Map(prev.map((n) => [n.id, n]));
      // Center node: mark expanded, update with fresh data (real paperCount + affiliation)
      const newNodes = data.nodes
        .filter((n) => !existing.has(n.id))
        .map((n) => n.id === authorId ? { ...n, expanded: true } : { ...n, expandedFrom: centerName });
      const updated = prev.map((n) => {
        if (n.id === authorId) {
          // Merge fresh center data (real paperCount, affiliation) and mark expanded
          const fresh = data.nodes.find((d) => d.id === authorId);
          return { ...n, ...(fresh || {}), center: true, expanded: true };
        }
        return { ...n, center: false };
      });
      return [...updated, ...newNodes];
    });
    setEdges((prev) => {
      const existing = new Set(prev.map((e) => e.id));
      const newEdges = data.edges.filter((e) => {
        const rev = `${e.target}-${e.source}`;
        return !existing.has(e.id) && !existing.has(rev);
      });
      const merged = [...prev, ...newEdges];
      edgesRef.current = merged;
      return merged;
    });
    return data;
  }, []);

  const expandAuthor = useCallback(async (author) => {
    const authorId = author.id || author.authorId;
    const authorName = author.name || author.label;
    setLoading(true);
    setStatus(`Loading collaborators for ${authorName}…`);
    setPathNodeIds([]);
    try {
      const data = await expandAuthorData(authorId);
      setStatus(`${data.nodes.length - 1} collaborators loaded (${data.edges.length} edges).`);
    } catch {
      setStatus("Failed to load collaborators.");
    } finally {
      setLoading(false);
    }
  }, [expandAuthorData]);

  // Client-side BFS on an edge list
  function bfsOnEdges(edgeList, sourceId, targetId) {
    const adj = {};
    for (const e of edgeList) {
      (adj[e.source] = adj[e.source] || []).push(e.target);
      (adj[e.target] = adj[e.target] || []).push(e.source);
    }
    if (sourceId === targetId) return [sourceId];
    const visited = new Set([sourceId]);
    const queue = [[sourceId]];
    while (queue.length) {
      const path = queue.shift();
      const cur = path[path.length - 1];
      for (const nb of (adj[cur] || [])) {
        if (nb === targetId) return [...path, nb];
        if (!visited.has(nb)) { visited.add(nb); queue.push([...path, nb]); }
      }
    }
    return null;
  }

  // Called by PathFinder: iterative bidirectional expansion, up to 3 levels each side
  const handleFindPath = useCallback(async (srcAuthor, tgtAuthor, onResult) => {
    const srcId = srcAuthor.authorId;
    const tgtId = tgtAuthor.authorId;
    setPathNodeIds([]);
    setLoading(true);

    // Local edge accumulator — not subject to React state flush timing
    const localEdgeMap = new Map(edgesRef.current.map(e => [e.id, e]));
    const expandedNodes = new Set();

    function addEdges(edges) {
      for (const e of edges) {
        const rev = `${e.target}-${e.source}`;
        if (!localEdgeMap.has(e.id) && !localEdgeMap.has(rev)) localEdgeMap.set(e.id, e);
      }
    }

    async function expand(id) {
      if (expandedNodes.has(id)) return null;
      expandedNodes.add(id);
      const data = await expandAuthorData(id);
      addEdges(data.edges);
      return data;
    }

    function tryBFS() {
      return bfsOnEdges([...localEdgeMap.values()], srcId, tgtId);
    }

    function neighborsOf(ids) {
      const adj = {};
      for (const e of localEdgeMap.values()) {
        (adj[e.source] = adj[e.source] || []).push(e.target);
        (adj[e.target] = adj[e.target] || []).push(e.source);
      }
      return [...new Set(ids.flatMap(id => adj[id] || []))].filter(id => !expandedNodes.has(id));
    }

    let foundPath = null;
    try {
      // Level 0: expand both authors
      setStatus("Loading both author networks…");
      const [dataA, dataB] = await Promise.all([expand(srcId), expand(tgtId)]);
      foundPath = tryBFS();

      if (!foundPath) {
        // Bidirectional expansion: always expand the smaller frontier next
        let frontierA = (dataA?.nodes || []).filter(n => n.id !== srcId).slice(0, 15).map(n => n.id);
        let frontierB = (dataB?.nodes || []).filter(n => n.id !== tgtId).slice(0, 15).map(n => n.id);

        for (let level = 1; level <= 3 && !foundPath; level++) {
          // Pick the smaller frontier to expand first, then the larger
          const ordered = frontierA.length <= frontierB.length
            ? [frontierA, frontierB]
            : [frontierB, frontierA];

          setStatus(`Searching deeper… (level ${level}/3)`);
          for (const frontier of ordered) {
            await Promise.all(frontier.map(expand));
            foundPath = tryBFS();
            if (foundPath) break;
          }
          if (!foundPath) {
            frontierA = neighborsOf(frontierA).slice(0, 10);
            frontierB = neighborsOf(frontierB).slice(0, 10);
          }
        }
      }

      if (foundPath) {
        setStatus(`${foundPath.length - 1} degree${foundPath.length - 1 !== 1 ? "s" : ""} of separation.`);
        onResult({ path: foundPath, degrees: foundPath.length - 1, nodes: [] });
        setPathNodeIds(foundPath);
      } else {
        setStatus("No path found within 3 levels — these two may be too far apart.");
        onResult(null);
      }
    } catch {
      setStatus("Failed to load author data.");
      onResult(null);
    } finally {
      setLoading(false);
    }
  }, [expandAuthorData]);

  function handleFocusNode(node) {
    graphRef.current?.focusNode(node.id);
  }

  function handleReset() {
    setNodes([]);
    setEdges([]);
    edgesRef.current = [];
    setPathNodeIds([]);
    setStatus("");
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <h1 className="title">Scholar Graph</h1>

        {nodes.length > 0 && (
          <FindInGraph nodes={nodes} onFocus={handleFocusNode} />
        )}

        <div className="tabs">
          <button className={activeTab === "explore" ? "tab active" : "tab"} onClick={() => setActiveTab("explore")}>Explore</button>
          <button className={activeTab === "path" ? "tab active" : "tab"} onClick={() => setActiveTab("path")}>Find Path</button>
          {nodes.length > 0 && (
            <button className={activeTab === "graphpath" ? "tab active" : "tab"} onClick={() => setActiveTab("graphpath")}>In Graph</button>
          )}
        </div>

        {activeTab === "explore" && (
          <div className="panel">
            <p className="hint">Search a researcher to build the graph. Click a node to expand.</p>
            <SearchBar onSelect={expandAuthor} />
          </div>
        )}

        {activeTab === "path" && (
          <div className="panel">
            <p className="hint">Search two researchers to find their connection. Will auto-expand if not in graph.</p>
            <PathFinder onFindPath={handleFindPath} loading={loading} />
          </div>
        )}

        {activeTab === "graphpath" && nodes.length > 0 && (
          <div className="panel">
            <p className="hint">Find shortest path between two people already in the graph.</p>
            <GraphPath nodes={nodes} edges={edgesRef.current} onPathFound={(path) => setPathNodeIds(path || [])} />
          </div>
        )}

        {nodes.length > 0 && (
          <button className="reset-btn" onClick={handleReset}>
            Clear graph
          </button>
        )}

        {status && (
          <p className="status">{loading ? "⏳ " : ""}{status}</p>
        )}
      </aside>

      <main className="main">
        {nodes.length === 0 ? (
          <div className="empty-state">
            <p>Search for a researcher to start exploring the collaboration graph.</p>
          </div>
        ) : (
          <Graph
            ref={graphRef}
            nodes={nodes}
            edges={edges}
            pathNodeIds={pathNodeIds}
            onNodeClick={expandAuthor}
          />
        )}
      </main>
    </div>
  );
}
