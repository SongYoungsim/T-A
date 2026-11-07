/**
 * PUT  /api/leave/masters/[id] — 연차 마스터 수정 (ADMIN)
 * GET  /api/leave/masters/[id] — 특정 마스터 조회 + 사용내역 (ADMIN)
 */
import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import {
  getLeaveMasterById,
  getUsedMinutes,
  updateLeaveMaster,
  getEmployeeLeaveUsages,
} from '@/lib/leave';
import { daysToMinutes } from '@/lib/hr-types';

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const actor = await getCurrentUser();
  if (actor?.role !== 'ADMIN') {
    return NextResponse.json({ error: '접근 권한이 없습니다.' }, { status: 403 });
  }

  const { id } = await params;
  const master = await getLeaveMasterById(id);
  if (!master) {
    return NextResponse.json({ error: '연차 마스터를 찾을 수 없습니다.' }, { status: 404 });
  }

  const usedMinutes = await getUsedMinutes(id);
  const usages = await getEmployeeLeaveUsages(master.employeeId, master.year);

  return NextResponse.json({ master, usedMinutes, usages });
}

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

  const { grantedDays, carriedDays } = body as { grantedDays?: unknown; carriedDays?: unknown };

  if (typeof grantedDays !== 'number' || grantedDays < 0) {
    return NextResponse.json({ error: '기본 부여연차는 0 이상이어야 합니다.' }, { status: 400 });
  }
  if (typeof carriedDays !== 'number' || carriedDays < 0) {
    return NextResponse.json({ error: '이월연차는 0 이상이어야 합니다.' }, { status: 400 });
  }

  const grantedMinutes = daysToMinutes(grantedDays);
  const carriedMinutes = daysToMinutes(carriedDays);

  const result = await updateLeaveMaster(id, grantedMinutes, carriedMinutes, actor.employeeId);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
