'use client';
import { useEffect, useState, useRef } from 'react';
import { track } from '@vercel/analytics';
import { demoQuestionBank } from '@/lib/demoQuestions';
import { useRouter } from 'next/navigation';
import type { Topic as TopicType } from '@/lib/types';
import { useSupabaseUser } from '@/lib/user';
import ChatPane from './ChatPane';

type Question = { q: string; options: string[]; correct_index: number; chosen_index?: number };

const todayDate = () => new Date().toISOString().slice(0, 10);

export default function TopicFlow({ topic, onCompleted }: { topic: TopicType; onCompleted?: () => void }) {
  const [step, setStep] = useState<'quiz' | 'summary' | 'chat'>('quiz');
  const seed = demoQuestionBank[topic.id];
  const [quiz, setQuiz] = useState<Question[]>([]);
  const user = useSupabaseUser();
  useEffect(() => {
    let aborted = false;
    (async () => {
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
          setQuiz((data.quiz || seed?.quiz || []).slice(0, 5));
        }
      } catch {
        if (aborted) return;
        setError('Network error while loading questions; showing a fallback quiz.');
        setQuiz((seed?.quiz || []).slice(0, 5));
      }
    })();
    return () => { aborted = true; };
  }, [topic, seed]);
  const [score, setScore] = useState(0);
  const [points, setPoints] = useState<{ gained: number; bonus: number; multiplier: number; streak?: number } | null>(null);
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

  const submitQuiz = async () => {
    const questions = quiz.map(q => ({ ...q, chosen_index: q.chosen_index ?? -1 }));
    const correct = questions.filter(q => q.chosen_index === q.correct_index).length;
  const total = questions.length;
  setScore(correct);
  track('quiz_completed', { topicId: topic.id, score: correct, total });
  if (busy) return; // prevent duplicate submissions
  setBusy(true);
  setError(null);
    try {
      // Persist attempt (non-blocking — we continue even if it fails)
      let recorded = true;
      try {
        const r1 = await fetch('/api/quiz', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ topic_id: topic.id, questions }) });
        if (!r1.ok) recorded = false;
      } catch { recorded = false; }
      // Progress & points: only call progress API if user is authenticated
  let data: { points_gained: number; bonus: number; multiplier: number; streak?: number } = { points_gained: 0, bonus: 0, multiplier: 1 };
      try {
        const profileRes = await fetch('/api/profile', { credentials: 'include' });
        if (profileRes.ok) {
          // Try to include bearer token like profile route does
          let headers: Record<string,string> = { 'Content-Type': 'application/json' };
          try {
            const { getAccessToken } = await import('@/lib/user');
            const token = await getAccessToken();
            if (token) headers = { ...headers, Authorization: `Bearer ${token}` };
          } catch {}
          const r2 = await fetch('/api/progress', { method: 'POST', credentials: 'include', headers, body: JSON.stringify({ date: todayDate(), topic_id: topic.id, quick_correct: false, quiz_score: correct, quiz_total: total, completed: true }) });
          if (r2.ok) data = await r2.json();
        } else {
          // user not authenticated — skip progress update (quiz attempt still saved)
        }
  } catch {
        // network or other error — keep defaults
      }
  setPoints({ gained: data.points_gained, bonus: data.bonus, multiplier: data.multiplier, streak: data.streak });
  // Fetch a concise summary from the chat API (server-generated)
  try {
    const r = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic, messages: [], content: '', mode: 'summary' })
    });
    const j = await r.json().catch(() => ({}));
    if (r.ok && j?.reply) setSummaryText(String(j.reply));
  } catch {}
  setStep('summary');
  if (onCompleted) onCompleted();
      if (!recorded) setError('We could not save your quiz attempt, but your score is shown below.');
  } catch {
  setError('We could not save your quiz attempt.');
    } finally {
      setBusy(false);
    }
  };

  const shareResult = async () => {
    try {
            const grid = quiz.map(q => (q.chosen_index === q.correct_index ? 'G' : 'R')).join('');
      const date = todayDate();
      const site = (typeof window !== 'undefined' ? window.location.origin : (process.env.NEXT_PUBLIC_SITE_URL || '')) || 'https://thequestly.com';
            const text = `Questly • ${topic.title}\nDate: ${date}\nQuiz: ${score}/${quiz.length}\n${grid}\n${site}`;
      await navigator.clipboard.writeText(text);
      setCopied(true);
      track('share_copied', { topicId: topic.id, score, total: quiz.length });
      setTimeout(() => setCopied(false), 1500);
    } catch {}
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
      <button
        className="mt-2 px-4 py-2 rounded bg-black text-white disabled:opacity-60 focus-visible:outline-2 focus-visible:ring-amber-300 cursor-pointer hover:opacity-90 active:opacity-80"
        onClick={submitQuiz}
        disabled={busy}
        tabIndex={0}
        {...(busy ? { 'aria-disabled': 'true' } : {})}
      >
        {busy ? 'Saving…' : 'Submit'}
      </button>
    </section>
  );

  if (step === 'summary') return (
    <section className="pb-24 sm:pb-0">
      {/* Concise 3–4 sentence summary */}
      <div className="text-base leading-relaxed mb-4">
        <p className="mb-2"><strong>{topic.title}</strong> — nice work. You scored {score}/{quiz.length}.</p>
        {summaryText ? (
          <div className="rounded-xl bg-neutral-50 dark:bg-neutral-900/40 border border-neutral-200/60 dark:border-neutral-800 p-3 text-sm whitespace-pre-wrap">{summaryText}</div>
        ) : (
          <p className="opacity-90">
            {Array.isArray(topic.angles) && topic.angles.length > 0
              ? `${topic.angles.slice(0,3).join('. ')}.`
              : `You reviewed the core ideas for ${topic.title}.`}
          </p>
        )}
        {points?.streak && points.streak > 1 && (
          <p className="opacity-90">Your streak is now {points.streak}. Keep it going.</p>
        )}
        <p className="opacity-90">Want to go deeper? Try a quick search: <a className="underline hover:text-amber-700" href={`https://www.google.com/search?q=${encodeURIComponent(topic.title)}`} target="_blank" rel="noreferrer">Web</a>.</p>
      </div>

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

      {/* Back to Quests below summary */}
      <div className="mt-6">
        <button className="px-4 py-2 rounded border cursor-pointer hover:bg-neutral-50" onClick={() => router.push('/daily')}>Back to Quests</button>
      </div>

      {/* Chat appears after submission, with autoSummary disabled to avoid duplicate summary */}
      <section aria-labelledby="chat-gpt-title" id="chat" className="mt-8">
        <h4 id="chat-gpt-title" className="font-semibold mb-2">Chat with GPT to learn more</h4>
        <ChatPane topic={topic} autoSummary={false} />
      </section>

      {/* Flashy points banner fixed at bottom of section */}
      {points && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 w-[calc(100%-2rem)] max-w-xl sm:static sm:translate-x-0 sm:w-auto mt-0 sm:mt-6 p-4 rounded-xl border-2 border-amber-400 bg-gradient-to-r from-amber-100 to-yellow-50 text-amber-900 flex items-center justify-between shadow-lg">
          <div className="text-lg font-semibold">Points +{points.gained}</div>
          <div className="text-sm">bonus {points.bonus} • x{points.multiplier.toFixed(2)}{points.streak ? ` • Streak ${points.streak}` : ''}</div>
          <button className="px-3 py-1 rounded border text-sm" onClick={shareResult}>{copied ? 'Copied!' : 'Share'}</button>
        </div>
      )}
    </section>
  );

  return (
    <section>
      <p className="mb-3">Open the chat in the topic page below.</p>
    </section>
  );
}