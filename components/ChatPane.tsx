'use client';
import { useState, useRef, useEffect } from 'react';
import { ActionBar } from './ActionBar';
import type { Topic } from '@/lib/types';
import { track } from '@vercel/analytics';

export default function ChatPane({ topic }: { topic: Topic }) {
  const [messages, setMessages] = useState<Array<{ role: 'user'|'assistant'; content: string }>>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [plan, setPlan] = useState<'free'|'premium'>('free');
  const userCount = messages.filter(m => m.role === 'user').length;
  const userLimit = plan === 'premium' ? Infinity : 5;
  const gated = userCount >= userLimit;

  useEffect(() => {
    fetch('/api/subscription').then(r=>r.json()).then(d => setPlan(d.plan === 'premium' ? 'premium' : 'free')).catch(()=>{});
  }, []);

  async function send(content: string, mode: 'explore'|'summary'|'plan'|'quiz'|'examples' = 'explore') {
    if (gated) return;
    if (messages.length === 0) {
      track('chat_start', { topicId: topic.id });
      // Create a conversation
      try {
        const resConv = await fetch('/api/conversations', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ topic_id: topic.id, title: topic.title })
        });
        const conv = await resConv.json();
        if (resConv.ok && conv.id) setConversationId(conv.id);
      } catch {}
    }
    setLoading(true);
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic, messages, content, mode })
    });
    let data: { reply?: string; error?: string } = {};
    try {
      data = await res.json();
    } catch {}
  if (!res.ok || !data.reply) {
      setMessages(m => [...m, { role: 'user', content }, { role: 'assistant', content: 'Sorry, I had trouble responding. Please try again.' }]);
      setInput('');
      setLoading(false);
      return;
    }
    const reply: string = data.reply;
  setMessages(m => [...m, { role: 'user', content }, { role: 'assistant', content: reply }]);
    // Persist messages if we have a conversation id
    const cid = conversationId;
    if (cid) {
      try {
        await fetch('/api/messages', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ conversation_id: cid, role: 'user', content }) });
        await fetch('/api/messages', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ conversation_id: cid, role: 'assistant', content: reply }) });
      } catch {}
    }
    setInput('');
    setLoading(false);
    setTimeout(() => listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' }), 50);
  }

  return (
    <div className="mt-4">
      <div ref={listRef} className="space-y-3 max-h-[60vh] overflow-y-auto rounded-2xl p-3 bg-white/60 dark:bg-neutral-900/50 border">
        <div className="text-sm opacity-80">
          <p className="mb-2">{topic.seedContext}</p>
          <ul className="list-disc ml-6">
            {topic.angles?.map((a: string, i: number) => <li key={i}>{a}</li>)}
          </ul>
        </div>
        {messages.map((m, i) => (
          <div key={i} className={`p-3 rounded-2xl ${m.role==='user' ? 'bg-neutral-100 dark:bg-neutral-800' : 'bg-emerald-50 dark:bg-emerald-900/30'}`}>
            <div className="text-xs opacity-60 mb-1">{m.role}</div>
            <div className="whitespace-pre-wrap text-sm">{m.content}</div>
          </div>
        ))}
      </div>

      <ActionBar onAction={(k) => {
        track('action_click', { action: k, topicId: topic.id });
        if (k==='summary') send('Summarize so far', 'summary');
        if (k==='plan') send('Create a 7-day micro-learning plan (20–30 min/day).', 'plan');
        if (k==='quiz') send('Quiz me with 5 questions and hide answers until the end.', 'quiz');
        if (k==='examples') send('Give 3 real-world examples/applications.', 'examples');
      }} />

      {plan === 'free' && (
        <div className="mt-2 text-xs opacity-80">Free chat limit: {userCount}/{isFinite(userLimit) ? userLimit : 0}. {gated ? 'Upgrade for unlimited chat.' : ''}</div>
      )}

      <form className="mt-3 flex gap-2" onSubmit={(e)=>{e.preventDefault(); if(!loading && input.trim() && !gated) send(input,'explore')}}>
        <input
          className="flex-1 px-3 py-2 rounded-xl border bg-white dark:bg-neutral-900"
          value={input}
          onChange={(e)=>setInput(e.target.value)}
          placeholder="Ask about this topic…"
        />
        <button disabled={loading || gated} className="px-4 py-2 rounded-xl border font-medium">
          {gated ? 'Upgrade' : (loading ? '…' : 'Send')}
        </button>
      </form>
    </div>
  );
}