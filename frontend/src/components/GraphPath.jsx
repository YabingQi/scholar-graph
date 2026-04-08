import { useState } from "react";

export default function GraphPath({ nodes, edges, onPathFound }) {
  const [queries, setQueries] = useState(["", ""]);
  const [selected, setSelected] = useState([null, null]);
  const [filtered, setFiltered] = useState([[], []]);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  function handleInput(idx, value) {
    const q = queries.map((v, i) => (i === idx ? value : v));
    setQueries(q);
    setResult(null);
    setError("");

    if (!value.trim()) {
      const f = filtered.map((v, i) => (i === idx ? [] : v));
      setFiltered(f);
      return;
    }
    const lower = value.toLowerCase();
    const matches = nodes
      .filter((n) => n.label.toLowerCase().includes(lower))
      .slice(0, 8);
    const f = filtered.map((v, i) => (i === idx ? matches : v));
    setFiltered(f);
  }

  function handleSelect(idx, node) {
    const s = selected.map((v, i) => (i === idx ? node : v));
    setSelected(s);
    const q = queries.map((v, i) => (i === idx ? node.label : v));
    setQueries(q);
    const f = filtered.map((v, i) => (i === idx ? [] : v));
    setFiltered(f);
  }

  function handleFind() {
    const [a, b] = selected;
    if (!a || !b) {
      setError("Please select both people.");
      return;
    }
    if (a.id === b.id) {
      setError("Same person!");
      return;
    }

    // BFS on current edges
    const adj = {};
    for (const e of edges) {
      if (!adj[e.source]) adj[e.source] = [];
      if (!adj[e.target]) adj[e.target] = [];
      adj[e.source].push(e.target);
      adj[e.target].push(e.source);
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
        if (!visited.has(nb)) {
          visited.add(nb);
          queue.push([...path, nb]);
        }
      }
    }

    setError("No path found in the current graph.");
    setResult(null);
    onPathFound(null);
  }

  return (
    <div className="graph-path">
      <h3>Path in Graph</h3>
      {[0, 1].map((idx) => (
        <div key={idx} className="path-input">
          <input
            placeholder={`Person ${idx + 1}`}
            value={queries[idx]}
            onChange={(e) => handleInput(idx, e.target.value)}
          />
          {filtered[idx].length > 0 && (
            <ul className="search-results">
              {filtered[idx].map((n) => (
                <li key={n.id} onClick={() => handleSelect(idx, n)}>
                  <strong>{n.label}</strong>
                  {n.affiliation && <span className="meta">{n.affiliation}</span>}
                </li>
              ))}
            </ul>
          )}
          {selected[idx] && queries[idx] === selected[idx].label && (
            <span className="selected-badge">{selected[idx].label}</span>
          )}
        </div>
      ))}

      <button className="find-btn" onClick={handleFind}>
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
