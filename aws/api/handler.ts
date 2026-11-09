import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { Buffer } from 'node:buffer';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { z } from 'zod';
import { DynamoKnowledgeRepository } from './repository';
import { importSchema } from './import';
import {
  entryDeleteSchema,
  entryInputSchema,
  entryUpdateSchema,
  searchSchema,
} from '../../src/features/knowledge/schemas/entry';
import { apiError, json } from '../../src/lib/api';

type Event = {
  rawPath: string;
  rawQueryString?: string;
  headers?: Record<string, string | undefined>;
  cookies?: string[];
  body?: string;
  isBase64Encoded?: boolean;
  requestContext: { http: { method: string; sourceIp?: string } };
};
const passwordKey = promisify(scrypt);
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const cookieName = '__Host-lattice-session';
const legacyCredentials = z
  .object({
    username: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9._-]{3,40}$/),
    password: z.string().min(1).max(128),
  })
  .strict();
const emailCredentials = z
  .object({
    email: z.string().trim().toLowerCase().max(254).pipe(z.email()),
    password: z.string().min(1).max(128),
  })
  .strict();
const credentials = z.union([
  emailCredentials.transform(({ email, password }) => ({
    username: email,
    password,
    isEmail: true,
  })),
  legacyCredentials.transform((value) => ({ ...value, isEmail: false })),
]);
class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export function createHandler(db: DynamoDBDocumentClient, table: string, origin: string) {
  async function get(pk: string, sk: string) {
    return (
      await db.send(new GetCommand({ TableName: table, Key: { pk, sk }, ConsistentRead: true }))
    ).Item;
  }
  async function response(event: Event): Promise<Response> {
    const method = event.requestContext.http.method;
    const path = event.rawPath;
    const mutation = !['GET', 'HEAD'].includes(method);
    if (mutation && event.headers?.origin !== origin)
      throw new HttpError(403, 'This request is not allowed.');
    if (mutation && !event.headers?.['content-type']?.startsWith('application/json'))
      throw new HttpError(415, 'Expected a JSON request.');
    const raw = event.body
      ? Buffer.from(event.body, event.isBase64Encoded ? 'base64' : 'utf8').toString('utf8')
      : '{}';
    if (Buffer.byteLength(raw) > 250000) throw new HttpError(413, 'Request too large.');
    const body = mutation ? JSON.parse(raw) : undefined;
    if (method === 'POST' && ['/api/signup', '/api/signin'].includes(path)) {
      // Bound expensive password hashing per source IP per minute. Expiry is
      // checked by the key's time window; delayed DynamoDB TTL is harmless.
      const minute = Math.floor(Date.now() / 60000);
      const attempts = await db.send(
        new UpdateCommand({
          TableName: table,
          Key: {
            pk: `RATE#${digest(event.requestContext.http.sourceIp ?? 'unknown')}#${minute}`,
            sk: 'AUTH',
          },
          UpdateExpression: 'SET expiresAt = :expiry ADD attempts :one',
          ExpressionAttributeValues: { ':expiry': (minute + 2) * 60, ':one': 1 },
          ReturnValues: 'UPDATED_NEW',
        }),
      );
      if ((attempts.Attributes?.attempts ?? 0) > 20)
        throw new HttpError(429, 'Too many attempts. Please wait a minute.');
      const parsed = credentials.safeParse(body);
      if (!parsed.success) throw new HttpError(400, 'Enter a valid email address and password.');
      const { username, password, isEmail } = parsed.data;
      const userKey = `USER#${username}`;
      let user = await get(userKey, 'PROFILE');
      const explicitSignup = path === '/api/signup';
      if (explicitSignup || (!user && isEmail)) {
        const minimum = isEmail ? 8 : 12;
        if (password.length < minimum)
          throw new HttpError(400, `Use a password with at least ${minimum} characters.`);
        const salt = Buffer.from(randomBytes(16)).toString('hex');
        const hash = Buffer.from((await passwordKey(password, salt, 64)) as Uint8Array).toString(
          'hex',
        );
        user = {
          pk: userKey,
          sk: 'PROFILE',
          username,
          userId: randomUUID(),
          salt,
          passwordHash: hash,
        };
        try {
          await db.send(
            new PutCommand({
              TableName: table,
              Item: user,
              ConditionExpression: 'attribute_not_exists(pk)',
            }),
          );
        } catch (error) {
          if (!(error instanceof Error && error.name === 'ConditionalCheckFailedException'))
            throw error;
          if (explicitSignup) throw new HttpError(409, 'That username is taken.');
          // Two first-time requests can race. Use the stored profile and check
          // its password rather than replacing another request's credentials.
          user = await get(userKey, 'PROFILE');
        }
      }
      if (!explicitSignup) {
        // Hash even for unknown usernames to avoid an inexpensive username probe.
        const hash = (await passwordKey(password, user?.salt ?? 'unknown-user-salt', 64)) as Buffer;
        const expected = Buffer.from(user?.passwordHash ?? '00'.repeat(64), 'hex');
        if (!user || hash.length !== expected.length || !timingSafeEqual(hash, expected))
          throw new HttpError(401, 'Email or password is wrong.');
      }
      const token = Buffer.from(randomBytes(32)).toString('base64url');
      const lifetime = 30 * 86400;
      await db.send(
        new PutCommand({
          TableName: table,
          Item: {
            pk: `SESSION#${digest(token)}`,
            sk: 'SESSION',
            userId: user!.userId,
            username,
            expiresAt: Math.floor(Date.now() / 1000) + lifetime,
          },
        }),
      );
      const result = json({ username });
      result.headers.set(
        'Set-Cookie',
        `${cookieName}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${lifetime}`,
      );
      return result;
    }
    const cookies = (event.cookies ?? [event.headers?.cookie ?? '']).join('; ');
    const token = cookies
      .split(';')
      .map((value) => value.trim())
      .find((value) => value.startsWith(`${cookieName}=`))
      ?.slice(cookieName.length + 1);
    const session =
      token && /^[A-Za-z0-9_-]{43}$/.test(token)
        ? await get(`SESSION#${digest(token)}`, 'SESSION')
        : null;
    if (method === 'POST' && path === '/api/signout') {
      if (session)
        await db.send(
          new DeleteCommand({
            TableName: table,
            Key: { pk: `SESSION#${digest(token!)}`, sk: 'SESSION' },
          }),
        );
      const result = json({ ok: true });
      result.headers.set(
        'Set-Cookie',
        `${cookieName}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`,
      );
      return result;
    }
    if (!session || session.expiresAt <= Math.floor(Date.now() / 1000))
      throw new HttpError(401, 'Your session expired. Sign in again.');
    if (method === 'GET' && path === '/api/session') return json({ username: session.username });
    const repository = new DynamoKnowledgeRepository(db, table, session.userId);
    if (method === 'POST' && path === '/api/import') {
      const { entries } = importSchema.parse(body);
      const results = [];
      for (const entry of entries) results.push(await repository.importEntry(entry));
      return json({
        imported: results.filter((result) => result === 'imported').length,
        skipped: results.filter((result) => result === 'skipped').length,
      });
    }
    if (path === '/api/entries') {
      if (method === 'GET')
        return json(
          await repository.getEntries(
            searchSchema.parse(Object.fromEntries(new URLSearchParams(event.rawQueryString))),
          ),
        );
      if (method === 'POST')
        return json(await repository.createEntry(entryInputSchema.parse(body)), 201);
    }
    const match = /^\/api\/entries\/([a-zA-Z0-9-]{1,80})$/.exec(path);
    if (match) {
      const id = match[1];
      if (method === 'GET') {
        const entry = await repository.getEntry(id);
        return entry ? json(entry) : json({ error: 'Entry not found.' }, 404);
      }
      if (method === 'PUT') {
        const { expectedUpdatedAt, ...input } = entryUpdateSchema.parse(body);
        return json(await repository.updateEntry(id, input, expectedUpdatedAt));
      }
      if (method === 'DELETE') {
        await repository.deleteEntry(id, entryDeleteSchema.parse(body).expectedUpdatedAt);
        return json({ deleted: true });
      }
    }
    if (method === 'GET' && path === '/api/sources') return json(await repository.getSources());
    if (method === 'GET' && path === '/api/export') {
      const result = json({
        version: 1,
        exportedAt: new Date().toISOString(),
        entries: await repository.exportEntries(),
      });
      result.headers.set('Content-Disposition', 'attachment; filename="lattice-library.json"');
      return result;
    }
    return json({ error: 'Not found.' }, 404);
  }
  return async (event: Event) => {
    let result: Response;
    try {
      result = await response(event);
    } catch (error) {
      result =
        error instanceof HttpError ? json({ error: error.message }, error.status) : apiError(error);
    }
    const headers = Object.fromEntries([...result.headers].filter(([key]) => key !== 'set-cookie'));
    const cookie = result.headers.get('set-cookie');
    return {
      statusCode: result.status,
      headers,
      ...(cookie ? { cookies: [cookie] } : {}),
      body: await result.text(),
    };
  };
}

export const handler = createHandler(
  DynamoDBDocumentClient.from(new DynamoDBClient({})),
  process.env.TABLE_NAME ?? '',
  process.env.WEBSITE_ORIGIN ?? '',
);
