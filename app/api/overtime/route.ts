/**
 * /api/overtime — 연장근무 및 휴일근무 관리 API (ADMIN 전용)
 * Phase 6: 평일연장(OVERTIME)과 휴일근무(HOLIDAY_WORK) 통합 관리
 *
 * GET: 연장근무 목록 및 월간 요약 조회
 * POST: 연장근무 등록
 * PUT: 연장근무 수정
 * DELETE: 연장근무 취소 (Soft Delete 및 Audit Log 기록)
 */

import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import {
  listOvertimeAdmin,
  calculateOvertimeSummary,
  createOvertimeWork,
  updateOvertimeWork,
  cancelOvertimeWork,
  determineWorkTypeDetail,
  validateEmployeeForOvertime,
} from '@/lib/overtime';
import type { WorkType } from '@/lib/hr-types';

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user || user.role !== 'ADMIN') {
    return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);

  // 근무구분 자동판정 단독 조회 (Form UI용)
  if (searchParams.get('action') === 'determine') {
    const date = searchParams.get('date');
    const employeeId = searchParams.get('employeeId');
    if (!date) {
      return NextResponse.json({ error: '날짜가 필요합니다.' }, { status: 400 });
    }

    const determination = await determineWorkTypeDetail(date);
    let empValidation: { valid: boolean; error?: string } = { valid: true };
    if (employeeId) {
      const res = await validateEmployeeForOvertime(employeeId, date);
      empValidation = { valid: res.ok, error: res.ok ? undefined : res.error };
    }

    return NextResponse.json({
      ok: true,
      date,
      workType: determination.workType,
      isWorkday: determination.isWorkday,
      dayType: determination.dayType,
      dayName: determination.dayName,
      employeeValid: empValidation.valid,
      employeeError: empValidation.error,
    });
  }

  const now = new Date();
  const year = parseInt(searchParams.get('year') || String(now.getFullYear()), 10);
  const month = parseInt(searchParams.get('month') || String(now.getMonth() + 1), 10);
  const employeeId = searchParams.get('employeeId') || undefined;
  const department = searchParams.get('department') || undefined;
  const workType = (searchParams.get('workType') as WorkType) || undefined;

  const records = await listOvertimeAdmin({
    year,
    month,
    employeeId,
    department,
    workType,
  });

  const summary = calculateOvertimeSummary(records);

  return NextResponse.json({
    ok: true,
    year,
    month,
    records,
    summary,
  });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user || user.role !== 'ADMIN') {
    return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });
  }

  let body: {
    employeeId?: string;
    workDate?: string;
    startTime?: string;
    endTime?: string;
    workDescription?: string;
    grantCompLeave?: boolean;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청 본문입니다.' }, { status: 400 });
  }

  const { employeeId, workDate, startTime, endTime, workDescription, grantCompLeave } = body;

  if (!employeeId || !workDate || !startTime || !endTime || !workDescription) {
    return NextResponse.json(
      { error: '직원, 근무일자, 시작시간, 종료시간, 업무내용은 필수 항목입니다.' },
      { status: 400 },
    );
  }

  const result = await createOvertimeWork({
    employeeId,
    workDate,
    startTime,
    endTime,
    workDescription,
    grantCompLeave: Boolean(grantCompLeave),
    actorId: user.employeeId,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    id: result.id,
    workType: result.workType,
    actualMinutes: result.actualMinutes,
  });
}

export async function PUT(request: Request) {
  const user = await getCurrentUser();
  if (!user || user.role !== 'ADMIN') {
    return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });
  }

  let body: {
    id?: string;
    workDate?: string;
    startTime?: string;
    endTime?: string;
    workDescription?: string;
    grantCompLeave?: boolean;
    reason?: string;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청 본문입니다.' }, { status: 400 });
  }

  const { id, workDate, startTime, endTime, workDescription, grantCompLeave, reason } = body;

  if (!id || !workDate || !startTime || !endTime || !workDescription) {
    return NextResponse.json(
      { error: '기록 ID, 근무일자, 시작시간, 종료시간, 업무내용은 필수 항목입니다.' },
      { status: 400 },
    );
  }

  const result = await updateOvertimeWork({
    id,
    workDate,
    startTime,
    endTime,
    workDescription,
    grantCompLeave: Boolean(grantCompLeave),
    actorId: user.employeeId,
    reason,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    workType: result.workType,
    actualMinutes: result.actualMinutes,
  });
}

export async function DELETE(request: Request) {
  const user = await getCurrentUser();
  if (!user || user.role !== 'ADMIN') {
    return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });
  }

  let body: { id?: string; reason?: string } = {};
  const { searchParams } = new URL(request.url);
  const idFromParam = searchParams.get('id');
  const reasonFromParam = searchParams.get('reason');

  try {
    body = await request.json();
  } catch {
    // query param fallback
  }

  const id = body.id || idFromParam;
  const reason = body.reason || reasonFromParam || '관리자 취소';

  if (!id) {
    return NextResponse.json({ error: '취소할 연장근무 기록 ID가 필요합니다.' }, { status: 400 });
  }

  const result = await cancelOvertimeWork({
    id,
    actorId: user.employeeId,
    reason,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
