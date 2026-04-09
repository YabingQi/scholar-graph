import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { searchAuthors, getCoauthors, findPath } from '../api/client';

const mockFetch = vi.fn();

beforeEach(() => vi.stubGlobal('fetch', mockFetch));
afterEach(() => vi.unstubAllGlobals());

const ok = (data) => ({
  ok: true,
  json: async () => data,
  text: async () => JSON.stringify(data),
});

describe('searchAuthors', () => {
  it('calls /api/search with name param', async () => {
    mockFetch.mockResolvedValue(ok({ results: [] }));
    await searchAuthors('Bengio');
    expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('/api/search'));
    expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('name=Bengio'));
  });

  it('includes affiliation when provided', async () => {
    mockFetch.mockResolvedValue(ok({ results: [] }));
    await searchAuthors('Bengio', 'MIT');
    expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('affiliation=MIT'));
  });

  it('throws on non-ok response', async () => {
    mockFetch.mockResolvedValue({ ok: false, text: async () => 'Server error' });
    await expect(searchAuthors('Test')).rejects.toThrow('Server error');
  });
});

describe('getCoauthors', () => {
  it('calls /api/coauthors/{id}', async () => {
    mockFetch.mockResolvedValue(ok({ nodes: [], edges: [] }));
    await getCoauthors('h/Hinton');
    expect(mockFetch).toHaveBeenCalledWith('/api/coauthors/h/Hinton');
  });
});

describe('findPath', () => {
  it('calls /api/path with correct body including default max_depth', async () => {
    mockFetch.mockResolvedValue(ok({ path: ['a', 'b'], degrees: 1, nodes: [] }));
    await findPath('a/Alice', 'b/Bob');
    expect(mockFetch).toHaveBeenCalledWith('/api/path', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ source_id: 'a/Alice', target_id: 'b/Bob', max_depth: 8 }),
    }));
  });

  it('passes custom max_depth when provided', async () => {
    mockFetch.mockResolvedValue(ok({ path: ['a', 'b'], degrees: 1, nodes: [] }));
    await findPath('a/Alice', 'b/Bob', 5);
    expect(mockFetch).toHaveBeenCalledWith('/api/path', expect.objectContaining({
      body: JSON.stringify({ source_id: 'a/Alice', target_id: 'b/Bob', max_depth: 5 }),
    }));
  });

  it('returns null on 404', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 404 });
    const result = await findPath('a/Alice', 'b/Bob');
    expect(result).toBeNull();
  });

  it('throws on other errors', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500, text: async () => 'Internal error' });
    await expect(findPath('a/Alice', 'b/Bob')).rejects.toThrow();
  });
});
