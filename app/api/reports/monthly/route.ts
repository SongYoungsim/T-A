/**
 * GET /api/reports/monthly — 관리자 월간 통합 근태 리포트 데이터 조회 (Phase 9)
 */
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { getMonthlyAttendanceReport } from '@/lib/reports';
import { todayKST } from '@/lib/attendance';

export async function GET(request: Request) {
  const user = await requireAdmin();
  if (!user) {
    return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const today = todayKST();
  const [currY, currM] = today.split('-').map(Number);

  const yearParam = searchParams.get('year');
  const monthParam = searchParams.get('month');
  const department = searchParams.get('department') || 'ALL';

  const year = yearParam ? parseInt(yearParam, 10) : currY;
  const month = monthParam ? parseInt(monthParam, 10) : currM;

  if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
    return NextResponse.json({ error: '올바른 연도와 월을 지정해주세요.' }, { status: 400 });
  }

  try {
    const reportData = await getMonthlyAttendanceReport({ year, month, department });
    return NextResponse.json({ ok: true, ...reportData });
  } catch (err) {
    console.error('Error fetching monthly attendance report:', err);
    return NextResponse.json({ error: '리포트 데이터를 생성하는 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
