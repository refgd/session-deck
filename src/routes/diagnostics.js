import { createDiagnosticsReport } from '../services/diagnostics.js';
import { listRecentAuditEvents } from '../lib/audit-log.js';
import { noStoreResponse } from '../lib/response-headers.js';

export default async function diagnosticsRoutes(fastify) {
  fastify.get('/api/diagnostics', async (_request, reply) => {
    noStoreResponse(reply);
    return createDiagnosticsReport(fastify.db);
  });

  fastify.get('/api/audit-events', async (request, reply) => {
    noStoreResponse(reply);
    const limit = Math.max(1, Math.min(100, Number(request.query?.limit) || 50));
    return {
      events: listRecentAuditEvents(fastify.db, limit),
      limit,
    };
  });
}
