'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ActionBar } from './ActionBar';
import type { Topic } from '@/lib/types';
import { track } from '@vercel/analytics';

export default function ChatPane({ topic, autoSummarize = false }: { topic: Topic; autoSummarize?: boolean }) {
  const [messages, setMessages] = useState<Array<{ role: 'user'|'assistant'; content: string }>>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [plan, setPlan] = useState<'free'|'premium'>('free');
  const router = useRouter();
  const userCount = messages.filter(m => m.role === 'user').length;
  const userLimit = plan === 'premium' ? Infinity : 3;
  const gated = userCount >= userLimit;

  useEffect(() => {
    fetch('/api/subscription').then(r=>r.json()).then(d => setPlan(d.plan === 'premium' ? 'premium' : 'free')).catch(()=>{});
  }, []);

  // Auto trigger a summary once after quiz completes
  const didAutoRef = useRef(false);

  const send = useCallback(async (content: string, mode: 'explore'|'summary'|'plan'|'quiz'|'examples' = 'explore') => {
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
  }, [gated, messages, topic, conversationId]);

  useEffect(() => {
    if (autoSummarize && !didAutoRef.current) {
      didAutoRef.current = true;
      send('Summarize so far', 'summary');
    }
  }, [autoSummarize, send]);

  useEffect(() => {
    track('chat_opened', { topicId: topic.id });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="mt-4">
      <div ref={listRef} className="space-y-3 max-h-[60vh] overflow-y-auto rounded-2xl p-4 bg-white/60 dark:bg-neutral-900/40 border">
        <div className="text-sm opacity-80 rounded-xl border p-3 bg-neutral-50/70 dark:bg-neutral-900/30">
          <p className="mb-2">{topic.seedContext}</p>
          {Array.isArray(topic.angles) && topic.angles.length > 0 && (
            <ul className="list-disc ml-6">
              {topic.angles.map((a: string, i: number) => <li key={i}>{a}</li>)}
            </ul>
          )}
        </div>
        {messages.map((m, i) => (
          <div key={i} className={`p-3 rounded-xl border whitespace-pre-wrap text-sm ${m.role==='user' ? 'bg-white dark:bg-neutral-900' : 'bg-emerald-50/70 dark:bg-emerald-900/20'}`}>
            {m.content}
          </div>
        ))}
      </div>

  <ActionBar onAction={() => {
        track('action_click', { action: 'summary', topicId: topic.id });
        send('Summarize so far', 'summary');
      }} />

      {plan === 'free' && (
        <div className="mt-2 text-xs opacity-80 flex items-center justify-between">
          <span>Free chat limit: {userCount}/{isFinite(userLimit) ? userLimit : 0}</span>
          {gated ? <button onClick={()=>router.push('/upgrade')} className="underline">Upgrade for unlimited chat</button> : null}
        </div>
      )}

      <form className="mt-3 flex gap-2" onSubmit={(e)=>{e.preventDefault(); if(gated){ router.push('/upgrade'); return; } if(!loading && input.trim()) send(input,'explore')}}>
        <input
          className="flex-1 px-3 py-2 rounded-xl border bg-white dark:bg-neutral-900"
          value={input}
          onChange={(e)=>setInput(e.target.value)}
          placeholder="Ask about this topic…"
        />
        {gated ? (
          <button type="button" onClick={()=>router.push('/upgrade')} className="px-4 py-2 rounded-xl border font-medium">
            Upgrade
          </button>
        ) : (
          <button disabled={loading} className="px-4 py-2 rounded-xl border font-medium">
            {loading ? '…' : 'Send'}
          </button>
        )}
      </form>
    </div>
  );
}