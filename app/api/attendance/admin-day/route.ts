/**
 * GET /api/attendance/admin-day?date=2026-09-26
 * ADMIN 특정 날짜 전직원 근태 조회
 */
import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { listDayAttendanceAdmin } from '@/lib/attendance';

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user || user.role !== 'ADMIN') {
    return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const date = searchParams.get('date');

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: '날짜 형식이 올바르지 않습니다. (YYYY-MM-DD)' }, { status: 400 });
  }

  try {
    console.log('[attendance-admin-day] start', { date });

    const rows = await listDayAttendanceAdmin(date);

    console.log('[attendance-admin-day] success', {
      date,
      rowCount: rows.length,
    });

    return NextResponse.json({ rows });
  } catch (error) {
    console.error('[attendance-admin-day] failed', {
      date,
      error:
        error instanceof Error
          ? {
            name: error.name,
            message: error.message,
            stack: error.stack,
          }
          : String(error),
    });

    return NextResponse.json(
      { error: '근태 조회 중 서버 오류가 발생했습니다.' },
      { status: 500 },
    );
  }
}
