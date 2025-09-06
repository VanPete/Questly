'use client';
import { useEffect, useState, useRef } from 'react';
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
  }, [topic.id, user, lockedAttempt]);
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
  }, [topic, seed, lockedAttempt]);
  const [score, setScore] = useState(0);
  const [points, setPoints] = useState<{ gained: number; bonus: number; multiplier: number; streak?: number; capped?: boolean; duplicate?: boolean } | null>(null);
  const [summaryText, setSummaryText] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
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
        multiplier: 1, // deprecated
        streak: progressData.streak,
        capped: progressData.capped,
        duplicate: progressData.duplicate,
      });
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

  const shareResult = async () => {
    try {
            const grid = quiz.map(q => (q.chosen_index === q.correct_index ? 'G' : 'R')).join('');
      const date = todayDate();
      const site = (typeof window !== 'undefined' ? window.location.origin : (process.env.NEXT_PUBLIC_SITE_URL || '')) || 'https://thequestly.com';
            const text = `Questly • ${topic.title}\nDate: ${date}\nScore: ${score}/${quiz.length}\nPoints: ${points?.gained ?? 0} (base ${(points ? (points.gained - points.bonus) : score*10)} + bonus ${points?.bonus ?? 0})\n${grid}\n${site}`;
      await navigator.clipboard.writeText(text);
      setCopied(true);
      track('share_copied', { topicId: topic.id, score, total: quiz.length });
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  // Remove any leftover "Quick Tip" lines from older summaries
  const sanitizeSummary = (txt: string) => {
    try {
      // Remove Markdown bold "**Quick Tip:** ..." or plain "Quick Tip:" lines
      return txt.replace(/^\s*(\*\*\s*)?Quick\s*Tip:\s*.*$/gim, '').replace(/\n{3,}/g, '\n\n').trim();
    } catch { return txt; }
  };

  if (quiz.length === 0) {
    return (
      <div className="flex items-center gap-3 text-lg font-medium opacity-90">
        <svg className="w-6 h-6 animate-spin text-amber-600" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" role="img">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
        </svg>
        Loading questions…
      </div>
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
              <div className="text-sm font-semibold opacity-80">Score {Math.max(score, quiz.filter(q => q.chosen_index === q.correct_index).length)}/{quiz.length}</div>
            </div>
            {/* Breakdown */}
            {points && (
              <div className="mt-3 text-xs sm:text-[13px] font-medium flex flex-wrap items-center gap-3">
                <BreakdownItem label="Base" value={(points.gained - points.bonus)} tooltip="10 points per correct answer" />
                <BreakdownItem label="Bonus" value={points.bonus} highlight={points.bonus>0} tooltip="Quest completion + streak bonus" />
                {points.streak ? <BreakdownItem label="Streak" value={points.streak} tooltip="Current streak length (adds +2 per extra day)" /> : null}
                {points.capped ? <Badge text="Capped" tooltip="Daily cap reached; additional awards blocked" /> : null}
                {points.duplicate ? <Badge text="Duplicate" tooltip="Already completed today; no new points" /> : null}
              </div>
            )}
          </div>
          <div className="flex flex-col items-end gap-2">
            <button className="px-3 py-1.5 rounded-lg border border-amber-400/70 bg-white/70 hover:bg-white/90 text-sm font-medium shadow-sm backdrop-blur-sm transition-colors" onClick={shareResult}>{copied ? 'Copied!' : 'Share'}</button>
            {!user && <div className="text-[11px] leading-snug max-w-[14ch] text-amber-800/80 dark:text-amber-200/80">Sign in to keep streaks & points.</div>}
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
function BreakdownItem({ label, value, tooltip, highlight }: { label: string; value: number; tooltip?: string; highlight?: boolean }) {
  const formatted = Number.isInteger(value) ? value : Number(value.toFixed(2));
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