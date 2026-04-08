import { useState, useMemo } from "react";

export default function FindInGraph({ nodes, onFocus }) {
  const [query, setQuery] = useState("");

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return nodes.filter((n) => n.label.toLowerCase().includes(q));
  }, [query, nodes]);

  return (
    <div className="find-in-graph">
      <input
        type="text"
        placeholder="Find in graph…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {query.trim() && (
        <ul className="search-results">
          {matches.length === 0 && (
            <li className="no-match">Not in graph</li>
          )}
          {matches.map((n) => (
            <li key={n.id} onClick={() => { onFocus(n); setQuery(""); }}>
              <strong>{n.label}</strong>
              {n.affiliation && <span className="meta">{n.affiliation}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
