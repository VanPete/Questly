'use client';
import { useEffect, useState, useRef } from 'react';
import Image from 'next/image';
import { track } from '@vercel/analytics';
import { demoQuestionBank } from '@/lib/demoQuestions';
import { useRouter } from 'next/navigation';
import type { Topic as TopicType } from '@/lib/types';
import { useUser } from '@clerk/nextjs';
import dynamic from 'next/dynamic';
import { retryFetch } from '@/lib/retryFetch';
const ChatPane = dynamic(() => import('./ChatPane').then(mod => {
  try { track('chat_lazy_loaded'); } catch {}
  return mod;
}), {
  loading: () => <div className="text-sm text-neutral-500 animate-pulse">Loading chat...</div>,
  ssr: false
});

// Utility to break a summary into bullet points (fallback to single paragraph)
function toBullets(text: string, max = 5): string[] {
  if (!text) return [];
  const parts = text
    .replace(/\s+/g, ' ')
    .split(/[.!?]\s+/)
    .map(s => s.trim())
    .filter(Boolean);
  const filtered = parts.slice(0, max);
  // If most sentences are very short, keep as paragraph instead
  const avg = filtered.reduce((a, b) => a + b.length, 0) / (filtered.length || 1);
  if (filtered.length <= 1 || avg < 25) return [];
  return filtered;
}

type Question = { q: string; options: string[]; correct_index: number; chosen_index?: number };

const todayDate = () => new Date().toISOString().slice(0, 10);

export default function TopicFlow({ topic, onCompleted }: { topic: TopicType; onCompleted?: () => void }) {
  const [step, setStep] = useState<'quiz' | 'summary'>('quiz');
  const seed = demoQuestionBank[topic.id];
  const [quiz, setQuiz] = useState<Question[]>([]);
  const { user } = useUser();
  const [lockedAttempt, setLockedAttempt] = useState(false); // lock UI to review if an attempt already exists
  const [reloadKey, setReloadKey] = useState(0); // manual retry trigger
  const [slowLoad, setSlowLoad] = useState(false); // flag when loading exceeds threshold
  // Include date in storage keys to enforce single attempt per topic per day
  const guestKey = (id: string) => `questly:attempt:${id}:${todayDate()}`;
  const draftKey = (id: string) => `questly:attempt-draft:${id}:${todayDate()}`; // partial progress
  const summaryKey = (id: string) => `questly:summary:${id}`; // generic summary cached once per topic (shared ok)
  const scoreKey = (id: string) => `questly:score:${id}:${todayDate()}`; // score per day
  const restoredRef = useRef(false); // prevent generation overwrite flicker
  const [score, setScore] = useState(0);
  const [points, setPoints] = useState<{
    gained: number; bonus: number; multiplier: number; streak?: number; capped?: boolean;
    quest_number?: number; quest_base_bonus?: number; streak_bonus?: number; daily_cap?: number; remaining_before?: number; remaining_after?: number;
    guest?: boolean; // mark locally computed guest points
  } | null>(null);
  const [daily, setDaily] = useState<{ total_points: number; quests: Array<{ topic_id: string; title: string; points: number; questNumber: number }>; streak?: number; isPremium?: boolean } | null>(null);
  const [dailyLoading, setDailyLoading] = useState(false);
  const fetchedDailyRef = useRef(false);
  const [summaryText, setSummaryText] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const quizGroupRefs = useRef<Record<number, HTMLDivElement | null>>({});
  // Check for an existing attempt when signed-in and switch to summary if found
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        // Prioritize server attempt for signed-in users
        const r = await fetch(`/api/quiz?topic_id=${encodeURIComponent(topic.id)}`, { credentials: 'include' });
        const j = await r.json().catch(() => ({}));
        if (active && r.ok && j?.attempt && Array.isArray(j.attempt.answers) && j.attempt.answers.length) {
          // Build quiz state from saved answers; chosen_index comes from DB
          type SavedAnswer = { question: string; options: string[]; correct_index: number; chosen_index: number };
          const rebuilt: Question[] = (j.attempt.answers as SavedAnswer[]).map(a => ({ q: a.question, options: a.options, correct_index: a.correct_index, chosen_index: a.chosen_index }));
          setQuiz(rebuilt);
          setScore(j.attempt.score || 0);
          if (typeof window !== 'undefined') {
            try { const cachedSummary = window.localStorage.getItem(summaryKey(topic.id)); if (cachedSummary) setSummaryText(cachedSummary); } catch {}
          }
          setStep('summary');
          setLockedAttempt(true);
          // Derive points breakdown from daily aggregate (approximation) so banner shows +points immediately when revisiting
          fetch(`/api/progress/daily?date=${todayDate()}`, { credentials: 'include' })
            .then(r=>r.ok?r.json():null)
            .then(d=>{
              if(!d) return; setDaily(d);
              const quest = d.quests?.find((q: { topic_id: string; points: number; questNumber: number })=> q.topic_id === topic.id);
              if(quest){
                const questNumber = quest.questNumber || 1;
                const streak = d.streak;
                const quest_base_bonus = 5 * questNumber;
                const streak_bonus = streak && streak>1 ? 2*(streak-1) : 0;
                const gained = quest.points; // total points awarded stored server-side
                setPoints({
                  gained,
                  bonus: quest_base_bonus + streak_bonus,
                  multiplier: 1,
                  streak,
                  capped: false,
                  quest_number: questNumber,
                  quest_base_bonus,
                  streak_bonus,
                  daily_cap: undefined,
                  remaining_before: undefined,
                  remaining_after: undefined,
                });
              }
            }).catch(()=>{});
        }
      } catch {}
    })();
    return () => { active = false; };
  }, [topic.id]);

  useEffect(() => {
    let aborted = false;
    (async () => {
      if (lockedAttempt) return; // do not overwrite restored or resumed attempt
      if (restoredRef.current) return; // draft/attempt already populated
      try {
        const r = await fetch('/api/questions/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ topic }) });
        if (!r.ok) {
          // show an error and fallback to seed
          setError('Could not load questions; showing a fallback quiz.');
          const dataFallback = seed;
          if (aborted) return;
          setQuiz((dataFallback?.quiz || []).slice(0, 5));
          return;
        } else {
          const data = await r.json().catch(() => null);
          if (aborted) return;
          setQuiz((data?.quiz || []).slice(0,5));
        }
      } catch {}
    })();
    return () => { aborted = true; };
  }, [lockedAttempt, topic.id, seed, reloadKey, topic]);

  useEffect(() => {
    quiz.forEach((q, qi) => {
      const container = quizGroupRefs.current[qi];
      if (!container) return;
      const buttons = container.querySelectorAll('button[data-quiz-option]');
      buttons.forEach((btn: Element) => {
        const idx = Number(btn.getAttribute('data-quiz-option'));
        const isActive = q.chosen_index === idx;
        (btn as HTMLElement).setAttribute('aria-checked', String(isActive));
      });
    });
  }, [quiz]);

  // Autosave draft whenever quiz changes (not locked)
  useEffect(() => {
    if (lockedAttempt) return;
    if (quiz.length === 0) return;
    if (typeof window === 'undefined') return;
    try { window.localStorage.setItem(draftKey(topic.id), JSON.stringify({ quiz })); } catch {}
  }, [quiz, lockedAttempt, topic.id]);

  const allAnswered = quiz.length > 0 && quiz.every(q => q.chosen_index != null);

  const submitQuiz = async () => {
    if (!allAnswered) {
      setError('Please answer every question before submitting.');
      return;
    }
    const questions = quiz.map(q => ({ ...q, chosen_index: q.chosen_index ?? -1 }));
    const correct = questions.filter(q => q.chosen_index === q.correct_index).length;
    const total = questions.length;
    setScore(correct);
    if (typeof window !== 'undefined') {
      try { window.localStorage.setItem(scoreKey(topic.id), String(correct)); } catch {}
    }
    track('quiz_completed', { topicId: topic.id, score: correct, total });
    if (busy) return; // prevent duplicate submissions
    setBusy(true);
    setError(null);
    // Switch to summary view immediately for a snappy UX
    setStep('summary');
    setLockedAttempt(true);
    if (onCompleted) onCompleted();

    // Persist attempt (await) – on success store local attempt & remove draft
    try {
      const r1 = await fetch('/api/quiz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic_id: topic.id, questions })
      });
      if (!r1.ok) setError(prev => prev ?? 'We could not save your quiz attempt, but your score is shown below.');
      else if (typeof window !== 'undefined') {
        try {
          window.localStorage.removeItem(draftKey(topic.id));
          const answers = questions.map(q => ({ question: q.q, options: q.options, correct_index: q.correct_index, chosen_index: q.chosen_index ?? -1 }));
          window.localStorage.setItem(guestKey(topic.id), JSON.stringify({ score: correct, total, answers }));
        } catch {}
      }
    } catch {
      setError(prev => prev ?? 'We could not save your quiz attempt, but your score is shown below.');
    }

    // In parallel: update progress/points and request concise summary
    try {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };

  const progressP = retryFetch('/api/progress', {
        method: 'POST',
        credentials: 'include',
        headers,
        body: JSON.stringify({
          date: todayDate(),
          topic_id: topic.id,
          quick_correct: false,
          quiz_score: correct,
          quiz_total: total,
          completed: true,
        }),
      }).then(async (r) => (r.ok ? (await r.json()) : null)).catch(() => null);

      // Reuse cached summary if already generated for this topic
      let cachedSummary: string | null = null;
      if (typeof window !== 'undefined') {
        try { cachedSummary = window.localStorage.getItem(summaryKey(topic.id)); } catch {}
      }
      const summaryP = cachedSummary != null && cachedSummary !== ''
        ? Promise.resolve(cachedSummary)
  : retryFetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ topic, messages: [], content: '', mode: 'summary' }),
          })
            .then(async (r) => (r.ok ? (await r.json())?.reply : ''))
            .catch(() => '');

      const [progressData, summary] = await Promise.all([progressP, summaryP]);
      if (progressData) setPoints({
        gained: progressData.points_gained,
        bonus: progressData.bonus,
        multiplier: 1,
        streak: progressData.streak,
        capped: progressData.capped,
        quest_number: progressData.quest_number,
        quest_base_bonus: progressData.quest_base_bonus,
        streak_bonus: progressData.streak_bonus,
        daily_cap: progressData.daily_cap,
        remaining_before: progressData.remaining_before,
        remaining_after: progressData.remaining_after,
      });
      // Guest fallback: compute local points so they see the full breakdown
      if (!progressData && !user) {
        const base = correct * 10;
        setPoints({ gained: base, bonus: 0, multiplier: 1, capped: false, guest: true });
      }
      // Fetch daily aggregate after progress applied
      if (user) {
        fetch(`/api/progress/daily?date=${todayDate()}`, { credentials: 'include' })
          .then(r=>r.ok?r.json():null)
          .then(d=>{ if(d) setDaily(d); })
          .catch(()=>{});
      }
      if (summary) {
        const s = String(summary);
        setSummaryText(s);
        if (!cachedSummary && typeof window !== 'undefined') {
          try { window.localStorage.setItem(summaryKey(topic.id), s); } catch {}
        }
      }
    } catch {}
    setBusy(false);
  };
  // Removed per-quest share text feature per new design

  // Prefetch daily aggregate early (once per mount) for signed-in users so summary view has immediate data
  useEffect(() => {
    if (!user) return;
    if (fetchedDailyRef.current) return;
    fetchedDailyRef.current = true;
    setDailyLoading(true);
    fetch(`/api/progress/daily?date=${todayDate()}`, { credentials: 'include' })
      .then(async r => {
        if (!r.ok) throw new Error('Failed fetching daily progress');
        return await r.json();
      })
      .then(d => { setDaily(d); })
  .catch(() => {})
      .finally(() => setDailyLoading(false));
  }, [user]);

  // Remove any leftover "Quick Tip" lines from older summaries
  const sanitizeSummary = (txt: string) => {
    try {
      // Remove Markdown bold "**Quick Tip:** ..." or plain "Quick Tip:" lines
      return txt.replace(/^\s*(\*\*\s*)?Quick\s*Tip:\s*.*$/gim, '').replace(/\n{3,}/g, '\n\n').trim();
    } catch { return txt; }
  };

  if (quiz.length === 0) {
    return (
      <section className="min-h-[65vh] flex flex-col items-center justify-center gap-8 text-center px-4" aria-labelledby="loading-quest-heading" aria-live="polite">
        <div className="flex flex-col items-center gap-5">
          <div className="flex items-center gap-3">
            <div className="grid grid-cols-2 gap-1">
              <span className="w-6 h-6 rounded-sm bg-neutral-900" />
              <span className="w-6 h-6 rounded-sm bg-yellow-400" />
              <span className="w-6 h-6 rounded-sm bg-emerald-500" />
              <span className="w-6 h-6 rounded-sm bg-pink-600" />
            </div>
            <h2 id="loading-quest-heading" className="text-3xl font-extrabold tracking-tight">Loading your questions</h2>
          </div>
          <p className="text-sm opacity-80 max-w-md">Crafting a fresh five-question quiz for <strong>{topic.title}</strong>. This usually takes a moment.</p>
          <div className="flex items-center gap-2 text-amber-700 dark:text-amber-300 font-medium">
            <svg className="w-6 h-6 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-30" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" /></svg>
            <span>{slowLoad ? 'Still generating… almost there' : 'Generating…'}</span>
          </div>
        </div>
        {/* Skeleton placeholders */}
        <ul className="w-full max-w-2xl space-y-4" aria-hidden="true">
          {Array.from({ length: 5 }).map((_, i) => (
            <li key={i} className="rounded-2xl border border-amber-300/60 bg-gradient-to-r from-amber-50 via-amber-100 to-amber-50 dark:from-amber-300/10 dark:via-amber-400/10 dark:to-amber-300/10 p-4 shadow-sm animate-pulse">
              <div className="h-4 w-3/4 bg-amber-200/70 dark:bg-amber-300/20 rounded mb-4" />
              <div className="grid gap-2">
                <div className="h-8 bg-amber-200/50 dark:bg-amber-300/20 rounded" />
                <div className="h-8 bg-amber-200/40 dark:bg-amber-300/20 rounded" />
                <div className="h-8 bg-amber-200/50 dark:bg-amber-300/20 rounded" />
                <div className="h-8 bg-amber-200/40 dark:bg-amber-300/20 rounded" />
              </div>
            </li>
          ))}
        </ul>
        {slowLoad && (
          <div className="flex flex-col items-center gap-3 text-xs text-amber-800/80 dark:text-amber-200/80">
            <span>Takes longer sometimes when servers are cold. You can retry.</span>
            <div className="flex gap-2">
              <button
                onClick={() => { setReloadKey(k => k + 1); setSlowLoad(false); setError(null); setQuiz([]); restoredRef.current = false; }}
                className="px-4 py-2 rounded-lg bg-neutral-900 text-white text-xs font-semibold hover:opacity-90 active:opacity-80"
              >Retry Loading</button>
              {seed && (
                <button
                  onClick={() => { setQuiz((seed.quiz || []).slice(0,5)); setSlowLoad(false); }}
                  className="px-4 py-2 rounded-lg border text-xs font-semibold hover:bg-white/70"
                >Use Fallback</button>
              )}
            </div>
          </div>
        )}
      </section>
    );
  }

  if (step === 'quiz') return (
    <section aria-labelledby="mini-quiz-title" className="ql-section">
      <div className="mb-4 flex items-center justify-between">
        <span className="ql-overline" id="mini-quiz-title">Quiz</span>
        <span className="inline-flex items-center gap-1 text-[11px] font-semibold tracking-wide px-2 py-1 rounded-full bg-neutral-900/5 dark:bg-neutral-50/10 ring-1 ring-neutral-300/50 dark:ring-neutral-700/60">
          <span className="opacity-60">Answered</span>
          <span className="tabular-nums">{quiz.filter(q=>q.chosen_index!=null).length}/{quiz.length}</span>
        </span>
      </div>
      {error && <div className="text-sm mb-4 p-3 rounded-lg border border-rose-300 bg-rose-50 text-rose-900" role="alert">{error}</div>}
      {/* Single subtle container "paper" look */}
      <div className="rounded-2xl bg-neutral-50/70 dark:bg-neutral-900/70 ring-1 ring-neutral-200 dark:ring-neutral-800 px-4 sm:px-6 py-3 sm:py-4 relative overflow-hidden">
        <ol className="divide-y divide-neutral-200/70 dark:divide-neutral-800/70">
          {quiz.map((q, idx) => (
            <li key={idx} className="py-5 first:pt-1 last:pb-1">
              <div className="mb-3 flex gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400 pt-1">Q{idx+1}</span>
                <p className="font-semibold text-[17px] leading-snug text-neutral-900 dark:text-neutral-100 flex-1">{q.q}</p>
              </div>
              <div ref={el => { quizGroupRefs.current[idx] = el; }} role="radiogroup" aria-label={`Quiz question ${idx + 1} options`} className="flex flex-col gap-1">
                {q.options.map((opt, i) => {
                  const isActive = q.chosen_index === i;
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => { const next = [...quiz]; next[idx] = { ...q, chosen_index: i }; setQuiz(next); }}
                      data-quiz-option={i}
                      aria-label={opt}
                      className={`group relative text-left rounded-xl pl-4 pr-3 py-2 text-[13px] sm:text-sm font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-500/40 transition-all duration-200 will-change-transform
                        ${isActive
                          ? 'text-neutral-900 dark:text-neutral-50 shadow-sm ring-1 ring-neutral-400/70 dark:ring-neutral-600/60 bg-gradient-to-r from-neutral-900/5 via-neutral-900/3 to-transparent dark:from-neutral-50/10 dark:via-neutral-50/5 scale-[1.012]'
                          : 'text-neutral-800 dark:text-neutral-200 hover:bg-neutral-900/5 dark:hover:bg-neutral-50/5 hover:translate-x-[2px]'}
                      `}
                      onKeyDown={e => {
                        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); const next = [...quiz]; next[idx] = { ...q, chosen_index: i }; setQuiz(next); }
                        else if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { e.preventDefault(); const nextIndex = Math.min(i + 1, q.options.length - 1); (e.currentTarget.parentElement?.children[nextIndex] as HTMLElement)?.focus(); }
                        else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { e.preventDefault(); const prev = Math.max(i - 1, 0); (e.currentTarget.parentElement?.children[prev] as HTMLElement)?.focus(); }
                      }}
                    >
                      <span className="relative inline-block">
                        {opt}
                      </span>
                      {/* Left accent bar & subtle fill */}
                      <span className={`pointer-events-none absolute left-0 top-1 bottom-1 w-1 rounded-full bg-neutral-700 dark:bg-neutral-300 transition-all duration-300 ${isActive ? 'opacity-90 scale-y-100' : 'opacity-0 scale-y-0 group-hover:opacity-40 group-hover:scale-y-100'}`} aria-hidden="true" />
                      <span className={`pointer-events-none absolute inset-0 rounded-xl scale-95 opacity-0 group-active:opacity-15 group-active:scale-100 bg-neutral-900/10 dark:bg-neutral-50/10 transition`} aria-hidden="true" />
                      {isActive && <span className="pointer-events-none absolute -inset-px rounded-xl bg-neutral-500/10 dark:bg-neutral-400/10" aria-hidden="true" />}
                    </button>
                  );
                })}
              </div>
            </li>
          ))}
        </ol>
      </div>
      <div className="flex items-center gap-4 mt-6">
        <button
          className="px-6 py-2.5 rounded-xl bg-neutral-900 dark:bg-neutral-100 text-neutral-50 dark:text-neutral-900 text-sm font-semibold disabled:opacity-60 focus-visible:outline-2 focus-visible:ring-2 focus-visible:ring-neutral-500/40 cursor-pointer hover:opacity-90 active:opacity-80 transition"
          onClick={submitQuiz}
          disabled={busy || !allAnswered}
          {...(busy || !allAnswered ? { 'aria-disabled': 'true' } : {})}
        >
          {busy ? 'Saving…' : allAnswered ? 'See Results' : 'Answer all questions'}
        </button>
        {!allAnswered && <span className="text-xs opacity-70">All questions required</span>}
      </div>
    </section>
  );

  if (step === 'summary') return (
    <section>
      {/* First: Review answers stays near the quiz content */}
      {/* Hint for guests: no points awarded when not logged in */}
      {!user && points && points.gained === 0 && (
        <div className="mb-4 p-3 rounded-md border border-amber-300 bg-amber-50 text-amber-900 text-sm" role="status">
          You’re not logged in, so points aren’t tracked. <a className="underline font-medium" href={`/login?returnTo=${encodeURIComponent(typeof window !== 'undefined' ? window.location.pathname : '/daily')}`}>Log in</a> to earn points.
        </div>
      )}

      {/* Review section: keep questions visible and show correct answers */}
      <div className="mt-6">
        <h4 className="font-semibold mb-3">Review your answers</h4>
        <div className="rounded-2xl bg-neutral-50/70 dark:bg-neutral-900/70 ring-1 ring-neutral-200 dark:ring-neutral-800 px-4 sm:px-6 py-4">
          <ol className="divide-y divide-neutral-200/70 dark:divide-neutral-800/70">
            {quiz.map((q, idx) => {
              const userCorrect = q.chosen_index === q.correct_index;
              return (
                <li key={idx} className="py-4 first:pt-1 last:pb-1">
                  <div className="flex items-start justify-between gap-4 mb-2">
                    <p className="font-semibold text-[15px] leading-snug text-neutral-900 dark:text-neutral-100 flex-1">Q{idx+1}. {q.q}</p>
                    <span className={`text-[11px] font-semibold uppercase tracking-wide px-2 py-1 rounded-full ${userCorrect ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 ring-1 ring-emerald-500/30' : 'bg-rose-500/15 text-rose-700 dark:text-rose-400 ring-1 ring-rose-500/30'}`}>{userCorrect ? 'Correct' : 'Review'}</span>
                  </div>
                  <ul className="space-y-1">
                    {q.options.map((opt, i) => {
                      const isCorrect = i === q.correct_index;
                      const isChosen = q.chosen_index === i;
                      const base = 'relative pl-5 pr-3 py-1.5 rounded-lg text-[13px] sm:text-[13px] flex items-center gap-2 transition';
                      let style = 'text-neutral-700 dark:text-neutral-300';
                      let bg = '';
                      if (isCorrect && isChosen) { style = 'text-emerald-800 dark:text-emerald-300 font-semibold'; bg = 'bg-emerald-500/10 ring-1 ring-emerald-500/30'; }
                      else if (isCorrect) { style = 'text-emerald-700 dark:text-emerald-400'; bg = 'bg-emerald-500/5'; }
                      else if (isChosen && !isCorrect) { style = 'text-rose-700 dark:text-rose-400 font-medium'; bg = 'bg-rose-500/10 ring-1 ring-rose-500/30'; }
                      return (
                        <li key={i} className={`${base} ${style} ${bg}`}>
                          <span className={`absolute left-0 top-1 bottom-1 w-1 rounded-full ${isCorrect ? 'bg-emerald-500' : isChosen ? 'bg-rose-500' : 'bg-neutral-300 dark:bg-neutral-600'}`} aria-hidden="true" />
                          <span className="flex-1">{opt}</span>
                          {isCorrect && isChosen && (
                            <svg className="w-4 h-4 text-emerald-600 dark:text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 13l4 4L19 7" /></svg>
                          )}
                          {!isCorrect && isChosen && (
                            <svg className="w-4 h-4 text-rose-600 dark:text-rose-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
                          )}
                          {isCorrect && !isChosen && (
                            <svg className="w-4 h-4 text-emerald-600/70 dark:text-emerald-400/70" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 13l4 4L19 7" /></svg>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </li>
              );
            })}
          </ol>
        </div>
      </div>

  {/* Points details now included in banner above */}

      {/* Concise 3–4 sentence summary under the questions */
      }
      {/* Score banner moved BELOW the questions, before the summary */}
      <div className="mx-auto max-w-xl my-6 rounded-2xl border border-amber-300/70 bg-gradient-to-br from-amber-50 via-yellow-50 to-amber-100 dark:from-amber-300/10 dark:via-yellow-300/5 dark:to-amber-400/10 text-amber-900 dark:text-amber-200 shadow-sm p-5">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
              {points ? (
                <div className="flex items-baseline gap-2">
                  <span className="text-4xl font-extrabold tracking-tight leading-none drop-shadow-sm">+{points.gained}</span>
                  <span className="text-sm font-medium uppercase opacity-70">Points</span>
                </div>
              ) : (
                <div className="flex items-baseline gap-2 animate-pulse" aria-live="polite">
                  <span className="h-9 w-16 rounded-md bg-amber-200/60" />
                  <span className="h-4 w-12 rounded bg-amber-200/40" />
                </div>
              )}
              {daily && (
                <div className="flex items-baseline gap-1 text-xs font-semibold bg-white/70 dark:bg-neutral-900/40 px-2 py-1 rounded border border-amber-300/60">
                  <span className="uppercase opacity-60">Daily Total</span>
                  <span className="tabular-nums">{daily.total_points}</span>
                </div>
              )}
              {!daily && dailyLoading && (
                <div className="flex items-baseline gap-1 text-xs font-semibold bg-white/50 dark:bg-neutral-900/40 px-2 py-1 rounded border border-amber-200/60 animate-pulse" aria-live="polite">
                  <span className="uppercase opacity-60">Daily</span>
                  <span className="opacity-60">…</span>
                </div>
              )}
              <div className="text-sm font-semibold opacity-80">Score {Math.max(score, quiz.filter(q => q.chosen_index === q.correct_index).length)}/{quiz.length}</div>
            </div>
            {/* Breakdown (cap UI removed) */}
            {points && (
              <div className="mt-3 w-full">
                <div className="text-xs sm:text-[13px] font-medium flex flex-wrap items-center gap-3">
                  <BreakdownItem label="Base" value={points.gained - points.bonus} tooltip="10 points per correct answer" />
                  <BreakdownItem
                    label="Quest Bonus"
                    value={points.quest_base_bonus || 0}
                    highlight={(points.quest_base_bonus || 0) > 0}
                    tooltip={`Quest bonus: +${points.quest_base_bonus || 0} (5 x quest #${points.quest_number || 0})`}
                    showSign
                  />
                  <BreakdownItem
                    label="Streak Bonus"
                    value={points.streak_bonus || 0}
                    highlight={(points.streak_bonus || 0) > 0}
                    tooltip={`Streak bonus: +${points.streak_bonus || 0} (2 x (streak-1)). Current streak: ${points.streak || 1}. Adds +2 per extra day beyond day 1.`}
                    showSign
                  />
                  {points.capped ? <Badge text="Capped" tooltip="Daily cap reached; additional awards blocked" /> : null}
                </div>
              </div>
            )}
          </div>
          <div className="flex flex-col items-end gap-2">
            {!user && <div className="text-[11px] leading-snug text-right max-w-[20ch] text-amber-800/80 dark:text-amber-200/80"><a href="/login" className="underline font-medium">Sign in</a> to keep streaks & points and appear on leaderboards.</div>}
            {/* Retake button for testing / admin: clears today's attempt allowing a fresh run */}
            {/* Retake Quest button removed from public UI; now admin-only via admin page tools */}
          </div>
        </div>
      </div>

      {/* Structured post-quiz experience */}
      <div className="mt-10 space-y-10" aria-label="Post-quiz insights and tools">
        {/* Mobile quick exit back to daily quests */}
        <div className="md:hidden sticky top-0 z-10 -mt-4 pt-4 pb-2 bg-gradient-to-b from-white/95 dark:from-neutral-950/95 from-60% backdrop-blur">
          <button
            onClick={() => router.push('/daily')}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border text-[11px] font-medium bg-white/80 dark:bg-neutral-900/70 hover:bg-neutral-50 dark:hover:bg-neutral-800 active:scale-[.97] transition"
            aria-label="Back to today\'s quests"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
            Quests
          </button>
        </div>
        {/* Summary Panel */}
        <section aria-labelledby="summary-heading" className="ql-section">
          <div className="ql-section-header">
            <div>
              <span className="ql-overline" id="summary-heading">Summary</span>
              <h3 className="text-lg font-semibold tracking-tight">What You Learned: {topic.title}</h3>
            </div>
            {/* Streak badge removed for cleaner summary */}
          </div>
          {(() => {
            if (summaryText) {
              const clean = sanitizeSummary(summaryText);
              const bullets = toBullets(clean, 5);
              if (bullets.length) {
                return (
                  <ul className="list-disc pl-5 text-sm leading-relaxed space-y-1">
                    {bullets.map((b,i)=>(<li key={i}>{b.replace(/^[*-]\s*/, '')}</li>))}
                  </ul>
                );
              }
              return <p className="text-sm leading-relaxed whitespace-pre-wrap">{clean}</p>;
            }
            // Fallback summary generation using topic angles
            return (
              <p className="text-sm leading-relaxed opacity-90">
                {Array.isArray(topic.angles) && topic.angles.length > 0
                  ? `${topic.angles.slice(0,3).map(a=>String(a).trim().replace(/[.?!]+$/,'')).filter(Boolean).join('. ')}.`
                  : `You reviewed the core ideas for ${topic.title}.`}
              </p>
            );
          })()}
          {/* Duplicate completion notice removed from UI; silent idempotency */}
        </section>

        {/* Explore / Go Deeper Panel */}
        <section aria-labelledby="explore-heading" className="ql-section">
          <div className="ql-section-header">
            <div>
              <span className="ql-overline" id="explore-heading">Explore Further</span>
              <h3 className="text-lg font-semibold tracking-tight">Go Deeper on {topic.title}</h3>
            </div>
          </div>
          <div className="flex flex-nowrap gap-2 items-center overflow-x-auto no-scrollbar py-1 -mx-0.5">
            <a className="shrink-0 px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-lg border bg-white/60 dark:bg-neutral-900/50 hover:bg-white dark:hover:bg-neutral-800 transition text-amber-800 dark:text-amber-200 font-medium flex items-center gap-2 text-xs sm:text-sm whitespace-nowrap" href={`https://www.google.com/search?q=${encodeURIComponent(topic.title)}`} target="_blank" rel="noreferrer" aria-label="Search the web for this topic">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
              <span className="sm:hidden">Search</span>
              <span className="hidden sm:inline">Web Search</span>
            </a>
            <button onClick={()=> { openChat(); try { track('chat_open_follow_up'); } catch {} }} className="shrink-0 px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-lg bg-black text-white text-xs sm:text-sm font-medium hover:opacity-90 active:opacity-80 transition whitespace-nowrap" aria-label="Open chat for a follow-up question">
              <span className="sm:hidden">Follow‑up</span>
              <span className="hidden sm:inline">Ask a Follow‑up</span>
            </button>
            <button onClick={()=> { try { track('chat_open_explain_simply'); } catch {}; openChat('Give a clear, plain-language explanation with a concise real-world example.'); }} className="shrink-0 px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-lg border text-xs sm:text-sm font-medium hover:bg-neutral-50 dark:hover:bg-neutral-800 whitespace-nowrap" aria-label="Get a simple explanation">
              <span className="sm:hidden">Explain</span>
              <span className="hidden sm:inline">Explain Simply</span>
            </button>
          </div>
        </section>

        {/* Share Panel */}
        <section aria-labelledby="share-heading" className="ql-section">
          <div className="ql-section-header">
            <div>
              <span className="ql-overline" id="share-heading">Show Progress</span>
              <h3 className="text-lg font-semibold tracking-tight">Share Today&apos;s Result</h3>
            </div>
          </div>
          <DailyShareSection topicTitle={topic.title} points={points} daily={daily} dailyLoading={dailyLoading} />
        </section>

        {/* Chat Panel */}
        <section aria-labelledby="chat-heading" className="ql-section" id="chat">
          <div className="ql-section-header">
            <div>
              <span className="ql-overline" id="chat-heading">Deepen Understanding</span>
              <h3 className="text-lg font-semibold tracking-tight">Chat About This Topic</h3>
            </div>
            {points?.quest_number && <span className="ql-badge ql-badge-amber" title="Quest number in today\'s rotation">Quest #{points.quest_number}</span>}
          </div>
          {/* Explanatory helper text removed to reduce vertical space */}
          <SuggestionChips onPick={(t)=>{ try { track('chat_suggestion_chip', { prompt: t }); } catch {}; openChat(t); }} />
          <ChatPane topic={topic} autoSummary={false} />
        </section>

        {/* Back navigation */}
        <div className="text-center pt-2">
          <button className="px-4 py-2 rounded border cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-800 text-sm font-medium" onClick={() => router.push('/daily')}>Back to Quests</button>
        </div>
      </div>
    </section>
  );

  return null;
}

// Small pill for numeric breakdown items
function BreakdownItem({ label, value, tooltip, highlight, showSign }: { label: string; value: number; tooltip?: string; highlight?: boolean; showSign?: boolean }) {
  const numeric = Number.isInteger(value) ? value : Number(value.toFixed(2));
  const formatted = showSign ? `${numeric >= 0 ? '+' : ''}${numeric}` : numeric;
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-1 rounded-md border text-[11px] leading-none tracking-wide select-none ${highlight ? 'bg-amber-200/70 border-amber-400 text-amber-900' : 'bg-white/70 border-amber-300/60 dark:bg-neutral-900/40 dark:border-neutral-700'} `}
      title={tooltip || ''}
      aria-label={`${label}: ${formatted}`}
    >
      <span className="uppercase opacity-70">{label}</span>
      <span className="font-semibold tabular-nums">{formatted}</span>
    </span>
  );
}

function Badge({ text, tooltip }: { text: string; tooltip?: string }) {
  return (
    <span
      className="inline-flex items-center px-2 py-1 rounded-full bg-amber-500/20 text-amber-800 dark:text-amber-200 border border-amber-400/60 text-[11px] font-semibold tracking-wide"
      title={tooltip || ''}
    >
      {text}
    </span>
  );
}

// Radial streak progress badge (cycles every 7 days)
// StreakBadge component removed (no longer used in summary)

function SuggestionChips({ onPick }: { onPick: (text: string) => void }) {
  const chips = [
    'Give me a spaced repetition drill',
    'Explain with a sports analogy',
    'Quiz me again with variations',
    'Summarize as flashcards',
  ];
  return (
    <div className="flex flex-wrap gap-2 mb-4">
      {chips.map(c => (
        <button key={c} type="button" onClick={()=>onPick(c)} className="px-2 py-1 rounded-full border text-[11px] hover:bg-neutral-50 dark:hover:bg-neutral-800 transition" aria-label={`Insert prompt: ${c}`}>{c}</button>
      ))}
    </div>
  );
}

// Daily aggregated share section
type PointsState = { gained: number; bonus: number; multiplier: number; streak?: number; capped?: boolean; /* duplicate removed from UI */ quest_number?: number; quest_base_bonus?: number; streak_bonus?: number; daily_cap?: number; remaining_before?: number; remaining_after?: number } | null;
function DailyShareSection({ topicTitle, points, daily, dailyLoading }: { topicTitle: string; points: PointsState; daily: { total_points: number; quests: Array<{ topic_id: string; title: string; points: number; questNumber: number }>; streak?: number; isPremium?: boolean } | null; dailyLoading: boolean }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  useEffect(() => {
    try {
      const w = 900, h = 470;
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      // Background
      const g = ctx.createLinearGradient(0,0,w,h);
      g.addColorStop(0,'#fffaf5');
      g.addColorStop(1,'#ffe9d6');
      ctx.fillStyle = g; ctx.fillRect(0,0,w,h);
      ctx.strokeStyle = '#e7c262'; ctx.lineWidth = 8; ctx.strokeRect(4,4,w-8,h-8);

      const padding = 56;
  const leftWidth = 500; // column for quest titles
  const rightX = padding + leftWidth + 40;

      // Date top-left
      const todayStr = new Date().toLocaleDateString(undefined,{weekday:'short', month:'short', day:'numeric'});
      ctx.font = '700 46px Inter, system-ui, sans-serif';
      ctx.fillStyle = '#7a4800';
      ctx.fillText(todayStr, padding, padding + 44);

      // Determine quest list (filter to current quest progress to avoid showing a prior day's full list)
      const currentQN = points?.quest_number || 1;
  const rawQuests = (daily?.quests && daily.quests.length>0) ? [...daily.quests].sort((a,b)=>a.questNumber-b.questNumber) : [];
      let filtered = rawQuests.filter(q => q.questNumber <= currentQN);
      if (filtered.length === 0) {
        filtered = [{ title: topicTitle, points: points?.gained || 0, questNumber: currentQN, topic_id: '' }];
      } else {
        // Ensure the current topic is represented (in case stale cache returned old day)
  if (!filtered.some(q => q.title === topicTitle)) {
          filtered.push({ title: topicTitle, points: points?.gained || 0, questNumber: currentQN, topic_id: '' });
          filtered = filtered.sort((a,b)=>a.questNumber-b.questNumber);
        }
      }
      // Dynamic sizing
      const count = filtered.length;
      const baseFont = count <= 3 ? 40 : count <=4 ? 34 : count <=5 ? 30 : 26;
      const lineH = Math.round(baseFont * 1.22);
      ctx.font = `500 ${baseFont}px Inter, system-ui, sans-serif`;
  const startY = padding + 44 + 30; // space below date
      let y = startY;
      filtered.forEach(q => {
  const maxW = leftWidth - 30;
  let t = q.title.trim();
  while (t.length>10 && ctx.measureText(t + ' (+'+q.points+')').width > maxW) { t = t.slice(0,-1); }
  if (t !== q.title) t += '…';
  ctx.fillText('• ' + t + ' (+'+q.points+')', padding, y);
        y += lineH;
      });

      // Right column: Brand + total + streak/premium + date + tagline
      // Logo
      const square = (x: number, y: number, c: string) => { ctx.fillStyle = c; ctx.fillRect(x, y, 34, 34); };
      const brandY = padding;
      square(rightX, brandY, '#111111');
      square(rightX + 40, brandY, '#ffbe0b');
      square(rightX, brandY + 40, '#00c27a');
      square(rightX + 40, brandY + 40, '#ff0a54');
      ctx.font = '800 46px Inter, system-ui, sans-serif'; ctx.fillStyle = '#111';
      ctx.fillText('Questly', rightX + 90, brandY + 52);

      // Badges (premium + streak) under brand
      let badgeY = brandY + 70;
      const streakVal = (daily?.streak || points?.streak) && (daily?.streak || points?.streak)! > 1 ? (daily?.streak || points?.streak || 0) : 0;
      ctx.font = '700 30px Inter, system-ui, sans-serif';
      if (daily?.isPremium) {
        ctx.fillStyle = '#f59e0b';
        ctx.beginPath(); ctx.roundRect(rightX, badgeY, 190, 56, 16); ctx.fill();
        ctx.fillStyle = '#111'; ctx.fillText('PREMIUM', rightX + 18, badgeY + 40);
        badgeY += 70;
      }
      if (streakVal>1) {
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.roundRect(rightX, badgeY, 190, 56, 16); ctx.fill();
        ctx.strokeStyle='#b45309'; ctx.lineWidth=4; ctx.stroke();
        ctx.fillStyle = '#b45309'; ctx.fillText(`Streak ${streakVal}`, rightX + 18, badgeY + 40);
        badgeY += 70;
      }

      // Total points below badges
      const pointsY = badgeY + 40;
      ctx.font = '900 120px Inter, system-ui, sans-serif'; ctx.fillStyle = '#b45309';
      ctx.fillText(`+${(daily?.total_points ?? (points?.gained || 0))}`, rightX, pointsY);

      // Date & tagline
      const fullDate = new Date().toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric'});
      ctx.font = '600 30px Inter, system-ui, sans-serif'; ctx.fillStyle = '#7a4800';
      ctx.fillText(fullDate, rightX, h - 120);
      ctx.font='500 26px Inter, system-ui, sans-serif'; ctx.fillStyle='#1f2937';
      ctx.fillText('Earn points daily', rightX, h - 70);
      ctx.font='500 22px Inter, system-ui, sans-serif'; ctx.fillStyle='#92400e';
      ctx.fillText('thequestly.com', rightX, h - 36);
      setDataUrl(canvas.toDataURL('image/png'));
    } catch { /* no-op */ }
  }, [topicTitle, points?.gained, daily?.total_points, daily?.quests, daily?.streak, daily?.isPremium, points?.streak, points?.quest_number]);

  const shareImage = async () => {
    if (!dataUrl) return;
    setSharing(true);
    try {
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      const file = new File([blob], 'questly.png', { type: 'image/png' });
      // Prefer native share with only the image (no caption for cleaner social previews / messaging apps)
      const navShare = (navigator as unknown as { share?: (data: { files?: File[]; title?: string }) => Promise<void> }).share;
      if (typeof navShare === 'function') {
        try {
          await navShare({ files: [file], title: 'Questly Result' });
          try { track('share_image_native'); } catch {}
          setSharing(false); return;
        } catch {
          // Continue to fallback
        }
      }
      // Fallback: open in a new tab so popup blockers are less likely (user gesture already occurred)
      const fallbackWin = window.open();
      if (fallbackWin) {
        fallbackWin.document.write(`<title>Share Questly</title><body style='margin:0;display:flex;align-items:center;justify-content:center;background:#faf4eb;font-family:system-ui,sans-serif'><div style='text-align:center'><p style='font:16px/1.4 system-ui;margin:16px 0 8px;color:#92400e'>Long‑press / right‑click to save & share</p><img src="${dataUrl}" alt="Questly Result" style="max-width:100%;height:auto;border:4px solid #e7c262;border-radius:12px" /></div></body>`);
      }
      try { track('share_image_fallback'); } catch {}
    } finally { setSharing(false); }
  };

  if (dailyLoading && !dataUrl) {
    return (
      <div className="mt-8">
        <div className="rounded-xl border border-amber-300/60 bg-amber-50/40 dark:bg-amber-300/10 p-6 flex flex-col md:flex-row gap-5 animate-pulse">
          <div className="w-full md:w-80 aspect-[16/9] rounded-md border border-amber-200 bg-gradient-to-br from-amber-100 to-amber-50" />
          <div className="flex-1 space-y-4 text-sm">
            <div>
              <div className="h-4 w-40 bg-amber-200/70 rounded mb-2" />
              <div className="h-3 w-60 bg-amber-200/50 rounded mb-1" />
              <div className="h-3 w-56 bg-amber-200/40 rounded mb-1" />
              <div className="h-3 w-52 bg-amber-200/30 rounded" />
            </div>
            <div className="flex gap-2">
              <div className="h-8 w-28 bg-amber-200/60 rounded" />
              <div className="h-8 w-28 bg-amber-200/50 rounded" />
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (!dataUrl) return null;
  return (
    <div className="mt-8">
      <div className="rounded-xl border border-amber-300/60 bg-amber-50/70 dark:bg-amber-300/10 p-4 flex flex-col md:flex-row gap-5">
        <Image src={dataUrl} alt="Questly daily share" width={320} height={167} className="w-full md:w-80 h-auto rounded-md border border-amber-200 shadow" />
        <div className="flex-1 text-sm space-y-4">
          <div className="space-y-2">
            <p className="font-medium flex flex-wrap items-center gap-2">Total today <span className="font-semibold">{daily?.total_points ?? points?.gained ?? 0}</span>{daily?.streak ? <span className="text-amber-700 dark:text-amber-300">Streak {daily.streak}</span> : null}{daily?.isPremium ? <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-800 dark:text-amber-200 border border-amber-400/60 text-[10px] font-semibold">Premium</span> : null}</p>
            <ul className="text-xs leading-relaxed max-h-40 overflow-auto pr-1">
              {(() => {
                const currentQNInternal = points?.quest_number || 1;
                let list: { title: string; points: number; questNumber: number; topic_id: string }[] = (daily?.quests || []).filter(q => q.questNumber <= currentQNInternal);
                if (list.length === 0) {
                  list = [{ title: topicTitle, points: points?.gained || 0, questNumber: currentQNInternal, topic_id: '' }];
                } else if (!list.some(q => q.title === topicTitle)) {
                  list.push({ title: topicTitle, points: points?.gained || 0, questNumber: currentQNInternal, topic_id: '' });
                  list = list.sort((a,b)=>a.questNumber-b.questNumber);
                }
                return list.map(q => (
                  <li key={q.topic_id || q.title}>#{q.questNumber} {q.title} (+{q.points})</li>
                ));
              })()}
            </ul>
            {!daily || (daily.quests?.length ?? 0) === 1 ? (
              <p className="text-[11px] opacity-70">Complete all daily quests to build a richer share card.</p>
            ) : null}
          </div>
          <div className="flex gap-2 flex-wrap items-center">
            <button onClick={shareImage} disabled={sharing} className="px-4 py-1.5 rounded-lg bg-black text-white text-sm font-medium hover:opacity-90 disabled:opacity-50">{sharing ? 'Sharing…' : 'Share'}</button>
          </div>
          <p className="ql-muted -mb-1 text-xs">Tap Share to open your device menu. If it doesn’t appear, a new tab with the image will open.</p>
        </div>
      </div>
    </div>
  );
}

// Helper to reveal & focus chat inline within the summary view
function openChat(prompt?: string) {
  try {
    const chatSection = document.getElementById('chat');
    if (chatSection) chatSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    // Use custom event so ChatPane can manage state & optional auto-send reliably
    const detail: { prompt?: string; autoSend?: boolean } = prompt ? { prompt, autoSend: true } : {};
    setTimeout(()=>{
      window.dispatchEvent(new CustomEvent('questly-open-chat', { detail }));
    }, 120);
  } catch {}
}