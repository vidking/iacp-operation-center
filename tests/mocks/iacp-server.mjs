import { createServer } from 'node:http';

const server = createServer((request, response) => {
  response.setHeader('content-type', 'application/json');
  if (request.url === '/health/live' || request.url === '/health/ready') {
    response.end(JSON.stringify({ status: 'ok' }));
    return;
  }
  if (request.url?.startsWith('/v1/events')) {
    response.end(JSON.stringify({ items: [], next_cursor: null }));
    return;
  }
  if (request.url === '/v1/observability') {
    response.end(JSON.stringify({ worker_liveness: 'unknown', dependencies: null }));
    return;
  }
  response.statusCode = 404;
  response.end(JSON.stringify({ detail: 'fixture path not published' }));
});

server.listen(9100, '0.0.0.0');
