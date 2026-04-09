import { useState } from "react";
import { searchAuthors } from "../api/client";

export default function SearchBar({ onSelect }) {
  const [name, setName] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSearch(e) {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    setError("");
    try {
      const data = await searchAuthors(name.trim());
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
    onSelect(author);
  }

  return (
    <div className="search-bar">
      <form onSubmit={handleSearch} className="search-form">
        <input
          type="text"
          placeholder="Researcher name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
<button type="submit" disabled={loading}>
          {loading ? "Searching…" : "Search"}
        </button>
      </form>

      {error && <p className="error">{error}</p>}

      {results.length > 0 && (
        <>
          <p className="search-hint">If multiple people share a name, the number suffix (e.g. 0001, 0002) disambiguates them — verify on <a href="https://dblp.org" target="_blank" rel="noreferrer">dblp.org</a>.</p>
          <ul className="search-results">
            {results.map((a) => (
              <li key={a.authorId} onClick={() => handleSelect(a)}>
                <strong>{a.name}</strong>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
