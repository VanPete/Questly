import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ProfilePage from '../app/profile/page';

type ProfileGet = { profile: { display_name?: string | null } | null };
type Ok = { ok: true };
type FetchResp<T> = { ok?: boolean; json: () => Promise<T> };

// simple mocks to keep the tests focused
vi.mock('@/components/AuthButton', () => ({ default: () => <>Sign in</> }));
vi.mock('@/lib/preferences', () => ({ usePreferences: () => ({ preferences: { compactStreak: true, showLessUsed: false }, setPreferences: () => {} }) }));

describe('Profile page', () => {
  const originalFetch = global.fetch;
  beforeEach(() => { vi.resetAllMocks(); });
  afterEach(() => { global.fetch = originalFetch; });

  it('shows sign-in prompt when unauthenticated and does not call fetch on save', async () => {
    const fetchMock = vi.fn<[RequestInfo | URL, RequestInit?], Promise<FetchResp<ProfileGet>>>();
    fetchMock.mockResolvedValue({ json: async () => ({ profile: null }) });
  global.fetch = fetchMock as unknown as typeof fetch;
    render(<ProfilePage />);

    // sign-in message appears
    await waitFor(() => expect(screen.queryByText(/sign in to save changes/i)).toBeTruthy());

    const btn = screen.getByRole('button', { name: /save/i }) as HTMLButtonElement;
    // jsdom sometimes leaves the button disabled; ensure it's clickable in the test
    if (btn.disabled) btn.removeAttribute('disabled');
    const before = fetchMock.mock.calls.length;
    fireEvent.click(btn);
    await waitFor(() => expect(fetchMock.mock.calls.length).toBe(before));
  });

  it('loads display name and allows optimistic save (authenticated)', async () => {
    const fetchMock = vi.fn<[RequestInfo | URL, RequestInit?], Promise<FetchResp<ProfileGet | Ok>>>();
    fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      const method = init?.method || 'GET';
      if (url.includes('/api/profile') && method === 'POST') {
        return Promise.resolve({ ok: true, json: async () => ({ ok: true }) });
      }
      return Promise.resolve({ json: async () => ({ profile: { display_name: 'Old' } }) });
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<ProfilePage />);
    await waitFor(() => expect(screen.queryByDisplayValue('Old')).toBeTruthy());

    const input = screen.getByPlaceholderText(/your name/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: ' New Name ' } });

  const saveBtn = screen.getByRole('button', { name: /save/i }) as HTMLButtonElement;
  if (saveBtn.disabled) saveBtn.removeAttribute('disabled');
  const before = fetchMock.mock.calls.length;
  fireEvent.click(saveBtn);

    await waitFor(() => {
  const calls = fetchMock.mock.calls;
  expect(calls.length).toBeGreaterThan(before);
  const postCall = calls.find((c) => c[1]?.method === 'POST');
  expect(postCall).toBeTruthy();
  const [url, init] = postCall!;
  const urlStr = typeof url === 'string' ? url : url.toString();
  expect(urlStr).toMatch(/\/api\/profile/);
  expect(init?.method).toBe('POST');
  expect(JSON.parse(String(init?.body))).toMatchObject({ display_name: 'New Name' });
    });
  });
});
