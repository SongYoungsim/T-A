/**
 * GET /api/attendance/admin-monthly?year=2026&month=9&employeeId=&department=&status=
 * ADMIN 월간 근태 조회
 */
import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { listMonthlyAttendanceAdmin } from '@/lib/attendance';
import type { AttendanceStatus } from '@/lib/hr-types';

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user || user.role !== 'ADMIN') {
    return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const now = new Date();
  const year = parseInt(searchParams.get('year') ?? String(now.getFullYear()), 10);
  const month = parseInt(searchParams.get('month') ?? String(now.getMonth() + 1), 10);
  const employeeId = searchParams.get('employeeId') ?? undefined;
  const department = searchParams.get('department') ?? undefined;
  const status = searchParams.get('status') as AttendanceStatus | null ?? undefined;

  if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
    return NextResponse.json({ error: '올바른 연도와 월을 입력하세요.' }, { status: 400 });
  }

  const rows = await listMonthlyAttendanceAdmin({ year, month, employeeId, department, status });
  return NextResponse.json({ rows });
}
