import { useState } from "react";
import { searchAuthors } from "../api/client";

export default function PathFinder({ onFindPath, loading }) {
  const [queries, setQueries] = useState([
    { name: "", affiliation: "", selected: null },
    { name: "", affiliation: "", selected: null },
  ]);
  const [results, setResults] = useState([null, null]);
  const [pathInfo, setPathInfo] = useState(null);
  const [error, setError] = useState("");

  async function handleSearch(idx) {
    const q = queries[idx];
    if (!q.name.trim()) return;
    const data = await searchAuthors(q.name.trim(), q.affiliation.trim());
    const newResults = [...results];
    newResults[idx] = data.results || [];
    setResults(newResults);
  }

  function handleSelect(idx, author) {
    const newQueries = queries.map((q, i) =>
      i === idx ? { ...q, selected: author } : q
    );
    const newResults = [...results];
    newResults[idx] = null;
    setQueries(newQueries);
    setResults(newResults);
  }

  async function handleFindPath() {
    const [a, b] = queries;
    if (!a.selected || !b.selected) {
      setError("Please select both authors first.");
      return;
    }
    setError("");
    setPathInfo(null);
    await onFindPath(a.selected, b.selected, (data) => {
      if (!data) {
        setError("No path found. Try expanding more nodes in the graph.");
      } else {
        setPathInfo(data);
      }
    });
  }

  function updateQuery(idx, field, value) {
    setQueries(queries.map((q, i) => (i === idx ? { ...q, [field]: value, selected: null } : q)));
  }

  return (
    <div className="path-finder">
      <h3>Find Connection</h3>
      {[0, 1].map((idx) => (
        <div key={idx} className="path-input">
          <input
            placeholder={`Author ${idx + 1} name`}
            value={queries[idx].name}
            onChange={(e) => updateQuery(idx, "name", e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch(idx)}
          />
          <input
            placeholder="School (optional)"
            value={queries[idx].affiliation}
            onChange={(e) => updateQuery(idx, "affiliation", e.target.value)}
          />
          <button onClick={() => handleSearch(idx)}>Search</button>
          {queries[idx].selected && (
            <span className="selected-badge">{queries[idx].selected.name}</span>
          )}
          {results[idx] && results[idx].length > 0 && (
            <ul className="search-results">
              {results[idx].map((a) => (
                <li key={a.authorId} onClick={() => handleSelect(idx, a)}>
                  <strong>{a.name}</strong>
                  <span className="meta">
                    {(a.affiliations || []).join(", ") || "Unknown"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}

      <button onClick={handleFindPath} disabled={loading} className="find-btn">
        {loading ? "Loading…" : "Find shortest path"}
      </button>

      {error && <p className="error">{error}</p>}
      {pathInfo && (
        <p className="path-result">
          {pathInfo.degrees === 0
            ? "Same person!"
            : `${pathInfo.degrees} degree${pathInfo.degrees > 1 ? "s" : ""} of separation`}
        </p>
      )}
    </div>
  );
}
