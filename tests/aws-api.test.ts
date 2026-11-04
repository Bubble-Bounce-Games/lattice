import { beforeEach, describe, expect, it } from 'vitest';
import {
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import { createHandler } from '../aws/api/handler';

// Exercise routing, real password hashing, tenant isolation, and conditional
// updates together. AWS integration remains a deployment smoke check.
class MemoryDb {
  items = new Map<string, Record<string, unknown>>();
  key(value: Record<string, unknown>) {
    return `${value.pk}|${value.sk}`;
  }
  async send(command: GetCommand | PutCommand | DeleteCommand | QueryCommand | UpdateCommand) {
    const input = command.input;
    if (command instanceof GetCommand)
      return { Item: this.items.get(this.key(command.input.Key!)) };
    if (command instanceof QueryCommand) {
      const values = command.input.ExpressionAttributeValues!;
      const items = [...this.items.values()]
        .filter(
          (item) => item.pk === values[':pk'] && String(item.sk).startsWith(values[':prefix']),
        )
        .sort((a, b) => String(a.sk).localeCompare(String(b.sk)));
      const start = command.input.ExclusiveStartKey
        ? items.findIndex((item) => item.sk === command.input.ExclusiveStartKey!.sk) + 1
        : 0;
      const page = items.slice(start, start + 1);
      return {
        Items: page,
        ...(start + 1 < items.length
          ? { LastEvaluatedKey: { pk: page[0].pk, sk: page[0].sk } }
          : {}),
      };
    }
    if (command instanceof UpdateCommand) {
      const key = this.key(command.input.Key!);
      const item = {
        ...this.items.get(key),
        attempts: Number(this.items.get(key)?.attempts ?? 0) + 1,
      };
      this.items.set(key, item);
      return { Attributes: item };
    }
    const mutation = input as PutCommand['input'] & DeleteCommand['input'];
    const key = this.key(mutation.Item ?? mutation.Key!);
    const previous = this.items.get(key);
    if (
      (mutation.ConditionExpression === 'attribute_not_exists(pk)' && previous) ||
      (mutation.ConditionExpression === '#version = :expected' &&
        (!previous || previous.version !== mutation.ExpressionAttributeValues?.[':expected']))
    ) {
      const error = new Error('Condition failed');
      error.name = 'ConditionalCheckFailedException';
      throw error;
    }
    if (command instanceof DeleteCommand) this.items.delete(key);
    else this.items.set(key, structuredClone(mutation.Item!));
    return {};
  }
}
const origin = 'https://lattice.abhijeet-anand.com';
const input = {
  title: 'A useful idea',
  sourceTag: 'Example',
  types: ['ARTICLE'],
  summary: 'Save this perspective.',
  link: '',
};
let db: MemoryDb;
let handler: ReturnType<typeof createHandler>;
function request(
  path: string,
  method = 'GET',
  body?: unknown,
  cookie?: string,
  requestOrigin = origin,
) {
  const [rawPath, rawQueryString] = path.split('?');
  return handler({
    rawPath,
    rawQueryString,
    requestContext: { http: { method, sourceIp: '127.0.0.1' } },
    headers: { origin: requestOrigin, 'content-type': 'application/json' },
    cookies: cookie ? [cookie] : [],
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}
async function signup(username: string) {
  const result = await request('/api/signup', 'POST', {
    username,
    password: 'long-private-password',
  });
  expect(result.statusCode).toBe(200);
  expect(result.cookies?.[0]).toContain('HttpOnly; Secure; SameSite=Strict');
  return result.cookies![0].split(';')[0];
}
beforeEach(() => {
  db = new MemoryDb();
  handler = createHandler(db as unknown as DynamoDBDocumentClient, 'test', origin);
});
describe('AWS private libraries', () => {
  it('rejects anonymous reads, writes, sources, and export', async () => {
    for (const path of ['/api/entries', '/api/entries/example', '/api/sources', '/api/export'])
      expect((await request(path)).statusCode).toBe(401);
    expect((await request('/api/entries', 'POST', input)).statusCode).toBe(401);
  });
  it('keeps each user’s CRUD, search, sources, and exports private', async () => {
    const alice = await signup('alice'),
      bob = await signup('bob');
    const created = await request('/api/entries', 'POST', input, alice);
    expect(created.statusCode).toBe(201);
    const entry = JSON.parse(created.body);
    expect(JSON.parse((await request('/api/entries', 'GET', undefined, bob)).body).total).toBe(0);
    expect((await request(`/api/entries/${entry.id}`, 'GET', undefined, bob)).statusCode).toBe(404);
    expect(
      (
        await request(
          `/api/entries/${entry.id}`,
          'PUT',
          { ...input, expectedUpdatedAt: entry.updatedAt },
          bob,
        )
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await request(
          `/api/entries/${entry.id}`,
          'DELETE',
          { expectedUpdatedAt: entry.updatedAt },
          bob,
        )
      ).statusCode,
    ).toBe(404);
    expect(JSON.parse((await request('/api/sources', 'GET', undefined, bob)).body)).toEqual([]);
    expect(JSON.parse((await request('/api/export', 'GET', undefined, bob)).body).entries).toEqual(
      [],
    );
    const exported = await request('/api/export', 'GET', undefined, alice);
    expect(exported.headers['cache-control']).toBe('no-store');
    expect(JSON.parse(exported.body).entries).toEqual([entry]);
  });
  it('preserves conditional edit/delete semantics and paginates DynamoDB queries', async () => {
    const cookie = await signup('alice');
    const first = JSON.parse((await request('/api/entries', 'POST', input, cookie)).body);
    await request(
      '/api/entries',
      'POST',
      { ...input, title: 'Second', sourceTag: 'example' },
      cookie,
    );
    expect(
      JSON.parse((await request('/api/entries?limit=1', 'GET', undefined, cookie)).body).total,
    ).toBe(2);
    expect(
      JSON.parse((await request('/api/sources', 'GET', undefined, cookie)).body)[0].count,
    ).toBe(2);
    expect(
      JSON.parse((await request('/api/entries?query=SECOND', 'GET', undefined, cookie)).body).total,
    ).toBe(1);
    expect(
      JSON.parse((await request('/api/entries?query=%25', 'GET', undefined, cookie)).body).total,
    ).toBe(0);
    const updated = await request(
      `/api/entries/${first.id}`,
      'PUT',
      { ...input, title: 'Edited', expectedUpdatedAt: first.updatedAt },
      cookie,
    );
    expect(updated.statusCode).toBe(200);
    expect(
      (
        await request(
          `/api/entries/${first.id}`,
          'PUT',
          { ...input, expectedUpdatedAt: first.updatedAt },
          cookie,
        )
      ).statusCode,
    ).toBe(409);
    expect(
      (
        await request(
          `/api/entries/${first.id}`,
          'DELETE',
          { expectedUpdatedAt: first.updatedAt },
          cookie,
        )
      ).statusCode,
    ).toBe(409);
    expect(
      (
        await request(
          `/api/entries/${first.id}`,
          'DELETE',
          { expectedUpdatedAt: JSON.parse(updated.body).updatedAt },
          cookie,
        )
      ).statusCode,
    ).toBe(200);
  });
  it('validates input and blocks cross-origin mutations', async () => {
    const cookie = await signup('alice');
    expect(
      (await request('/api/entries', 'POST', input, cookie, 'https://other.example')).statusCode,
    ).toBe(403);
    expect(
      (await request('/api/entries', 'POST', { ...input, title: '' }, cookie)).statusCode,
    ).toBe(400);
    expect(
      (await request('/api/signup', 'POST', { username: 'new', password: 'short' })).statusCode,
    ).toBe(400);
    expect(
      (
        await request('/api/signup', 'POST', {
          username: 'alice',
          password: 'another-long-password',
        })
      ).statusCode,
    ).toBe(409);
  });
  it('signs in, rejects wrong passwords, expires and revokes sessions', async () => {
    const original = await signup('alice');
    expect(
      (await request('/api/signin', 'POST', { username: 'alice', password: 'wrong' })).statusCode,
    ).toBe(401);
    const signedIn = await request('/api/signin', 'POST', {
      username: 'ALICE',
      password: 'long-private-password',
    });
    expect(signedIn.statusCode).toBe(200);
    const cookie = signedIn.cookies![0].split(';')[0];
    expect((await request('/api/signout', 'POST', {}, cookie)).statusCode).toBe(200);
    expect((await request('/api/session', 'GET', undefined, cookie)).statusCode).toBe(401);
    for (const item of db.items.values()) if (item.sk === 'SESSION') item.expiresAt = 0;
    expect((await request('/api/export', 'GET', undefined, original)).statusCode).toBe(401);
    expect((await request('/api/signout', 'POST', {}, original)).statusCode).toBe(200);
  });
  it('limits password attempts', async () => {
    for (let i = 0; i < 20; i++) await request('/api/signin', 'POST', {});
    expect((await request('/api/signin', 'POST', {})).statusCode).toBe(429);
  });
});
