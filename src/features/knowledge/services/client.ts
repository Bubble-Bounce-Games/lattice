import type {
  KnowledgeEntry,
  KnowledgeEntryInput,
  KnowledgePage,
  KnowledgeSearchFilters,
  KnowledgeSource,
} from '../types';
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}
async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, { cache: 'no-store', ...init });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ApiError('Could not connect. Check your connection and try again.', 0);
  }
  const body: unknown = await response.json();
  if (!response.ok)
    throw new ApiError(
      typeof body === 'object' && body && 'error' in body && typeof body.error === 'string'
        ? body.error
        : 'Something went wrong. Please try again.',
      response.status,
    );
  return body as T;
}
const payload = (method: string, data: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(data),
});
export const knowledgeApi = {
  search(filters: KnowledgeSearchFilters, signal?: AbortSignal) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filters))
      if (value !== undefined && value !== '') params.set(key, String(value));
    return request<KnowledgePage>(`/api/entries?${params}`, { signal });
  },
  get: (id: string) => request<KnowledgeEntry>(`/api/entries/${encodeURIComponent(id)}`),
  sources: (signal?: AbortSignal) => request<KnowledgeSource[]>('/api/sources', { signal }),
  create: (input: KnowledgeEntryInput) =>
    request<KnowledgeEntry>('/api/entries', payload('POST', input)),
  update: (entry: KnowledgeEntry, input: KnowledgeEntryInput) =>
    request<KnowledgeEntry>(
      `/api/entries/${entry.id}`,
      payload('PUT', { ...input, expectedUpdatedAt: entry.updatedAt }),
    ),
  delete: (entry: KnowledgeEntry) =>
    request<{ deleted: boolean }>(
      `/api/entries/${entry.id}`,
      payload('DELETE', { expectedUpdatedAt: entry.updatedAt }),
    ),
};
