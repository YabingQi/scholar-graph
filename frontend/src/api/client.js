const BASE = "http://localhost:8000/api";

export async function searchAuthors(name, affiliation = "") {
  const params = new URLSearchParams({ name });
  if (affiliation) params.set("affiliation", affiliation);
  const res = await fetch(`${BASE}/search?${params}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getCoauthors(authorId) {
  const res = await fetch(`${BASE}/coauthors/${authorId}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function findPath(sourceId, targetId) {
  const res = await fetch(`${BASE}/path`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ source_id: sourceId, target_id: targetId }),
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
