'use client';
import { useEffect } from 'react';
import { useUser } from '@clerk/nextjs';

// After Clerk finishes sign in (redirect back to /), some server-rendered content
// may reflect anonymous state. This component forces a one-time soft refresh
// once a signed-in user is detected client-side.
export default function ClientSigninRefresh() {
  const { isSignedIn } = useUser();
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!isSignedIn) return;
    // Prevent infinite loop
    if (sessionStorage.getItem('questly_post_signin_refreshed')) return;
    sessionStorage.setItem('questly_post_signin_refreshed','1');
    // Small delay to allow other hydration (e.g. premium tag) before reload
    setTimeout(() => {
      try { window.location.reload(); } catch {}
    }, 120);
  }, [isSignedIn]);
  return null;
}
