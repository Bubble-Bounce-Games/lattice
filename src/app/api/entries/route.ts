import { getRepository } from '../../../db';
import { entryInputSchema, searchSchema } from '../../../features/knowledge/schemas/entry';
import { apiError, checkMutation, json, readJson } from '../../../lib/api';
export async function GET(request: Request) {
  try {
    return json(
      await getRepository().getEntries(
        searchSchema.parse(Object.fromEntries(new URL(request.url).searchParams)),
      ),
    );
  } catch (error) {
    return apiError(error);
  }
}
export async function POST(request: Request) {
  const blocked = checkMutation(request);
  if (blocked) return blocked;
  try {
    return json(
      await getRepository().createEntry(entryInputSchema.parse(await readJson(request))),
      201,
    );
  } catch (error) {
    return apiError(error);
  }
}
