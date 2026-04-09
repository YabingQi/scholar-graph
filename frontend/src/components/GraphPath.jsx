import { useState } from "react";

export default function GraphPath({ nodes, edges, onPathFound }) {
  const [queries, setQueries] = useState(["", ""]);
  const [selected, setSelected] = useState([null, null]);
  const [filtered, setFiltered] = useState([[], []]);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  function handleInput(idx, value) {
    setQueries((q) => q.map((v, i) => (i === idx ? value : v)));
    setResult(null);
    setError("");

    if (!value.trim()) {
      setFiltered((f) => f.map((v, i) => (i === idx ? [] : v)));
      return;
    }
    const lower = value.toLowerCase();
    const matches = nodes.filter((n) => n.label.toLowerCase().includes(lower)).slice(0, 8);
    setFiltered((f) => f.map((v, i) => (i === idx ? matches : v)));
  }

  function handleSelect(idx, node) {
    setSelected((s) => s.map((v, i) => (i === idx ? node : v)));
    setQueries((q) => q.map((v, i) => (i === idx ? node.label : v)));
    setFiltered((f) => f.map((v, i) => (i === idx ? [] : v)));
  }

  function handleFind() {
    const [a, b] = selected;
    if (!a || !b) { setError("Please select both people."); return; }
    if (a.id === b.id) { setError("Same person!"); return; }

    const adj = {};
    for (const e of edges) {
      (adj[e.source] = adj[e.source] || []).push(e.target);
      (adj[e.target] = adj[e.target] || []).push(e.source);
    }

    const visited = new Set([a.id]);
    const queue = [[a.id]];
    while (queue.length) {
      const path = queue.shift();
      const cur = path[path.length - 1];
      for (const nb of (adj[cur] || [])) {
        if (nb === b.id) {
          const fullPath = [...path, nb];
          setResult(fullPath.length - 1);
          setError("");
          onPathFound(fullPath);
          return;
        }
        if (!visited.has(nb)) { visited.add(nb); queue.push([...path, nb]); }
      }
    }
    setError("No path found in the current graph.");
    setResult(null);
    onPathFound(null);
  }

  return (
    <div className="path-finder">
      <h3>Path in Graph</h3>
      <p className="path-label">
        Researcher 1{selected[0] && queries[0] === selected[0].label && (
          <span className="selected-badge">{selected[0].label}</span>
        )}
      </p>
      <div className="search-bar">
        <div className="search-form" style={{ display: "flex", gap: 6 }}>
          <input
            type="text"
            placeholder="Search in graph…"
            value={queries[0]}
            onChange={(e) => handleInput(0, e.target.value)}
          />
        </div>
        {filtered[0].length > 0 && (
          <>
            <p className="search-hint">If multiple people share a name, the number suffix (e.g. 0001, 0002) disambiguates them — verify on <a href="https://dblp.org" target="_blank" rel="noreferrer">dblp.org</a>.</p>
            <ul className="search-results">
              {filtered[0].map((n) => (
                <li key={n.id} onClick={() => handleSelect(0, n)}>
                  <strong>{n.label}</strong>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      <p className="path-label">
        Researcher 2{selected[1] && queries[1] === selected[1].label && (
          <span className="selected-badge">{selected[1].label}</span>
        )}
      </p>
      <div className="search-bar">
        <div className="search-form" style={{ display: "flex", gap: 6 }}>
          <input
            type="text"
            placeholder="Search in graph…"
            value={queries[1]}
            onChange={(e) => handleInput(1, e.target.value)}
          />
        </div>
        {filtered[1].length > 0 && (
          <>
            <p className="search-hint">If multiple people share a name, the number suffix (e.g. 0001, 0002) disambiguates them — verify on <a href="https://dblp.org" target="_blank" rel="noreferrer">dblp.org</a>.</p>
            <ul className="search-results">
              {filtered[1].map((n) => (
                <li key={n.id} onClick={() => handleSelect(1, n)}>
                  <strong>{n.label}</strong>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      <button className="find-btn" onClick={handleFind} disabled={!selected[0] || !selected[1]}>
        Find shortest path
      </button>

      {result !== null && (
        <p className="path-result">
          {result === 0 ? "Same person!" : `${result} degree${result !== 1 ? "s" : ""} of separation`}
        </p>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  );
}
