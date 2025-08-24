'use client';
import { useEffect, useState } from 'react';
import { demoQuestionBank } from '@/lib/demoQuestions';
import { useRouter } from 'next/navigation';
import type { Topic as TopicType } from '@/lib/types';

type Question = { q: string; options: string[]; correct_index: number; chosen_index?: number };

const todayDate = () => new Date().toISOString().slice(0, 10);

export default function TopicFlow({ topic }: { topic: TopicType }) {
  const [step, setStep] = useState<'intro' | 'quick' | 'quiz' | 'summary' | 'chat'>('intro');
  const seed = demoQuestionBank[topic.id];
  const [quick, setQuick] = useState<Question | null>(null);
  const [quiz, setQuiz] = useState<Question[]>([]);
  useEffect(() => {
    let aborted = false;
    (async () => {
      try {
        const r = await fetch('/api/questions/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ topic }) });
        const data = r.ok ? await r.json() : seed;
        if (aborted) return;
        setQuick(data.quick || seed?.quick || { q: 'Warmup?', options: ['A','B','C','D'], correct_index: 1 });
        setQuiz((data.quiz || seed?.quiz || []).slice(0, 5));
      } catch {
        if (aborted) return;
        setQuick(seed?.quick || { q: 'Warmup?', options: ['A','B','C','D'], correct_index: 1 });
        setQuiz((seed?.quiz || []).slice(0, 5));
      }
    })();
    return () => { aborted = true; };
  }, [topic, seed]);
  const [score, setScore] = useState(0);
  const [points, setPoints] = useState<{ gained: number; bonus: number; multiplier: number; streak?: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const submitQuick = (choice: number) => {
    if (!quick) return;
    setQuick({ ...quick, chosen_index: choice });
    setStep('quiz');
  };

  const submitQuiz = async () => {
    const questions = quiz.map(q => ({ ...q, chosen_index: q.chosen_index ?? -1 }));
    const correct = questions.filter(q => q.chosen_index === q.correct_index).length;
    setScore(correct);
    setBusy(true);
    setError(null);
    try {
      // Persist attempt
      const r1 = await fetch('/api/quiz', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ topic_id: topic.id, questions }) });
      if (!r1.ok) throw new Error('Failed to save quiz');
      // Progress & points
  const r2 = await fetch('/api/progress', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ date: todayDate(), topic_id: topic.id, quick_correct: !!quick && quick.chosen_index === quick.correct_index, quiz_score: correct, quiz_total: questions.length, completed: true }) });
      const data = r2.ok ? await r2.json() : { points_gained: 0, bonus: 0, multiplier: 1 };
      setPoints({ gained: data.points_gained, bonus: data.bonus, multiplier: data.multiplier, streak: data.streak });
      setStep('summary');
  } catch {
      setError('Could not save your progress. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  if (!quick || quiz.length === 0) {
    return <div className="opacity-70">Loading questions…</div>;
  }

  if (step === 'intro') return (
    <section>
      <h2 className="text-2xl font-semibold mb-2">{topic.title}</h2>
      <p className="opacity-80 mb-4">{topic.blurb}</p>
      <button className="px-4 py-2 rounded bg-black text-white" onClick={() => setStep('quick')}>Start</button>
    </section>
  );

  if (step === 'quick') return (
    <section>
      <h3 className="font-semibold mb-2">Quick Question</h3>
      <p className="mb-3">{quick.q}</p>
      <div className="grid gap-2">
        {quick.options.map((opt, i) => (
          <button key={i} className="border rounded px-3 py-2 text-left hover:bg-gray-50" onClick={() => submitQuick(i)}>
            {opt}
          </button>
        ))}
      </div>
    </section>
  );

  if (step === 'quiz') return (
    <section>
      <h3 className="font-semibold mb-2">Mini Quiz (5)</h3>
      {error && <div className="text-red-600 mb-2">{error}</div>}
      {quiz.map((q, idx) => (
        <div key={idx} className="mb-3">
          <p className="mb-1">{q.q}</p>
          <div className="grid gap-2">
            {q.options.map((opt, i) => (
              <button key={i} className={`border rounded px-3 py-2 text-left hover:bg-gray-50 ${q.chosen_index === i ? 'border-black' : ''}`} onClick={() => {
                const next = [...quiz];
                next[idx] = { ...q, chosen_index: i };
                setQuiz(next);
              }}>{opt}</button>
            ))}
          </div>
        </div>
      ))}
      <button className="mt-2 px-4 py-2 rounded bg-black text-white disabled:opacity-60" onClick={submitQuiz} disabled={busy}>Submit</button>
    </section>
  );

  if (step === 'summary') return (
    <section>
      <h3 className="font-semibold mb-2">Summary & Review</h3>
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
        <a className="underline" href={`https://en.wikipedia.org/wiki/Special:Search?search=${encodeURIComponent(topic.title)}`} target="_blank" rel="noreferrer">Wikipedia</a>
        {' · '}
        <a className="underline" href={`https://www.google.com/search?q=${encodeURIComponent(topic.title)}`} target="_blank" rel="noreferrer">Web</a>
      </div>
      <div className="flex gap-2">
        <button className="px-4 py-2 rounded border" onClick={() => setStep('chat')}>Chat to Explore More</button>
        <button className="px-4 py-2 rounded border" onClick={() => router.push('/daily')}>Back to Daily</button>
      </div>
    </section>
  );

  return (
    <section>
      <p className="mb-3">Open the chat in the topic page below.</p>
    </section>
  );
}