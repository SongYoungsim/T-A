/**
 * PUT    /api/leave/usages/[id] — 연차 사용 수정 (ADMIN)
 * DELETE /api/leave/usages/[id] — 연차 사용 취소 Soft Delete (ADMIN)
 */
import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { updateLeaveUsage, cancelLeaveUsage } from '@/lib/leave';
import type { LeaveType } from '@/lib/hr-types';
import { LEAVE_TYPE_META } from '@/lib/hr-types';

const VALID_LEAVE_TYPES = Object.keys(LEAVE_TYPE_META) as LeaveType[];

type Params = { params: Promise<{ id: string }> };

export async function PUT(request: Request, { params }: Params) {
  const actor = await getCurrentUser();
  if (actor?.role !== 'ADMIN') {
    return NextResponse.json({ error: '접근 권한이 없습니다.' }, { status: 403 });
  }

  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: '요청 형식이 올바르지 않습니다.' }, { status: 400 });
  }

  const { leaveDate, leaveType } = body as { leaveDate?: unknown; leaveType?: unknown };

  if (typeof leaveDate !== 'string' || !leaveDate) {
    return NextResponse.json({ error: '사용일자가 필요합니다.' }, { status: 400 });
  }
  if (typeof leaveType !== 'string' || !VALID_LEAVE_TYPES.includes(leaveType as LeaveType)) {
    return NextResponse.json({ error: '유효하지 않은 연차 종류입니다.' }, { status: 400 });
  }

  const result = await updateLeaveUsage(id, leaveDate, leaveType as LeaveType, actor.employeeId);
  if (!result.ok) {
    const status =
      result.error.includes('이미') ? 409
      : result.error.includes('마스터') ? 422
      : result.error.includes('부족') ? 422
      : 400;
    return NextResponse.json({ error: result.error }, { status });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: Params) {
  const actor = await getCurrentUser();
  if (actor?.role !== 'ADMIN') {
    return NextResponse.json({ error: '접근 권한이 없습니다.' }, { status: 403 });
  }

  const { id } = await params;
  const result = await cancelLeaveUsage(id, actor.employeeId);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
