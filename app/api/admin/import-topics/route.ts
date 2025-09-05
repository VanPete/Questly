import { NextResponse } from 'next/server';
import { getServerClient } from '@/lib/supabaseServer';
import { currentUser } from '@clerk/nextjs/server';
import { promises as fs } from 'fs';
import path from 'path';

export const runtime = 'nodejs';

// Lightweight CSV parser for our well-formed Topics.csv (quoted headers)
function parseCSV(text: string): Array<Record<string, string>> {
  // Assumes standard CSV with double-quoted fields and commas, no embedded newlines inside fields except via \n sequences already escaped.
  // We'll use a simple state machine adequate for our curated file.
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cur += '"'; i++; } else { inQuotes = false; }
      } else {
        cur += ch;
      }
    } else {
      if (ch === '"') { inQuotes = true; }
      else if (ch === ',') { row.push(cur); cur = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (cur !== '' || row.length) { row.push(cur); rows.push(row); row = []; cur = ''; }
        // swallow \r in \r\n
        if (ch === '\r' && text[i + 1] === '\n') i++;
      } else {
        cur += ch;
      }
    }
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  if (rows.length === 0) return [];
  const headers = rows[0].map(h => h.replace(/^"|"$/g, '')).map(h => h.trim());
  return rows.slice(1).filter(r => r.length && r.some(v => v.trim() !== '')).map(r => {
    const obj: Record<string, string> = {};
    for (let i = 0; i < headers.length; i++) obj[headers[i]] = (r[i] ?? '').replace(/^"|"$/g, '');
    return obj;
  });
}

function toSlug(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

async function readTopicsCSV(): Promise<string> {
  const candidates = [
    path.join(process.cwd(), 'Topics.csv'),
    path.join(process.cwd(), 'public', 'Topics.csv'),
  ];
  const tried: string[] = [];
  for (const p of candidates) {
    try {
      const data = await fs.readFile(p, 'utf8');
      return data;
    } catch {
      tried.push(p);
    }
  }
  throw new Error('Topics.csv not found. Tried: ' + tried.join(' | '));
}

export async function POST(request: Request) {
  // Security: allow via Vercel cron or shared secret; in non-prod allow authenticated manual run.
  const headers = request.headers;
  const cronHeader = headers.get('x-vercel-cron');
  const secretHeader = headers.get('x-cron-secret');
  const supabase = await getServerClient();
  if (!(cronHeader || (process.env.CRON_SECRET && secretHeader === process.env.CRON_SECRET))) {
    if (process.env.NODE_ENV === 'production') return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const u = await currentUser();
  if (!u?.id) return NextResponse.json({ error: 'auth required' }, { status: 401 });
  }

  try {
  const text = await readTopicsCSV();
    const rows = parseCSV(text);
    if (rows.length === 0) return NextResponse.json({ error: 'no_rows' }, { status: 400 });

    const upserts = rows.map((r) => {
      const title = r.title?.trim() || '';
      const domain = r.domain?.trim() || '';
      const difficulty = r.difficulty?.trim() || '';
      const blurb = r.blurb?.trim() || '';
      const anglesRaw = r.angles?.trim() || '[]';
      const seed_context = r.seed_context?.replace(/\\n/g, '\n') || '';
      const tagsStr = r.tags?.trim() || '';
      let angles: unknown = [];
      try { angles = JSON.parse(anglesRaw); } catch { angles = []; }
      const tags = tagsStr ? tagsStr.split(',').map(s => s.trim()).filter(Boolean) : [];
      const id = toSlug(`${domain}-${difficulty}-${title}`);
      return { id, title, domain, difficulty, blurb, angles, seed_context, tags };
    });

    // Upsert in chunks to avoid payload limits
    const chunkSize = 500;
    for (let i = 0; i < upserts.length; i += chunkSize) {
      const chunk = upserts.slice(i, i + chunkSize);
      const { error } = await supabase.from('topics').upsert(chunk, { onConflict: 'id' });
      if (error) throw new Error(error.message);
    }

    return NextResponse.json({ ok: true, count: upserts.length });
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function GET(request: Request) {
  return POST(request);
}
