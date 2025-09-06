"use client";
import { useEffect } from 'react';

// After hydration, re-fetch subscription to correct any server-side cache/auth miss.
export default function LandingPremiumHydrator() {
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/subscription', { credentials: 'include' });
        if (!res.ok) return;
        const { plan } = await res.json();
        if (cancelled) return;
        if (plan === 'premium') {
          const root = document.querySelector('[data-questly-premium-root]');
          if (!root) return;
          // Replace upgrade button with active badge if still present
            const upgradeBtn = Array.from(root.querySelectorAll('a,span,button')).find(el => /premium/i.test(el.textContent || '') && el.tagName === 'A');
          if (upgradeBtn) {
            const badge = document.createElement('span');
            badge.className = 'px-5 py-3 rounded-2xl bg-gradient-to-r from-emerald-400 via-emerald-500 to-emerald-600 text-white border border-emerald-600/30 shadow-sm select-none';
            badge.textContent = 'Premium Active';
            upgradeBtn.replaceWith(badge);
          }
          // Update quest line text if still 3
          const tagline = document.querySelector('[data-questly-premium-tagline]');
          if (tagline && /3 Daily Quests/.test(tagline.textContent || '')) {
            tagline.textContent = '6 Daily Quests. Challenge your mind.';
          }
        }
      } catch {/* ignore */}
    })();
    return () => { cancelled = true; };
  }, []);
  return null;
}