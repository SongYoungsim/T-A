/**
 * POST /api/calendar/seed — 2026~2027 대한민국 법정공휴일 초기 등록 (ADMIN)
 */

import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { seedPublicHolidays } from '@/lib/calendar';

export async function POST() {
  const user = await getCurrentUser();
  if (!user || user.role !== 'ADMIN') {
    return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });
  }

  const result = await seedPublicHolidays(user.employeeId);
  return NextResponse.json({
    ok: true,
    message: `2026~2027 법정공휴일 총 ${result.total}건 중 ${result.inserted}건이 신규 등록되었습니다.`,
    ...result,
  });
}
