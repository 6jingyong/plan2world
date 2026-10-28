/** Provider-reported values only. Cached/reasoning counts are subsets, never
 * added to totals. JSON bytes and estimates are deliberately not token counts.
 * @param {any} raw */
export function observationUsage(raw) {
  const count = (/** @type {any} */ n) => Number.isSafeInteger(n) && n >= 0 ? n : null;
  return {
    inputTokens: count(raw?.prompt_tokens), outputTokens: count(raw?.completion_tokens), totalTokens: count(raw?.total_tokens),
    cachedTokens: count(raw?.prompt_tokens_details?.cached_tokens), reasoningTokens: count(raw?.completion_tokens_details?.reasoning_tokens),
    cost: typeof raw?.cost === 'number' && Number.isFinite(raw.cost) && raw.cost >= 0 ? raw.cost : null,
  };
}

/** @param {any[]} stages */
export function summarizeObservationUsage(stages) {
  const snapshot=stages.map(s=>({...s,usage:{...s.usage}}));
  const requests = snapshot.filter(s => s.status !== 'reused');
  return { stages:snapshot, requestsStarted: requests.length,
    cost: requests.every(s => s.usage.cost !== null) ? requests.reduce((sum, s) => sum + s.usage.cost, 0) : null };
}
