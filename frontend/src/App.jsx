import { useState, useCallback, useRef } from "react";
import SearchBar from "./components/SearchBar";
import Graph from "./components/Graph";
import PathFinder from "./components/PathFinder";
import FindInGraph from "./components/FindInGraph";
import GraphPath from "./components/GraphPath";
import { getCoauthors, findPath } from "./api/client";
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

  // Called by PathFinder: use server-side SQLite BFS, then expand endpoints only
  const handleFindPath = useCallback(async (srcAuthor, tgtAuthor, onResult) => {
    const srcId = srcAuthor.authorId;
    const tgtId = tgtAuthor.authorId;
    setPathNodeIds([]);
    setLoading(true);

    try {
      // Step 1: expand both endpoints in parallel (shows their full networks)
      setStatus("Loading both author networks…");
      await Promise.all([expandAuthorData(srcId), expandAuthorData(tgtId)]);

      // Step 2: find path via server SQLite BFS (pure local, no extra API calls)
      setStatus("Finding path…");
      const result = await findPath(srcId, tgtId);

      if (!result) {
        setStatus("No path found within depth limit.");
        onResult(null);
        return;
      }

      const { path, degrees, nodes: pathNodes } = result;

      // Step 3: add intermediate path nodes (name-only from local DB) and connecting edges
      setNodes((prev) => {
        const existing = new Map(prev.map((n) => [n.id, n]));
        const toAdd = pathNodes.filter((n) => !existing.has(n.id));
        return [...prev, ...toAdd];
      });

      const pathEdges = [];
      for (let i = 0; i < path.length - 1; i++) {
        const id = `${path[i]}-${path[i + 1]}`;
        pathEdges.push({ id, source: path[i], target: path[i + 1], weight: 1 });
      }
      setEdges((prev) => {
        const existing = new Set(prev.map((e) => e.id));
        const newEdges = pathEdges.filter((e) => {
          const rev = `${e.target}-${e.source}`;
          return !existing.has(e.id) && !existing.has(rev);
        });
        const merged = [...prev, ...newEdges];
        edgesRef.current = merged;
        return merged;
      });

      setStatus(`${degrees} degree${degrees !== 1 ? "s" : ""} of separation.`);
      onResult(result);
      setPathNodeIds(path);
    } catch (err) {
      const msg = err?.message || "";
      if (msg.includes("503") || msg.includes("not built")) {
        setStatus("Path DB not available. Run: python build_graph.py");
      } else {
        setStatus("Path search failed.");
      }
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
