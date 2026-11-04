import { getRepository } from '../../../db';
import { apiError } from '../../../lib/api';
export async function GET() {
  try {
    return new Response(
      JSON.stringify(
        {
          version: 1,
          exportedAt: new Date().toISOString(),
          entries: await getRepository().exportEntries(),
        },
        null,
        2,
      ),
      {
        headers: {
          'Content-Type': 'application/json',
          'Content-Disposition': 'attachment; filename="lattice-library.json"',
          'Cache-Control': 'no-store',
        },
      },
    );
  } catch (error) {
    return apiError(error);
  }
}
