import { NextResponse } from 'next/server';
import { demoTopics } from '@/lib/demoData';
import { getAdminClient } from '@/lib/supabaseAdmin';
import { getSupabaseUserIdFromClerk } from '@/lib/authBridge';

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
  // Prefer DB-driven daily topics; fallback to demo if not configured
  const supabase = getAdminClient();
  // Use America/New_York to match rotation job and avoid UTC off-by-one
  const today = todayInTimeZoneISODate('America/New_York');
  const debug = new URL(request.url).searchParams.get('debug') === '1';
  // We will fetch ordered topic ids via DB helper function

  // Check subscription (premium) via DB helper
  const userId = await getSupabaseUserIdFromClerk();
  const { data: isPremium } = userId
    ? await supabase.rpc('is_premium', { p_user_id: userId })
    : { data: false } as { data: boolean };

  // Try DB helper first; if unavailable/empty, fall back to daily_topics
  let wanted: string[] = [];
  let debugReason: string | undefined;
  let rpcError: string | null = null;
  try {
    const { data: idList, error: rpcErr } = await supabase.rpc('get_daily_topic_ids', { p_date: today, p_is_premium: isPremium });
    if (!rpcErr && Array.isArray(idList) && idList.length > 0) {
      // Filter out null/empty values before treating as a usable list
      const filtered = (idList as unknown[]).filter((v): v is string => typeof v === 'string' && v.trim().length > 0);
      if (filtered.length > 0) {
        wanted = filtered;
      } else if (filtered.length === 0) {
        debugReason = 'rpc_returned_only_null_or_empty';
      }
    } else if (rpcErr) {
      rpcError = rpcErr.message;
      debugReason = 'rpc_error';
    }
  } catch (e: unknown) {
    rpcError = (e instanceof Error && e.message) ? e.message : 'rpc_throw';
    debugReason = 'rpc_exception';
  }

  if (wanted.length === 0) {
    // Fallback path: read daily_topics directly
    const { data: daily, error: dailyErr } = await supabase
      .from('daily_topics')
      .select('free_beginner_id, free_intermediate_id, free_advanced_id, premium_beginner_id, premium_intermediate_id, premium_advanced_id')
      .eq('date', today)
      .maybeSingle();
    if (dailyErr && !debugReason) {
      debugReason = dailyErr.message.includes('permission denied') ? 'daily_select_permission_denied' : 'daily_select_error';
      rpcError = rpcError || dailyErr.message;
    }
    if (daily) {
      const freeIds = [daily.free_beginner_id, daily.free_intermediate_id, daily.free_advanced_id].filter((v: unknown): v is string => typeof v === 'string' && v.trim().length > 0);
      const premiumIds = [daily.premium_beginner_id, daily.premium_intermediate_id, daily.premium_advanced_id].filter((v: unknown): v is string => typeof v === 'string' && v.trim().length > 0);
      if (freeIds.length > 0) {
        wanted = isPremium ? [...freeIds, ...premiumIds] : freeIds;
      } else {
        debugReason = 'daily_row_present_but_no_free_ids';
      }
    } else {
      debugReason = debugReason || 'no_daily_row_for_date';
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
    if (tiles.length > 0) return NextResponse.json({ tiles, meta: { source: 'function_or_direct', debug: debug ? { today, isPremium, via: 'rpc_or_direct', wanted, rpcError, userId, debugReason } : undefined } });
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
          if (tiles.length > 0) return NextResponse.json({ tiles, meta: { source: 'deterministic-fallback', debug: debug ? { today, isPremium, via: 'deterministic', wanted, rpcError, userId, debugReason } : undefined } });
        }
      }
    }
  } catch {}

  // Fallback: 1 Beginner, 1 Intermediate, 1 Advanced
  const pick = (difficulty: string) => demoTopics.filter(t => t.difficulty === difficulty)[0];
  const tiles = [pick('Beginner'), pick('Intermediate'), pick('Advanced')].filter(Boolean);
  return NextResponse.json({ tiles, meta: { source: 'demo-fallback', debug: debug ? { today, isPremium, via: 'demo', wanted, rpcError, userId, debugReason } : undefined } });
}
