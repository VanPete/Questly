'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { getUpgradeHref } from '@/lib/upgrade';
// Removed ActionBar summarize to simplify UI
import type { Topic } from '@/lib/types';
import { track } from '@vercel/analytics';

export default function ChatPane({ topic, autoSummary = true }: { topic: Topic; autoSummary?: boolean }) {
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
  const requestSummary = useCallback(async () => {
    // Auto summary should not be blocked by user message gating
    if (didAutoRef.current) return;
    didAutoRef.current = true;
    setLoading(true);
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic, messages, content: '', mode: 'summary' })
      });
  let data: { reply?: string } = {};
      try { data = await res.json(); } catch {}
      const reply = data?.reply || '';
      if (reply) {
        setMessages(m => [...m, { role: 'assistant', content: reply }]);
      }
    } catch {}
    setLoading(false);
    setTimeout(() => listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' }), 50);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topic, /* do not depend on messages to keep one-shot */]);

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

  // Auto-generate a brief summary once on open (can be disabled by parent)
  useEffect(() => { if (autoSummary) requestSummary(); }, [requestSummary, autoSummary]);

  useEffect(() => {
    track('chat_opened', { topicId: topic.id });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="mt-4">
  <div ref={listRef} className="space-y-3 max-h-[60vh] overflow-y-auto rounded-2xl p-4 bg-white/60 dark:bg-neutral-900/40">
        {messages.map((m, i) => (
          <div key={i} className={`p-3 rounded-xl whitespace-pre-wrap text-sm ${m.role==='user' ? 'bg-white/90 dark:bg-neutral-900/80' : 'bg-emerald-50/80 dark:bg-emerald-900/20'}`}>
            {m.content}
          </div>
        ))}
      </div>

  {/* Summary button removed */}

      {plan === 'free' && (
        <div className="mt-2 text-xs opacity-80 flex items-center justify-between">
          <span>Free chat limit: {userCount}/{isFinite(userLimit) ? userLimit : 0}</span>
          {gated ? <button onClick={()=>router.push(getUpgradeHref())} className="underline">Upgrade for unlimited chat</button> : null}
        </div>
      )}

  <form className="mt-3 flex gap-2" onSubmit={(e)=>{e.preventDefault(); if(gated){ router.push(getUpgradeHref()); return; } if(!loading && input.trim()) send(input,'explore')}}>
        <input
          className="flex-1 px-3 py-2 rounded-xl bg-white/90 dark:bg-neutral-900/80 focus:outline-none focus:ring-2 focus:ring-amber-400"
          value={input}
          onChange={(e)=>setInput(e.target.value)}
          placeholder="Ask about this topic…"
        />
        {gated ? (
          <button type="button" onClick={()=>router.push(getUpgradeHref())} className="px-4 py-2 rounded-xl font-medium bg-black text-white hover:opacity-90 active:opacity-80">
            Upgrade
          </button>
        ) : (
          <button disabled={loading} className="px-4 py-2 rounded-xl font-medium bg-black text-white disabled:opacity-60 hover:opacity-90 active:opacity-80">
            {loading ? 'Sending…' : 'Send'}
          </button>
        )}
      </form>
    </div>
  );
}