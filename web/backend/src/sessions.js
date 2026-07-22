import { randomUUID } from 'node:crypto';

/**
 * In-memory session registry. Holds no retrieval logic — just the lifecycle of
 * session objects keyed by id: { id, claudeSessionId, child, sseClients, startedAt, phase }.
 */
export function createRegistry() {
  const sessions = new Map();

  return {
    create(fields = {}) {
      const session = {
        id: randomUUID(),
        claudeSessionId: null,
        child: null,
        sseClients: new Set(),
        startedAt: Date.now(),
        phase: 'idle',
        ...fields,
      };
      sessions.set(session.id, session);
      return session;
    },
    get(id) {
      return sessions.get(id);
    },
    delete(id) {
      return sessions.delete(id);
    },
    list() {
      return [...sessions.values()];
    },
  };
}
