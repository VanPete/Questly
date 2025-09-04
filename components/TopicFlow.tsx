'use client';
import { useEffect, useState, useRef } from 'react';
import { track } from '@vercel/analytics';
import { demoQuestionBank } from '@/lib/demoQuestions';
import { useRouter } from 'next/navigation';
import type { Topic as TopicType } from '@/lib/types';

type Question = { q: string; options: string[]; correct_index: number; chosen_index?: number };

const todayDate = () => new Date().toISOString().slice(0, 10);

export default function TopicFlow({ topic, onCompleted }: { topic: TopicType; onCompleted?: () => void }) {
  const [step, setStep] = useState<'quiz' | 'summary' | 'chat'>('quiz');
  const seed = demoQuestionBank[topic.id];
  const [quiz, setQuiz] = useState<Question[]>([]);
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
        const profileRes = await fetch('/api/profile');
        if (profileRes.ok) {
          // Try to include bearer token like profile route does
          let headers: Record<string,string> = { 'Content-Type': 'application/json' };
          try {
            const { getAccessToken } = await import('@/lib/user');
            const token = await getAccessToken();
            if (token) headers = { ...headers, Authorization: `Bearer ${token}` };
          } catch {}
          const r2 = await fetch('/api/progress', { method: 'POST', headers, body: JSON.stringify({ date: todayDate(), topic_id: topic.id, quick_correct: false, quiz_score: correct, quiz_total: total, completed: true }) });
          if (r2.ok) data = await r2.json();
        } else {
          // user not authenticated — skip progress update (quiz attempt still saved)
        }
  } catch {
        // network or other error — keep defaults
      }
  setPoints({ gained: data.points_gained, bonus: data.bonus, multiplier: data.multiplier, streak: data.streak });
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
    return <div className="opacity-70">Loading questions…</div>;
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
    <section>
      <div className="mb-3 p-3 rounded-md bg-emerald-50 border border-emerald-100 text-sm flex items-center justify-between gap-3">
        <div className="font-medium">Great job — continue to the next Quest</div>
        <div className="flex gap-2">
          <button className="px-3 py-1 rounded bg-white border text-sm focus-visible:outline-2 focus-visible:ring-amber-300 cursor-pointer hover:bg-neutral-50" onClick={() => router.push('/daily')}>Continue</button>
          <button className="px-3 py-1 rounded border text-sm focus-visible:outline-2 focus-visible:ring-amber-300 cursor-pointer hover:bg-neutral-50" onClick={shareResult}>{copied ? 'Copied!' : 'Share'}</button>
        </div>
      </div>
  <h3 className="font-semibold mb-2">Summary & Review</h3>
      <div className="flex flex-wrap gap-2 mb-2">
        {/* High score badge */}
        {score === quiz.length && (
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-green-100 text-green-800 text-xs font-semibold border border-green-300">Perfect Score!</span>
        )}
        {score >= Math.ceil(quiz.length * 0.8) && score < quiz.length && (
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-blue-100 text-blue-800 text-xs font-semibold border border-blue-300">Great Score</span>
        )}
        {/* Streak badge */}
        {points?.streak && points.streak > 1 && (
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-amber-100 text-amber-800 text-xs font-semibold border border-amber-300">Streak {points.streak}</span>
        )}
      </div>
      <p className="mb-2">Score: {score} / {quiz.length}</p>
  {Array.isArray(topic.angles) && topic.angles.length > 0 && (
        <div className="mb-3">
          <div className="font-semibold">Key facts</div>
          <ul className="list-disc pl-5 opacity-90">
    {topic.angles.map((a, i) => (<li key={i}>{a}</li>))}
          </ul>
        </div>
      )}
  <div className="mb-3 space-y-2">
        {quiz.map((q, i) => {
          const correct = q.chosen_index === q.correct_index;
          return (
            <div key={i} className={`p-2 rounded border ${correct ? 'border-green-600' : 'border-amber-600'}`}>
              <div className="font-medium">Q{i+1}. {q.q}</div>
              <div className="text-sm">Your answer: {q.options[q.chosen_index ?? -1] ?? '—'}{!correct ? ` (correct: ${q.options[q.correct_index]})` : ''}</div>
            </div>
          );
        })}
      </div>
      {points && (
        <p className="mb-2">Points +{points.gained} (bonus {points.bonus}, x{points.multiplier.toFixed(2)}{points.streak ? `, Streak ${points.streak}` : ''})</p>
      )}
      <div className="mb-3 text-sm opacity-80">
        Learn more:
        {' '}
        <a className="underline hover:text-amber-700" href={`https://www.google.com/search?q=${encodeURIComponent(topic.title)}`} target="_blank" rel="noreferrer">Web</a>
      </div>
      <div className="flex gap-2">
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