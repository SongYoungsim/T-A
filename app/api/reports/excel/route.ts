/**
 * GET /api/reports/excel — 월간 근태 다중 시트 Excel 리포트 다운로드 (Phase 9)
 */
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { getMonthlyAttendanceReport, generateMonthlyReportExcel } from '@/lib/reports';
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
    const excelBuffer = generateMonthlyReportExcel({
      year,
      month,
      kpi: reportData.kpi,
      employeeSummaries: reportData.employeeSummaries,
      departmentSummaries: reportData.departmentSummaries,
    });

    const padMonth = String(month).padStart(2, '0');
    const fileName = `attendance_monthly_report_${year}${padMonth}.xlsx`;

    return new Response(excelBuffer.buffer as ArrayBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Cache-Control': 'no-cache',
      },
    });
  } catch (err) {
    console.error('Error generating monthly report Excel:', err);
    return NextResponse.json({ error: 'Excel 리포트를 생성하는 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
