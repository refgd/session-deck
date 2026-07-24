export async function mapWithConcurrency(items, limit, mapper) {
  const normalizedLimit = Math.max(1, Math.min(items.length || 1, parseInt(limit, 10) || 1));
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await mapper(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: normalizedLimit }, () => worker()));
  return results;
}
