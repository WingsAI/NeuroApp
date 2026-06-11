import { NextRequest, NextResponse } from 'next/server';
import { buildReportHtml } from '@/lib/report-html';
import { requireAuth } from '@/lib/auth';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  // Protege dados sensíveis do paciente (nome, CPF, diagnóstico, imagens).
  try {
    await requireAuth();
  } catch {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  // O id é o examId
  const html = await buildReportHtml(params.id);

  if (!html) {
    return new NextResponse('Report not found', { status: 404 });
  }

  return new NextResponse(html, {
    headers: { 'Content-Type': 'text/html' },
  });
}
