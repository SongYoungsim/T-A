/**
 * GET /api/attendance/excel-template — 표준 Excel 양식 다운로드 (Phase 8)
 */
import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { generateAttendanceExcelTemplate } from '@/lib/attendance-excel';

export async function GET() {
  const user = await getCurrentUser();
  if (!user || user.role !== 'ADMIN') {
    return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });
  }

  const fileBytes = generateAttendanceExcelTemplate();

  return new Response(fileBytes.buffer as ArrayBuffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="attendance_import_template.xlsx"',
      'Cache-Control': 'no-cache',
    },
  });
}
