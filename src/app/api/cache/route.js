// src/app/api/cache/route.js
import { NextResponse } from 'next/server';
import { getRequestCache } from '@/lib/requestCache.js';

export async function GET() {
  return NextResponse.json(getRequestCache().getStats());
}

export async function DELETE() {
  getRequestCache().clear();
  return NextResponse.json({ success: true, message: 'Cache cleared' });
}
