// src/app/api/templates/[id]/route.js
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSettings } from '@/lib/localDb';
import { verifyDashboardAuthToken } from '@/lib/auth/dashboardSession';
import { getTemplateById, updateTemplate, deleteTemplate } from '@/lib/db/repos/templateRepo.js';

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

export async function GET(request, { params }) {
  const authError = await requireAuth();
  if (authError) return authError;
  try {
    const { id } = await params;
    const template = await getTemplateById(id);
    if (!template) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(template);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PUT(request, { params }) {
  const authError = await requireAuth();
  if (authError) return authError;
  try {
    const { id } = await params;
    const existing = await getTemplateById(id);
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const updates = await request.json();
    const allowed = ['name', 'content', 'category', 'variables'];
    const filtered = {};
    for (const key of allowed) {
      if (updates[key] !== undefined) filtered[key] = updates[key];
    }
    const updated = await updateTemplate(id, filtered);
    return NextResponse.json(updated);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  const authError = await requireAuth();
  if (authError) return authError;
  try {
    const { id } = await params;
    const existing = await getTemplateById(id);
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    await deleteTemplate(id);
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
