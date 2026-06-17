// src/app/api/templates/route.js
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSettings } from '@/lib/localDb';
import { verifyDashboardAuthToken } from '@/lib/auth/dashboardSession';
import { getTemplates, createTemplate } from '@/lib/db/repos/templateRepo.js';

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

export async function GET(request) {
  const authError = await requireAuth();
  if (authError) return authError;
  try {
    const url = new URL(request.url);
    const category = url.searchParams.get('category') || undefined;
    const templates = await getTemplates({ category });
    return NextResponse.json(templates);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request) {
  const authError = await requireAuth();
  if (authError) return authError;
  try {
    const { name, content, category, variables } = await request.json();
    if (!name || !content) {
      return NextResponse.json({ error: 'name and content are required' }, { status: 400 });
    }
    const template = await createTemplate({ name, content, category, variables });
    return NextResponse.json(template, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
