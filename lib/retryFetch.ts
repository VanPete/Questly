/**
 * retryFetch: Lightweight fetch wrapper with exponential backoff.
 * - Retries only on network errors or 5xx responses (configurable).
 * - Does not retry on 4xx except 408/429.
 */
export interface RetryFetchOptions extends RequestInit {
  retries?: number;
  backoffMs?: number; // initial backoff
  retryOnStatuses?: number[]; // explicit additional statuses
  signal?: AbortSignal;
}

export async function retryFetch(url: string, options: RetryFetchOptions = {}) {
  const {
    retries = 3,
    backoffMs = 300,
    retryOnStatuses = [500,502,503,504,408,429],
    signal,
    ...rest
  } = options;

  let attempt = 0;
  let lastErr: unknown;
  while (attempt <= retries) {
    if (signal?.aborted) throw new DOMException('Aborted','AbortError');
    try {
      const res = await fetch(url, { ...rest, signal });
      if (!res.ok && retryOnStatuses.includes(res.status) && attempt < retries) {
        await delay(backoffMs * Math.pow(2, attempt));
        attempt++; continue;
      }
      return res;
    } catch (e) {
      lastErr = e;
      if (attempt >= retries) throw e;
      await delay(backoffMs * Math.pow(2, attempt));
      attempt++;
    }
  }
  throw lastErr;
}

function delay(ms: number) { return new Promise(r => setTimeout(r, ms)); }
