import { env } from 'cloudflare:workers';
import { SqlKnowledgeRepository } from '../features/knowledge/repositories/knowledge-repository';
export function getRepository() {
  if (!env.DB) throw new Error('The knowledge database is unavailable.');
  return new SqlKnowledgeRepository(env.DB);
}
