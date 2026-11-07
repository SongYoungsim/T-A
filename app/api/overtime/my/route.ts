/**
 * /api/overtime/my — USER 본인 연장근무 및 휴일근무 조회 API
 * Phase 6: 사원 본인의 기록만 서버 세션 Employee ID 기준으로 안전하게 조회
 *
 * GET: 본인의 연장근무 목록 및 월간 요약 조회 (타인 조회 불가)
 */

import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { listUserOvertime, calculateOvertimeSummary } from '@/lib/overtime';

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
  }

  // 타 직원의 employee_id 파라미터 전달 여부와 무관하게 세션의 본인 ID만 사용 (보안 검증)
  const employeeId = user.employeeId;

  const { searchParams } = new URL(request.url);
  const now = new Date();
  const year = parseInt(searchParams.get('year') || String(now.getFullYear()), 10);
  const month = parseInt(searchParams.get('month') || String(now.getMonth() + 1), 10);

  const records = await listUserOvertime(employeeId, year, month);
  const summary = calculateOvertimeSummary(records);

  return NextResponse.json({
    ok: true,
    year,
    month,
    records,
    summary,
  });
}
