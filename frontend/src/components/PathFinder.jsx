import { useState } from "react";
import SearchBar from "./SearchBar";

export default function PathFinder({ onFindPath, loading }) {
  const [selected, setSelected] = useState([null, null]);
  const [pathInfo, setPathInfo] = useState(null);
  const [error, setError] = useState("");

  function handleSelect(idx, author) {
    setSelected((prev) => prev.map((v, i) => (i === idx ? author : v)));
    setError("");
    setPathInfo(null);
  }

  async function handleFindPath() {
    const [a, b] = selected;
    if (!a || !b) {
      setError("Please select both authors first.");
      return;
    }
    setError("");
    setPathInfo(null);
    await onFindPath(a, b, (data) => {
      if (!data) {
        setError("No path found within depth limit.");
      } else {
        setPathInfo(data);
      }
    });
  }

  return (
    <div className="path-finder">
      <h3>Find Connection</h3>
      <p className="path-label">
        Researcher 1{selected[0] && <span className="selected-badge">{selected[0].name}</span>}
      </p>
      <SearchBar onSelect={(a) => handleSelect(0, a)} disabled={loading} />
      <p className="path-label">
        Researcher 2{selected[1] && <span className="selected-badge">{selected[1].name}</span>}
      </p>
      <SearchBar onSelect={(a) => handleSelect(1, a)} disabled={loading} />

      <button
        onClick={handleFindPath}
        disabled={loading || !selected[0] || !selected[1]}
        className="find-btn"
      >
        {loading ? "Searching…" : "Find shortest path"}
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
