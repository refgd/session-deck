export function noStoreResponse(reply) {
  return reply
    .header('cache-control', 'no-store')
    .header('pragma', 'no-cache');
}
