import { NextResponse } from 'next/server';
import { demoTopics } from '@/lib/demoData';
import { getAdminClient } from '@/lib/supabaseAdmin';
import { getSupabaseUserIdFromClerk } from '@/lib/authBridge';

// Ensure Node.js runtime so server-only env (service role key) is available.
export const runtime = 'nodejs';

function todayInTimeZoneISODate(tz: string) {
  const now = new Date();
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return fmt.format(now); // en-CA yields YYYY-MM-DD
}

export async function GET(request: Request) {
  const supabase = getAdminClient();
  // Diagnostic metadata from admin client (see supabaseAdmin.ts)
  interface KeyMeta { usedService: boolean; role?: string; disableService: boolean }
  const keyMeta = (supabase as unknown as { __questlyKeyMeta?: KeyMeta }).__questlyKeyMeta || null;
  const today = todayInTimeZoneISODate('America/New_York');
  const debug = new URL(request.url).searchParams.get('debug') === '1';
  const userId = await getSupabaseUserIdFromClerk();

  // Premium detection safe wrapper.
  let isPremium = false;
  let premiumError: string | undefined;
  if (userId) {
    try {
      const { data, error } = await supabase.rpc('is_premium', { p_user_id: userId });
      if (!error && typeof data === 'boolean') isPremium = data; else if (error) premiumError = error.message;
    } catch (e) {
      premiumError = e instanceof Error ? e.message : 'premium_check_exception';
    }
  }

  let wanted: string[] = [];
  let debugReason: string | undefined;
  let rpcError: string | null = null;
  let dailySelectError: string | null = null;

  // Primary: direct public row (policy should allow). Ordering already B,I,A,(premium B,I,A)
  try {
    const { data: daily, error: dailyErr } = await supabase
      .from('daily_topics')
      .select('free_beginner_id, free_intermediate_id, free_advanced_id, premium_beginner_id, premium_intermediate_id, premium_advanced_id')
      .eq('date', today)
      .maybeSingle();
    if (dailyErr) {
      debugReason = dailyErr.message.includes('permission denied') ? 'daily_select_permission_denied' : 'daily_select_error';
      rpcError = dailyErr.message;
      dailySelectError = dailyErr.message;
      // Auto-fallback: If we used a service key that is mis-scoped (permission denied) try anon key transparently.
      if (keyMeta?.usedService && dailyErr.message.includes('permission denied')) {
        try {
          const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
          const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
          if (anonKey && url) {
            const { createClient } = await import('@supabase/supabase-js');
            const anonClient = createClient(url, anonKey, { auth: { persistSession: false } });
            const { data: dailyAnon, error: dailyAnonErr } = await anonClient
              .from('daily_topics')
              .select('free_beginner_id, free_intermediate_id, free_advanced_id, premium_beginner_id, premium_intermediate_id, premium_advanced_id')
              .eq('date', today)
              .maybeSingle();
            if (!dailyAnonErr && dailyAnon) {
              debugReason = 'service_denied_fell_back_to_anon';
              const freeIds = [dailyAnon.free_beginner_id, dailyAnon.free_intermediate_id, dailyAnon.free_advanced_id].filter((v: unknown): v is string => typeof v === 'string' && v.trim().length > 0);
              const premiumIds = [dailyAnon.premium_beginner_id, dailyAnon.premium_intermediate_id, dailyAnon.premium_advanced_id].filter((v: unknown): v is string => typeof v === 'string' && v.trim().length > 0);
              if (freeIds.length > 0) {
                wanted = isPremium ? [...freeIds, ...premiumIds] : freeIds;
              }
            }
          }
        } catch {
          // ignore fallback errors
        }
      }
    } else if (daily) {
      const freeIds = [daily.free_beginner_id, daily.free_intermediate_id, daily.free_advanced_id].filter((v: unknown): v is string => typeof v === 'string' && v.trim().length > 0);
      const premiumIds = [daily.premium_beginner_id, daily.premium_intermediate_id, daily.premium_advanced_id].filter((v: unknown): v is string => typeof v === 'string' && v.trim().length > 0);
      if (freeIds.length > 0) {
        wanted = isPremium ? [...freeIds, ...premiumIds] : freeIds;
      } else {
        debugReason = 'daily_row_present_but_no_free_ids';
      }
    } else {
      debugReason = 'no_daily_row_for_date';
    }
  } catch (e) {
    debugReason = 'daily_select_exception';
    rpcError = e instanceof Error ? e.message : 'daily_exception';
  }

  // Secondary: only if row path failed entirely & we have service role, try RPC function (for parity) to see if it works.
  if (wanted.length === 0) {
    try {
      const { data: idList, error: rpcErr2 } = await supabase.rpc('get_daily_topic_ids', { p_date: today, p_is_premium: isPremium });
      if (!rpcErr2 && Array.isArray(idList) && idList.length > 0) {
        const filtered = (idList as unknown[]).filter((v): v is string => typeof v === 'string' && v.trim().length > 0);
        if (filtered.length > 0) {
          wanted = filtered;
          debugReason = debugReason || 'used_rpc_after_row_fail';
        }
      } else if (rpcErr2) {
        rpcError = rpcError || rpcErr2.message;
        debugReason = debugReason || 'rpc_error';
      }
    } catch (e) {
      rpcError = rpcError || (e instanceof Error ? e.message : 'rpc_throw');
      debugReason = debugReason || 'rpc_exception';
    }
  }

  if (wanted.length > 0) {
    const { data: topicsRows } = await supabase
      .from('topics')
      .select('id,title,blurb,difficulty,domain,angles,seed_context')
      .in('id', wanted)
      .limit(500);
    const map = new Map((topicsRows || []).map(r => [r.id as string, r] as const));
    // Preserve order from DB function: [B, I, A, extra B, extra I, extra A]
    const tiles = wanted
      .map(id => map.get(id))
      .filter(Boolean)
      .map(r => ({ id: r!.id as string, title: r!.title as string, blurb: r!.blurb as string, difficulty: r!.difficulty as string }));
  if (tiles.length > 0) return NextResponse.json({ tiles, meta: { source: 'row-or-rpc', debug: debug ? { today, isPremium, via: 'row_or_rpc', wanted, rpcError, dailySelectError, userId, debugReason, premiumError, keyMeta } : undefined } });
    debugReason = debugReason || 'topics_lookup_empty_for_wanted_ids';
  }

  // Extra hardening: if we still have nothing, synthesize 1 per difficulty from active topics deterministically by date
  try {
    const { data: all } = await supabase
      .from('topics')
      .select('id,difficulty')
      .eq('is_active', true)
      .limit(2000);
    if (all && all.length > 0) {
      const byDiff: Record<string, string[]> = { Beginner: [], Intermediate: [], Advanced: [] };
      for (const t of all as Array<{ id: string; difficulty: string }>) {
        if (t.difficulty === 'Beginner') byDiff.Beginner.push(t.id);
        if (t.difficulty === 'Intermediate') byDiff.Intermediate.push(t.id);
        if (t.difficulty === 'Advanced') byDiff.Advanced.push(t.id);
      }
      const hashPick = (arr: string[], salt: string) => {
        if (!arr.length) return undefined;
        const s = `${today}-${salt}`;
        let h = 0;
        for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
        const idx = Math.abs(h) % arr.length;
        return arr[idx];
      };
      const primaryBegin = hashPick(byDiff.Beginner, 'B');
      const primaryInter = hashPick(byDiff.Intermediate, 'I');
      const primaryAdv = hashPick(byDiff.Advanced, 'A');
      const primaries = [primaryBegin, primaryInter, primaryAdv].filter(Boolean) as string[];
      if (primaries.length > 0) {
        let extras: string[] = [];
        if (isPremium) {
          const altPick = (arr: string[], avoid: string | undefined, salt: string) => {
            if (!arr.length) return undefined;
            if (arr.length === 1) return arr[0] === avoid ? undefined : arr[0];
            const s = `${today}-extra-${salt}`;
            let h = 0;
            for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
            let idx = Math.abs(h) % arr.length;
            // ensure not the same as primary
            if (arr[idx] === avoid) idx = (idx + 1) % arr.length;
            return arr[idx];
          };
          const eB = altPick(byDiff.Beginner, primaryBegin, 'B');
          const eI = altPick(byDiff.Intermediate, primaryInter, 'I');
          const eA = altPick(byDiff.Advanced, primaryAdv, 'A');
          extras = [eB, eI, eA].filter(Boolean) as string[];
        }
        const orderedPrim = [primaryBegin, primaryInter, primaryAdv].filter(Boolean) as string[];
        wanted = isPremium ? [...orderedPrim, ...extras] : orderedPrim;
        if (wanted.length > 0) {
          const { data: topicsRows } = await supabase
            .from('topics')
            .select('id,title,blurb,difficulty,domain,angles,seed_context')
            .in('id', wanted)
            .limit(500);
          const map = new Map((topicsRows || []).map(r => [r.id as string, r] as const));
          const tiles = wanted
            .map(id => map.get(id))
            .filter(Boolean)
            .map(r => ({ id: r!.id as string, title: r!.title as string, blurb: r!.blurb as string, difficulty: r!.difficulty as string }));
          if (tiles.length > 0) return NextResponse.json({ tiles, meta: { source: 'deterministic-fallback', debug: debug ? { today, isPremium, via: 'deterministic', wanted, rpcError, dailySelectError, userId, debugReason, premiumError, keyMeta } : undefined } });
        }
      }
    }
  } catch {}

  // Fallback: 1 Beginner, 1 Intermediate, 1 Advanced
  const pick = (difficulty: string) => demoTopics.filter(t => t.difficulty === difficulty)[0];
  const tiles = [pick('Beginner'), pick('Intermediate'), pick('Advanced')].filter(Boolean);
  return NextResponse.json({ tiles, meta: { source: 'demo-fallback', debug: debug ? { today, isPremium, via: 'demo', wanted, rpcError, dailySelectError, userId, debugReason, premiumError, keyMeta } : undefined } });
}
