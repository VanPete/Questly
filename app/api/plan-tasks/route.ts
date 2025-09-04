import { NextResponse } from 'next/server';

// Learning Plans feature removed
export async function GET() {
  return NextResponse.json({ error: 'Learning plans removed' }, { status: 410 });
}

export async function POST() {
  return NextResponse.json({ error: 'Learning plans removed' }, { status: 410 });
}

export async function PATCH() {
  return NextResponse.json({ error: 'Learning plans removed' }, { status: 410 });
}
