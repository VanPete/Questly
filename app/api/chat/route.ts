import { NextResponse } from 'next/server';
import { OPENAI_MODEL } from '@/lib/openai';

export async function POST(request: Request) {
  // Placeholder chat route; simply echoes a basic response using mode.
  const body = await request.json();
  const { content, mode } = body as { content: string; mode: string };
  let reply = '';
  switch (mode) {
    case 'summary':
      reply = 'Here is a brief summary based on our discussion (demo).';
      break;
    case 'plan':
      reply = 'Day 1-7 plan (demo).';
      break;
    case 'quiz':
      reply = '1) Question one... 2) Question two... (demo)';
      break;
    case 'examples':
      reply = 'Example A; Example B; Example C (demo).';
      break;
    default:
      reply = `You said: ${content}. Model: ${OPENAI_MODEL}`;
  }
  return NextResponse.json({ reply });
}
