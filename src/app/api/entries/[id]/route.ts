import { getRepository } from '../../../../db';
import { entryUpdateSchema, entryDeleteSchema } from '../../../../features/knowledge/schemas/entry';
import { apiError, checkMutation, json, readJson } from '../../../../lib/api';
type Context = { params: Promise<{ id: string }> };
export async function GET(_request: Request, context: Context) {
  try {
    const { id } = await context.params;
    const entry = await getRepository().getEntry(id);
    return entry ? json(entry) : json({ error: 'Entry not found.' }, 404);
  } catch (error) {
    return apiError(error);
  }
}
export async function PUT(request: Request, context: Context) {
  const blocked = checkMutation(request);
  if (blocked) return blocked;
  try {
    const { id } = await context.params;
    const { expectedUpdatedAt, ...input } = entryUpdateSchema.parse(await readJson(request));
    return json(await getRepository().updateEntry(id, input, expectedUpdatedAt));
  } catch (error) {
    return apiError(error);
  }
}
export async function DELETE(request: Request, context: Context) {
  const blocked = checkMutation(request);
  if (blocked) return blocked;
  try {
    const { id } = await context.params;
    const { expectedUpdatedAt } = entryDeleteSchema.parse(await readJson(request));
    await getRepository().deleteEntry(id, expectedUpdatedAt);
    return json({ deleted: true });
  } catch (error) {
    return apiError(error);
  }
}
