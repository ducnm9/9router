// src/app/api/cache/route.js
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSettings } from '@/lib/localDb';
import { verifyDashboardAuthToken } from '@/lib/auth/dashboardSession';
import { getRequestCache } from '@/lib/requestCache.js';

async function requireAuth() {
  const settings = await getSettings();
  if (settings.requireLogin !== false) {
    const cookieStore = await cookies();
    const token = cookieStore.get('auth_token')?.value;
    if (!(await verifyDashboardAuthToken(token))) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
  }
  return null;
}

export async function GET() {
  const authError = await requireAuth();
  if (authError) return authError;
  return NextResponse.json(getRequestCache().getStats());
}

export async function DELETE() {
  const authError = await requireAuth();
  if (authError) return authError;
  getRequestCache().clear();
  return NextResponse.json({ success: true, message: 'Cache cleared' });
}
