import { useState } from "react";
import { searchAuthors } from "../api/client";

export default function PathFinder({ onFindPath, loading }) {
  const [queries, setQueries] = useState([
    { name: "", affiliation: "", selected: null },
    { name: "", affiliation: "", selected: null },
  ]);
  const [results, setResults] = useState([null, null]);
  const [searching, setSearching] = useState([false, false]);
  const [pathInfo, setPathInfo] = useState(null);
  const [error, setError] = useState("");

  async function handleSearch(idx) {
    const q = queries[idx];
    if (!q.name.trim()) return;
    setSearching((s) => s.map((v, i) => (i === idx ? true : v)));
    try {
      const data = await searchAuthors(q.name.trim(), q.affiliation.trim());
      setResults((r) => r.map((v, i) => (i === idx ? (data.results || []) : v)));
    } catch {
      setError("Search failed. Is the backend running?");
    } finally {
      setSearching((s) => s.map((v, i) => (i === idx ? false : v)));
    }
  }

  function handleSelect(idx, author) {
    setQueries((prev) => prev.map((q, i) => i === idx ? { ...q, selected: author } : q));
    setResults((r) => r.map((v, i) => (i === idx ? null : v)));
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
        setError("No path found in the loaded graph.");
      } else {
        setPathInfo(data);
      }
    });
  }

  function updateQuery(idx, field, value) {
    setQueries((prev) => prev.map((q, i) => (i === idx ? { ...q, [field]: value, selected: null } : q)));
    setResults((r) => r.map((v, i) => (i === idx ? null : v)));
  }

  const busy = loading || searching.some(Boolean);

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
            disabled={busy}
          />
          <input
            placeholder="School (optional)"
            value={queries[idx].affiliation}
            onChange={(e) => updateQuery(idx, "affiliation", e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch(idx)}
            disabled={busy}
          />
          <button onClick={() => handleSearch(idx)} disabled={busy}>
            {searching[idx] ? "Searching…" : "Search"}
          </button>
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

      <button onClick={handleFindPath} disabled={busy} className="find-btn">
        {loading ? "Loading networks…" : "Find shortest path"}
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
