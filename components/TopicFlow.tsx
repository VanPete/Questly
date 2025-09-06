'use client';
import { useEffect, useState, useRef } from 'react';
import Image from 'next/image';
import { track } from '@vercel/analytics';
import { demoQuestionBank } from '@/lib/demoQuestions';
import { useRouter } from 'next/navigation';
import type { Topic as TopicType } from '@/lib/types';
import { useUser } from '@clerk/nextjs';
import ChatPane from './ChatPane';

type Question = { q: string; options: string[]; correct_index: number; chosen_index?: number };

const todayDate = () => new Date().toISOString().slice(0, 10);

export default function TopicFlow({ topic, onCompleted }: { topic: TopicType; onCompleted?: () => void }) {
  const [step, setStep] = useState<'quiz' | 'summary' | 'chat'>('quiz');
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
          setStep('summary');
          setLockedAttempt(true);
          restoredRef.current = true;
          if (typeof window !== 'undefined') {
            try { const cachedSummary = window.localStorage.getItem(summaryKey(topic.id)); if (cachedSummary) setSummaryText(cachedSummary); } catch {}
          }
          return;
        }
        // If no server attempt, check localStorage (guest OR redundancy for signed-in) then draft
	if (active && typeof window !== 'undefined') {
          try {
            const raw = window.localStorage.getItem(guestKey(topic.id));
            if (raw) {
              const saved = JSON.parse(raw) as { answers: Array<{ question: string; options: string[]; correct_index: number; chosen_index: number }>; score: number; total: number };
              if (saved && Array.isArray(saved.answers) && saved.answers.length) {
                const rebuilt: Question[] = saved.answers.map(a => ({ q: a.question, options: a.options, correct_index: a.correct_index, chosen_index: a.chosen_index }));
                setQuiz(rebuilt);
                setScore(saved.score || 0);
                setStep('summary');
                setLockedAttempt(true);
                restoredRef.current = true;
                try { const cachedSummary = window.localStorage.getItem(summaryKey(topic.id)); if (cachedSummary) setSummaryText(cachedSummary); } catch {}
                try { const sc = window.localStorage.getItem(scoreKey(topic.id)); if (sc) setScore(Number(sc)); } catch {}
                return;
              }
            }
            // Resume draft if present and nothing locked yet
            if (!lockedAttempt) {
              const dRaw = window.localStorage.getItem(draftKey(topic.id));
              if (dRaw) {
                const draft = JSON.parse(dRaw) as { quiz: Question[] };
                if (draft && Array.isArray(draft.quiz) && draft.quiz.length) {
                  setQuiz(draft.quiz.slice(0, 5));
                  restoredRef.current = true;
                }
              }
            }
          } catch {}
        }
      } catch {}
    })();
    return () => { active = false; };
  }, [topic.id, user, lockedAttempt, reloadKey]);
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
        } else {
          const data = await r.json();
          if (aborted) return;
          const built = (data.quiz || seed?.quiz || []).slice(0, 5);
          setQuiz(built);
          if (typeof window !== 'undefined') {
            try { window.localStorage.setItem(draftKey(topic.id), JSON.stringify({ quiz: built })); } catch {}
          }
        }
      } catch {
        if (aborted) return;
        setError('Network error while loading questions; showing a fallback quiz.');
        const built = (seed?.quiz || []).slice(0, 5);
        setQuiz(built);
        if (typeof window !== 'undefined') {
          try { window.localStorage.setItem(draftKey(topic.id), JSON.stringify({ quiz: built })); } catch {}
        }
      }
    })();
    return () => { aborted = true; };
  }, [topic, seed, lockedAttempt, reloadKey]);

  // Slow load timer
  useEffect(() => {
    if (quiz.length > 0) return; // loaded
    setSlowLoad(false);
    const t = setTimeout(() => setSlowLoad(true), 4000); // 4s threshold
    return () => clearTimeout(t);
  }, [quiz.length, reloadKey]);
  const [score, setScore] = useState(0);
  const [points, setPoints] = useState<{
    gained: number; bonus: number; multiplier: number; streak?: number; capped?: boolean; duplicate?: boolean;
    quest_number?: number; quest_base_bonus?: number; streak_bonus?: number; daily_cap?: number; remaining_before?: number; remaining_after?: number;
  } | null>(null);
  // Daily cumulative stats
  const [daily, setDaily] = useState<{ total_points: number; quests: Array<{ topic_id: string; title: string; points: number; questNumber: number }>; streak?: number; isPremium?: boolean } | null>(null);
  const [dailyLoading, setDailyLoading] = useState(false);
  const [dailyError, setDailyError] = useState<string | null>(null);
  const fetchedDailyRef = useRef(false);
  const [summaryText, setSummaryText] = useState<string | null>(null);
  // removed copied/share state (legacy share text removed)
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const quizGroupRefs = useRef<Record<number, HTMLDivElement | null>>({});

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

  const progressP = fetch('/api/progress', {
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
        : fetch('/api/chat', {
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
        duplicate: progressData.duplicate,
        quest_number: progressData.quest_number,
        quest_base_bonus: progressData.quest_base_bonus,
        streak_bonus: progressData.streak_bonus,
        daily_cap: progressData.daily_cap,
        remaining_before: progressData.remaining_before,
        remaining_after: progressData.remaining_after,
      });
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
    setDailyError(null);
    fetch(`/api/progress/daily?date=${todayDate()}`, { credentials: 'include' })
      .then(async r => {
        if (!r.ok) throw new Error('Failed fetching daily progress');
        return await r.json();
      })
      .then(d => { setDaily(d); })
      .catch(e => { setDailyError((e as Error).message); })
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
    <section aria-labelledby="mini-quiz-title">
      <div className="flex items-baseline justify-between gap-3 mb-2">
        <h3 id="mini-quiz-title" className="font-semibold">Quiz</h3>
        <div className="text-sm opacity-80">{quiz.filter(q=>q.chosen_index!=null).length}/{quiz.length} answered</div>
      </div>
      {error && <div className="text-sm mb-2 p-2 rounded-md border border-amber-300 bg-amber-50 text-amber-900" role="alert">{error}</div>}
      {quiz.map((q, idx) => (
        <div key={idx} className="mb-4">
          <p className="mb-2 font-medium">Q{idx+1}. {q.q}</p>
          <div ref={el => { quizGroupRefs.current[idx] = el; }} className="grid gap-2" role="radiogroup" aria-label={`Quiz question ${idx + 1} options`}>
            {q.options.map((opt, i) => {
              const isActive = q.chosen_index === i;
                  return (
                <button
                  key={i}
                  onClick={() => {
                    const next = [...quiz];
                    next[idx] = { ...q, chosen_index: i };
                    setQuiz(next);
                  }}
                  tabIndex={0}
                  role="radio"
                  aria-checked="false"
                  data-quiz-option={i}
                  aria-label={opt}
                  className={`rounded-lg px-3 py-2 text-left border transition-colors focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500 cursor-pointer ${isActive ? 'bg-amber-400 text-black border-black' : 'hover:bg-amber-50 hover:border-amber-300'}`}
                  onKeyDown={e => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      const next = [...quiz];
                      next[idx] = { ...q, chosen_index: i };
                      setQuiz(next);
                    } else if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
                      e.preventDefault();
                      const next = Math.min(i + 1, q.options.length - 1);
                      (e.currentTarget.parentElement?.children[next] as HTMLElement)?.focus();
                    } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
                      e.preventDefault();
                      const prev = Math.max(i - 1, 0);
                      (e.currentTarget.parentElement?.children[prev] as HTMLElement)?.focus();
                    }
                  }}
                >
                  {opt}
                </button>
              );
            })}
          </div>
        </div>
      ))}
      <div className="flex items-center gap-3 mt-2">
        <button
          className="px-4 py-2 rounded bg-black text-white disabled:opacity-60 focus-visible:outline-2 focus-visible:ring-amber-300 cursor-pointer hover:opacity-90 active:opacity-80"
          onClick={submitQuiz}
          disabled={busy || !allAnswered}
          tabIndex={0}
          {...(busy || !allAnswered ? { 'aria-disabled': 'true' } : {})}
        >
          {busy ? 'Saving…' : allAnswered ? 'Submit' : 'Answer all to submit'}
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
        {quiz.map((q, idx) => (
          <div key={idx} className="mb-4">
            <p className="mb-2 font-medium">Q{idx+1}. {q.q}</p>
            <div className="grid gap-2">
              {q.options.map((opt, i) => {
                const isCorrect = i === q.correct_index;
                const isChosen = q.chosen_index === i;
                // styles: correct=green, wrong chosen=red, others=neutral
                const cls = isCorrect
                  ? 'bg-emerald-50 text-emerald-900 border-emerald-300'
                  : isChosen
                  ? 'bg-rose-50 text-rose-900 border-rose-300'
                  : 'bg-white dark:bg-neutral-900';
                return (
                  <div key={i} className={`rounded-lg px-3 py-2 text-left border ${cls}`} aria-live="polite">
                    <div className="flex items-center justify-between">
                      <span>{opt}</span>
                      {isCorrect && <span className="text-xs font-medium text-emerald-700">Correct</span>}
                      {!isCorrect && isChosen && <span className="text-xs font-medium text-rose-700">Your choice</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

  {/* Points details now included in banner above */}

      {/* Concise 3–4 sentence summary under the questions */
      }
      {/* Score banner moved BELOW the questions, before the summary */}
      <div className="mx-auto max-w-xl my-6 rounded-2xl border border-amber-300/70 bg-gradient-to-br from-amber-50 via-yellow-50 to-amber-100 dark:from-amber-300/10 dark:via-yellow-300/5 dark:to-amber-400/10 text-amber-900 dark:text-amber-200 shadow-sm p-5">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
              {points && (
                <div className="flex items-baseline gap-2">
                  <span className="text-4xl font-extrabold tracking-tight leading-none drop-shadow-sm">+{points.gained}</span>
                  <span className="text-sm font-medium uppercase opacity-70">Points</span>
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
                  {points.duplicate ? <Badge text="Duplicate" tooltip="Already completed today; no new points" /> : null}
                </div>
              </div>
            )}
          </div>
          <div className="flex flex-col items-end gap-2">
            {!user && <div className="text-[11px] leading-snug max-w-[14ch] text-amber-800/80 dark:text-amber-200/80">Sign in to keep streaks & points.</div>}
            {/* Retake button for testing / admin: clears today's attempt allowing a fresh run */}
            <button
              type="button"
              onClick={async () => {
                try {
                  // Server delete (ignore result errors silently for UX)
                  await fetch(`/api/quiz?topic_id=${encodeURIComponent(topic.id)}`, { method: 'DELETE' });
                } catch {}
                // Clear local storage keys for this topic + today
                if (typeof window !== 'undefined') {
                  try { window.localStorage.removeItem(guestKey(topic.id)); } catch {}
                  try { window.localStorage.removeItem(scoreKey(topic.id)); } catch {}
                }
                // Reset component state to quiz start
                setLockedAttempt(false);
                setStep('quiz');
                setQuiz([]);
                setPoints(null);
                setDaily(null);
                setSummaryText(null);
                restoredRef.current = false;
                setReloadKey(k => k + 1); // triggers regeneration
              }}
              className="px-3 py-1.5 rounded-md border text-[11px] font-medium hover:bg-white/70 dark:hover:bg-neutral-800 transition-colors"
            >Retake Quest</button>
          </div>
        </div>
      </div>

      <div className="text-base leading-relaxed mt-4">
        <p className="mb-2"><strong>{topic.title}</strong></p>
        {summaryText ? (
          <div className="rounded-xl bg-neutral-50 dark:bg-neutral-900/40 border border-neutral-200/60 dark:border-neutral-800 p-3 text-sm whitespace-pre-wrap">{sanitizeSummary(summaryText)}</div>
        ) : (
          <p className="opacity-90">
            {Array.isArray(topic.angles) && topic.angles.length > 0
              ? `${topic.angles.slice(0,3).map(a=>String(a).trim().replace(/[.?!]+$/,'')).filter(Boolean).join('. ')}.`
              : `You reviewed the core ideas for ${topic.title}.`}
          </p>
        )}
  {/* Score already shown in banner below questions */}
        {points?.streak && points.streak > 1 && (
          <p className="opacity-90">Your streak is now {points.streak}. Keep it going.</p>
        )}
        <div className="mt-4 inline-flex items-center gap-3 px-3 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50/70 dark:bg-neutral-900/40 backdrop-blur-sm text-xs sm:text-sm">
          <div className="flex items-center gap-2 font-medium text-neutral-700 dark:text-neutral-300">
            <svg className="w-4 h-4 text-amber-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
            <span>Go deeper</span>
          </div>
          <a className="px-2 py-1 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-300 text-[11px] sm:text-xs font-semibold transition-colors" href={`https://www.google.com/search?q=${encodeURIComponent(topic.title)}`} target="_blank" rel="noreferrer">Web Search →</a>
        </div>
      </div>

  <DailyShareSection topicTitle={topic.title} points={points} score={score} total={quiz.length} currentQuestNumber={points?.quest_number||1} daily={daily} dailyLoading={dailyLoading} />

  {/* Chat appears after submission, with autoSummary disabled to avoid duplicate summary */}
      <section aria-labelledby="chat-gpt-title" id="chat" className="mt-8">
        <h4 id="chat-gpt-title" className="font-semibold mb-2">Chat with GPT to learn more</h4>
        <ChatPane topic={topic} autoSummary={false} />
      </section>

      {/* Back to Quests at the very end */}
      <div className="mt-6">
        <button className="px-4 py-2 rounded border cursor-pointer hover:bg-neutral-50" onClick={() => router.push('/daily')}>Back to Quests</button>
      </div>
    </section>
  );

  return (
    <section>
      <p className="mb-3">Open the chat in the topic page below.</p>
    </section>
  );
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

// Daily aggregated share section
type PointsState = { gained: number; bonus: number; multiplier: number; streak?: number; capped?: boolean; duplicate?: boolean; quest_number?: number; quest_base_bonus?: number; streak_bonus?: number; daily_cap?: number; remaining_before?: number; remaining_after?: number } | null;
function DailyShareSection({ topicTitle, points, score, total, currentQuestNumber, daily, dailyLoading }: { topicTitle: string; points: PointsState; score: number; total: number; currentQuestNumber: number; daily: { total_points: number; quests: Array<{ topic_id: string; title: string; points: number; questNumber: number }>; streak?: number; isPremium?: boolean } | null; dailyLoading: boolean }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  useEffect(() => {
    try {
      const w = 900, h = 470;
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const g = ctx.createLinearGradient(0,0,w,h);
      g.addColorStop(0,'#fff8e1');
      g.addColorStop(1,'#ffe9c7');
      ctx.fillStyle = g; ctx.fillRect(0,0,w,h);
      ctx.strokeStyle = '#e7c262'; ctx.lineWidth = 8; ctx.strokeRect(4,4,w-8,h-8);
      // --- Logo (four colored squares) ---
      const square = (x: number, y: number, c: string) => { ctx.fillStyle = c; ctx.fillRect(x, y, 32, 32); };
      square(60, 52, '#111111'); // dark
      square(98, 52, '#ffbe0b'); // yellow
      square(60, 90, '#00c27a'); // green
      square(98, 90, '#ff0a54'); // pink
      // Brand text
      ctx.font = 'bold 54px Inter, system-ui, sans-serif';
      ctx.fillStyle = '#111111';
      ctx.fillText('Questly', 150, 95);

      // Premium badge (small ribbon) & streak pill if applicable
      if (daily?.isPremium) {
        ctx.fillStyle = '#f59e0b';
        ctx.beginPath();
        ctx.roundRect(w - 210, 40, 150, 46, 12);
        ctx.fill();
        ctx.font = '700 26px Inter, system-ui, sans-serif';
        ctx.fillStyle = '#111';
        ctx.fillText('PREMIUM', w - 195, 74);
      }
      if ((daily?.streak || points?.streak) && (daily?.streak || points?.streak)! > 1) {
        const streakVal = daily?.streak || points?.streak || 0;
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.roundRect(w - 210, daily?.isPremium ? 100 : 40, 150, 46, 12);
        ctx.fill();
        ctx.strokeStyle = '#b45309';
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.font = '700 26px Inter, system-ui, sans-serif';
        ctx.fillStyle = '#b45309';
        ctx.fillText(`Streak ${streakVal}`, w - 200, (daily?.isPremium ? 134 : 74));
      }

  // Topic / Quest name (wrap if long)
      const titleYStart = 150;
      const maxWidth = w - 120;
      const wrapText = (text: string, x: number, y: number, lineHeight: number) => {
        const words = text.split(/\s+/); let line = ''; const lines: string[] = [];
        for (const word of words) {
          const test = line ? line + ' ' + word : word;
          if (ctx.measureText(test).width > maxWidth) { lines.push(line); line = word; } else { line = test; }
        }
        if (line) lines.push(line);
        lines.forEach((l, i) => ctx.fillText(l, x, y + i * lineHeight));
        return y + (lines.length - 1) * lineHeight;
      };
      ctx.font = '600 34px Inter, system-ui, sans-serif';
      ctx.fillStyle = '#7a4800';
      const lastTitleY = wrapText(topicTitle, 60, titleYStart, 40);

      // Date + Quest #
      const questNumber = points?.quest_number || 1;
      const fullDate = new Date().toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
      ctx.font = '500 24px Inter, system-ui, sans-serif';
      ctx.fillStyle = '#8a5600';
      ctx.fillText(`${fullDate}  •  Quest #${questNumber}`, 60, lastTitleY + 50);

      // Points gained prominently (daily total if available else last quest)
      ctx.font = '900 120px Inter, system-ui, sans-serif';
      ctx.fillStyle = '#b45309';
      ctx.fillText(`+${(daily?.total_points ?? (points?.gained || 0))}`, 60, lastTitleY + 200);

      // Quest list (up to 6) with per-quest points
      if (daily?.quests?.length) {
        ctx.font = '600 24px Inter, system-ui, sans-serif';
        ctx.fillStyle = '#7a4800';
        const startY = lastTitleY + 240;
        const lineH = 32;
        daily.quests.slice(0,6).forEach((q, i) => {
          const line = `#${q.questNumber} ${q.title} (+${q.points})`;
          ctx.fillText(line, 60, startY + i * lineH);
        });
      }

      // URL footer
      ctx.font = '500 30px Inter, system-ui, sans-serif';
      ctx.fillStyle = '#1f2937';
      const site = (typeof window !== 'undefined' ? window.location.host : 'thequestly.com');
      ctx.fillText(site, 60, h - 60);
      setDataUrl(canvas.toDataURL('image/png'));
    } catch {}
  }, [topicTitle, points?.gained, daily?.total_points, currentQuestNumber, points?.quest_number, daily?.quests, daily?.streak, daily?.isPremium, points?.streak]);

  const shareImage = async () => {
    if (!dataUrl) return;
    setSharing(true);
    try {
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      const file = new File([blob], 'questly.png', { type: 'image/png' });
      const text = `${topicTitle} • Score ${score}/${total} • +${points?.gained || 0} points on Questly`;
    const navShare = (navigator as unknown as { share?: (data: { files?: File[]; text?: string; title?: string }) => Promise<void> }).share;
    if (typeof navShare === 'function') {
        try {
      await navShare({ files: [file], text, title: 'Questly' });
          setSharing(false); return;
        } catch { /* user canceled or unsupported */ }
      }
      // Fallback: open new tab with the image (user can long-press/save for Instagram)
      const win = window.open();
      if (win) win.document.write(`<title>Share Questly</title><img src="${dataUrl}" alt="Questly Share Card" style="max-width:100%;height:auto" />`);
    } finally { setSharing(false); }
  };

  if (dailyLoading && !dataUrl) {
    return (
      <div className="mt-8" aria-labelledby="share-card-heading">
        <h4 id="share-card-heading" className="font-semibold mb-2">Share your daily result</h4>
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
    <div className="mt-8" aria-labelledby="share-card-heading">
      <h4 id="share-card-heading" className="font-semibold mb-2">Share your daily result</h4>
      <div className="rounded-xl border border-amber-300/60 bg-amber-50/70 dark:bg-amber-300/10 p-4 flex flex-col md:flex-row gap-5">
        <Image src={dataUrl} alt="Questly daily share" width={320} height={167} className="w-full md:w-80 h-auto rounded-md border border-amber-200 shadow" />
        <div className="flex-1 text-sm space-y-4">
          <div className="space-y-1">
            <p className="font-medium">Total today: <span className="font-semibold">{daily?.total_points ?? points?.gained ?? 0}</span>{daily?.streak ? <span className="ml-2 text-amber-700 dark:text-amber-300">Streak {daily.streak}</span> : null}{daily?.isPremium ? <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-800 dark:text-amber-200 border border-amber-400/60 text-[10px] font-semibold">Premium</span> : null}</p>
            <ul className="text-xs leading-relaxed max-h-40 overflow-auto pr-1">
              {(daily?.quests || [{ title: topicTitle, points: points?.gained || 0, questNumber: currentQuestNumber, topic_id: '' }]).map(q => (
                <li key={q.topic_id || q.title}>#{q.questNumber} {q.title} (+{q.points})</li>
              ))}
            </ul>
            {!daily || (daily.quests?.length ?? 0) === 1 ? (
              <p className="text-[11px] opacity-70">Complete all daily quests to build a richer share card.</p>
            ) : null}
          </div>
          <div className="flex gap-2 flex-wrap">
            <button onClick={shareImage} disabled={sharing} className="px-4 py-1.5 rounded-lg bg-black text-white text-sm font-medium hover:opacity-90 disabled:opacity-50">{sharing ? 'Sharing…' : 'Share Image'}</button>
            <a href={dataUrl} download="questly.png" className="px-4 py-1.5 rounded-lg border text-sm font-medium hover:bg-white/70" aria-label="Download share image">Download</a>
          </div>
        </div>
      </div>
    </div>
  );
}