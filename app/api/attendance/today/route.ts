/**
 * GET /api/attendance/today — 오늘 근태 조회 (USER 본인)
 */
import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getTodayAttendanceSummary } from '@/lib/attendance';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  }

  const today = await getTodayAttendanceSummary(user.employeeId);
  return NextResponse.json({ today });
}
