import { describe, it, expect, vi } from 'vitest';
import { retryFetch } from '@/lib/retryFetch';

describe('retryFetch', () => {
  it('returns immediately on 200', async () => {
    const fn = vi.fn().mockResolvedValue(new Response('ok', { status: 200 }));
    global.fetch = fn;
    const r = await retryFetch('http://x.test');
    expect(r.status).toBe(200);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on 500 then succeeds', async () => {
    const fn = vi.fn()
      .mockResolvedValueOnce(new Response('fail', { status: 500 }))
      .mockResolvedValueOnce(new Response('ok', { status: 200 }));
    global.fetch = fn;
    const r = await retryFetch('http://y.test', { retries: 2, backoffMs: 5 });
    expect(r.status).toBe(200);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('returns final failing response (does not throw) after retries exhausted on non-network error', async () => {
    const fn = vi.fn().mockResolvedValue(new Response('err', { status: 502 }));
    global.fetch = fn;
    const r = await retryFetch('http://z.test', { retries: 1, backoffMs: 5 });
    expect(r.status).toBe(502);
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
