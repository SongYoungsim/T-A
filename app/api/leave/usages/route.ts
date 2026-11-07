/**
 * POST /api/leave/usages — 연차 사용 등록 (ADMIN)
 */
import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { registerLeaveUsage } from '@/lib/leave';
import type { LeaveType } from '@/lib/hr-types';
import { LEAVE_TYPE_META } from '@/lib/hr-types';

const VALID_LEAVE_TYPES = Object.keys(LEAVE_TYPE_META) as LeaveType[];

export async function POST(request: Request) {
  const actor = await getCurrentUser();
  if (actor?.role !== 'ADMIN') {
    return NextResponse.json({ error: '접근 권한이 없습니다.' }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: '요청 형식이 올바르지 않습니다.' }, { status: 400 });
  }

  const { employeeId, leaveDate, leaveType } = body as {
    employeeId?: unknown;
    leaveDate?: unknown;
    leaveType?: unknown;
  };

  if (typeof employeeId !== 'string' || !employeeId) {
    return NextResponse.json({ error: '직원 ID가 필요합니다.' }, { status: 400 });
  }
  if (typeof leaveDate !== 'string' || !leaveDate) {
    return NextResponse.json({ error: '사용일자가 필요합니다.' }, { status: 400 });
  }
  if (typeof leaveType !== 'string' || !VALID_LEAVE_TYPES.includes(leaveType as LeaveType)) {
    return NextResponse.json({ error: '유효하지 않은 연차 종류입니다.' }, { status: 400 });
  }

  const result = await registerLeaveUsage(
    employeeId,
    leaveDate,
    leaveType as LeaveType,
    actor.employeeId,
  );

  if (!result.ok) {
    const status =
      result.error.includes('이미') ? 409
      : result.error.includes('마스터') ? 422
      : result.error.includes('부족') ? 422
      : 400;
    return NextResponse.json({ error: result.error }, { status });
  }

  return NextResponse.json({ ok: true, id: result.id }, { status: 201 });
}
