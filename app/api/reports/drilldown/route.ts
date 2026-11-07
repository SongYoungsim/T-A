/**
 * GET /api/reports/drilldown — 직원별 월간 일별 근태 상세 Drill-down (Phase 9)
 */
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { getEmployeeMonthlyDrilldown } from '@/lib/reports';

export async function GET(request: Request) {
  const user = await requireAdmin();
  if (!user) {
    return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const employeeId = searchParams.get('employeeId');
  const yearParam = searchParams.get('year');
  const monthParam = searchParams.get('month');

  if (!employeeId) {
    return NextResponse.json({ error: '직원 ID가 필요합니다.' }, { status: 400 });
  }

  const year = yearParam ? parseInt(yearParam, 10) : new Date().getFullYear();
  const month = monthParam ? parseInt(monthParam, 10) : new Date().getMonth() + 1;

  if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
    return NextResponse.json({ error: '올바른 연도와 월을 지정해주세요.' }, { status: 400 });
  }

  try {
    const drilldownData = await getEmployeeMonthlyDrilldown({ employeeId, year, month });
    return NextResponse.json({ ok: true, ...drilldownData });
  } catch (err) {
    console.error('Error fetching employee drilldown:', err);
    return NextResponse.json({ error: '직원 일별 상세를 조회하는 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
