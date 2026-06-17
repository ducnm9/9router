// src/app/api/templates/route.js
import { NextResponse } from 'next/server';
import { getTemplates, createTemplate } from '@/lib/db/repos/templateRepo.js';

export async function GET(request) {
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
