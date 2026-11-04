import { z } from 'zod';
import {
  EntryConflictError,
  EntryNotFoundError,
} from '../features/knowledge/repositories/knowledge-repository';
export function json(data: unknown, status = 200): Response {
  return Response.json(data, {
    status,
    headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
  });
}
export function apiError(error: unknown): Response {
  if (error instanceof z.ZodError)
    return json(
      { error: 'Please check the highlighted fields.', fields: z.flattenError(error).fieldErrors },
      400,
    );
  if (error instanceof EntryNotFoundError) return json({ error: error.message }, 404);
  if (error instanceof EntryConflictError) return json({ error: error.message }, 409);
  if (error instanceof SyntaxError) return json({ error: 'The request could not be read.' }, 400);
  console.error('Lattice request failed', error);
  return json({ error: 'Something went wrong. Please try again.' }, 500);
}
export function checkMutation(request: Request): Response | null {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin)
    return json({ error: 'This request is not allowed.' }, 403);
  if (!request.headers.get('content-type')?.startsWith('application/json'))
    return json({ error: 'Expected a JSON request.' }, 415);
  return null;
}
export async function readJson(request: Request): Promise<unknown> {
  const body = await request.text();
  if (new TextEncoder().encode(body).length > 250000) throw new SyntaxError('Request too large');
  return JSON.parse(body) as unknown;
}
