/**
 * POST /api/attendance/clock-out — 퇴근 등록 (USER)
 */
import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { clockOut } from '@/lib/attendance';

export async function POST() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  }

  const result = await clockOut(user.employeeId);

  if (!result.ok) {
    const status =
      result.code === 'ALREADY_CLOCKED_OUT' ? 409
      : result.code === 'NO_CLOCK_IN' ? 422
      : 400;
    return NextResponse.json({ error: result.error, code: result.code }, { status });
  }

  return NextResponse.json({ ok: true, message: result.message });
}
