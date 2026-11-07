/**
 * PUT /api/attendance/[id] — ADMIN 출퇴근 시간 보정
 * POST /api/attendance/[id] — ADMIN 신규 근태 등록 (없는 날짜 보정용)
 */
import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { adminEditAttendance, adminCreateAttendance } from '@/lib/attendance';

type Params = { params: Promise<{ id: string }> };

/**
 * PUT — 기존 attendance 레코드 보정
 * Body: { checkInAt?: string|null, checkOutAt?: string|null, reason: string }
 */
export async function PUT(request: Request, { params }: Params) {
  const user = await getCurrentUser();
  if (!user || user.role !== 'ADMIN') {
    return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json() as {
    checkInAt?: string | null;
    checkOutAt?: string | null;
    reason?: string;
  };

  if (!body.reason?.trim()) {
    return NextResponse.json({ error: '수정 사유를 입력해주세요.' }, { status: 400 });
  }

  const result = await adminEditAttendance({
    attendanceId: id,
    checkInAt: body.checkInAt ?? null,
    checkOutAt: body.checkOutAt ?? null,
    reason: body.reason.trim(),
    actorId: user.employeeId,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}

/**
 * POST — 없는 날짜에 ADMIN이 새 attendance 생성 (보정용)
 * Body: { employeeId, workDate, checkInAt?, checkOutAt?, reason }
 */
export async function POST(request: Request, { params: _ }: Params) {
  const user = await getCurrentUser();
  if (!user || user.role !== 'ADMIN') {
    return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
  }

  const body = await request.json() as {
    employeeId?: string;
    workDate?: string;
    checkInAt?: string | null;
    checkOutAt?: string | null;
    reason?: string;
  };

  if (!body.employeeId || !body.workDate || !body.reason?.trim()) {
    return NextResponse.json({ error: '필수 항목이 누락되었습니다.' }, { status: 400 });
  }

  const result = await adminCreateAttendance({
    employeeId: body.employeeId,
    workDate: body.workDate,
    checkInAt: body.checkInAt ?? null,
    checkOutAt: body.checkOutAt ?? null,
    reason: body.reason.trim(),
    actorId: user.employeeId,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 409 });
  }

  return NextResponse.json({ ok: true, id: result.id });
}
