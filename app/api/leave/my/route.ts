/**
 * GET /api/leave/my?year=YYYY — USER 본인 연차 요약 + 사용내역 (USER)
 * 세션에서 employeeId를 가져오므로 클라이언트 파라미터의 직원ID를 신뢰하지 않음
 */
import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getUserLeaveSummary, getUserLeaveUsages } from '@/lib/leave';

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  }

  const url = new URL(request.url);
  const yearParam = url.searchParams.get('year');
  const year = yearParam
    ? parseInt(yearParam, 10)
    : new Intl.DateTimeFormat('en', { year: 'numeric', timeZone: 'Asia/Seoul' }).format(new Date());

  const yearNum = typeof year === 'string' ? parseInt(year, 10) : year;
  if (isNaN(yearNum) || yearNum < 2000 || yearNum > 2100) {
    return NextResponse.json({ error: '유효하지 않은 연도입니다.' }, { status: 400 });
  }

  // 세션의 employeeId 사용 — 클라이언트 파라미터 무시
  const [summary, usages] = await Promise.all([
    getUserLeaveSummary(user.employeeId, yearNum),
    getUserLeaveUsages(user.employeeId, yearNum),
  ]);

  return NextResponse.json({ summary, usages });
}
