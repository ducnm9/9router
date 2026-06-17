// src/app/api/templates/[id]/route.js
import { NextResponse } from 'next/server';
import { getTemplateById, updateTemplate, deleteTemplate } from '@/lib/db/repos/templateRepo.js';

export async function GET(request, { params }) {
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
