import { useState } from "react";
import { searchAuthors } from "../api/client";

export default function SearchBar({ onSelect }) {
  const [name, setName] = useState("");
  const [affiliation, setAffiliation] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSearch(e) {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    setError("");
    try {
      const data = await searchAuthors(name.trim(), affiliation.trim());
      setResults(data.results || []);
      if (!data.results?.length) setError("No authors found.");
    } catch {
      setError("Search failed. Is the backend running?");
    } finally {
      setLoading(false);
    }
  }

  function handleSelect(author) {
    setResults([]);
    setName("");
    setAffiliation("");
    onSelect(author);
  }

  return (
    <div className="search-bar">
      <form onSubmit={handleSearch} className="search-form">
        <input
          type="text"
          placeholder="Professor name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          type="text"
          placeholder="School / affiliation (optional)"
          value={affiliation}
          onChange={(e) => setAffiliation(e.target.value)}
        />
        <button type="submit" disabled={loading}>
          {loading ? "Searching…" : "Search"}
        </button>
      </form>

      {error && <p className="error">{error}</p>}

      {results.length > 0 && (
        <ul className="search-results">
          {results.map((a) => (
            <li key={a.authorId} onClick={() => handleSelect(a)}>
              <strong>{a.name}</strong>
              <span className="meta">
                {(a.affiliations || []).join(", ") || "Unknown affiliation"} ·{" "}
                {a.paperCount ?? "?"} papers · h-index {a.hIndex ?? "?"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
