/**
 * POST /api/attendance/excel-errors — 오류 및 경고 내역 Excel 다운로드 (Phase 8)
 */
import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { generateAttendanceErrorExcel } from '@/lib/attendance-excel';
import type { ExcelAttendancePreviewRow } from '@/lib/hr-types';

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user || user.role !== 'ADMIN') {
    return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });
  }

  let body: { rows: ExcelAttendancePreviewRow[] };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: '요청 본문 형식이 올바르지 않습니다.' }, { status: 400 });
  }

  if (!body.rows || !Array.isArray(body.rows)) {
    return NextResponse.json({ error: '데이터가 없습니다.' }, { status: 400 });
  }

  const fileBytes = generateAttendanceErrorExcel(body.rows);

  return new Response(fileBytes.buffer as ArrayBuffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="attendance_import_errors.xlsx"',
      'Cache-Control': 'no-cache',
    },
  });
}
