/**
 * POST /api/attendance/clock-in — 출근 등록 (USER)
 * 서버 시간 기준 KST 날짜로 기록. 클라이언트 시간 미사용.
 */
import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { clockIn } from '@/lib/attendance';

export async function POST() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  }

  const result = await clockIn(user.employeeId);

  if (!result.ok) {
    const status =
      result.code === 'ALREADY_CLOCKED_IN' ? 409
      : result.code === 'RESIGNED' ? 403
      : result.code === 'ON_LEAVE' ? 403
      : 400;
    return NextResponse.json({ error: result.error, code: result.code }, { status });
  }

  return NextResponse.json({ ok: true, message: result.message });
}
