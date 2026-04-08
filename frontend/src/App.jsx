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

  // Client-side BFS on edges
  function bfsOnEdges(edgeList, sourceId, targetId) {
    const adjMap = {};
    for (const e of edgeList) {
      if (!adjMap[e.source]) adjMap[e.source] = [];
      if (!adjMap[e.target]) adjMap[e.target] = [];
      adjMap[e.source].push(e.target);
      adjMap[e.target].push(e.source);
    }
    if (sourceId === targetId) return [sourceId];
    const visited = new Set([sourceId]);
    const queue = [[sourceId]];
    while (queue.length) {
      const path = queue.shift();
      const cur = path[path.length - 1];
      for (const nb of (adjMap[cur] || [])) {
        if (nb === targetId) return [...path, nb];
        if (!visited.has(nb)) {
          visited.add(nb);
          queue.push([...path, nb]);
        }
      }
    }
    return null;
  }

  // Called by PathFinder — expand both authors if needed, then BFS
  const handleFindPath = useCallback(async (srcAuthor, tgtAuthor, onResult) => {
    const srcId = srcAuthor.authorId;
    const tgtId = tgtAuthor.authorId;
    setPathNodeIds([]);
    setLoading(true);

    try {
      // Always expand both authors to ensure complete, consistent edge data.
      // (Search API PIDs vs XML PIDs can differ; re-expanding guarantees graph is fresh.)
      setStatus("Loading author networks…");
      await Promise.all([expandAuthorData(srcId), expandAuthorData(tgtId)]);

      // Use edgesRef for up-to-date edge list (setEdges is async)
      const path = bfsOnEdges(edgesRef.current, srcId, tgtId);

      if (!path) {
        setStatus("No direct path found in the loaded graph.");
        onResult(null);
      } else {
        setStatus(`${path.length - 1} degree${path.length - 1 !== 1 ? "s" : ""} of separation.`);
        onResult({ path, degrees: path.length - 1, nodes: [] });
        setPathNodeIds(path);
      }
    } catch {
      setStatus("Failed to load author data.");
      onResult(null);
    } finally {
      setLoading(false);
    }
  }, [nodes, expandAuthorData]);

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
