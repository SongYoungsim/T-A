/**
 * GET /api/attendance/monthly?year=2026&month=9 — USER 월간 근태
 * 세션 기반 본인 조회만 허용
 */
import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getUserMonthlyAttendance } from '@/lib/attendance';

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const now = new Date();
  const year = parseInt(searchParams.get('year') ?? String(now.getFullYear()), 10);
  const month = parseInt(searchParams.get('month') ?? String(now.getMonth() + 1), 10);

  if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
    return NextResponse.json({ error: '올바른 연도와 월을 입력하세요.' }, { status: 400 });
  }

  // 세션 employeeId만 사용 — 클라이언트 파라미터 신뢰 안 함
  const { days, summary } = await getUserMonthlyAttendance(user.employeeId, year, month);
  return NextResponse.json({ days, summary });
}
