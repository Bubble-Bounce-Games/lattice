import { getRepository } from '../../../db';
import { apiError, json } from '../../../lib/api';
export async function GET() {
  try {
    return json(await getRepository().getSources());
  } catch (error) {
    return apiError(error);
  }
}
