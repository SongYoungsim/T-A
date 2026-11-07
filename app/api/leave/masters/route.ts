/**
 * POST /api/leave/masters — 연차 마스터 생성 (ADMIN)
 * GET  /api/leave/masters?year=YYYY — 연도별 전직원 연차 현황 (ADMIN)
 */
import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { createLeaveMaster, listLeaveStatus } from '@/lib/leave';
import { daysToMinutes } from '@/lib/hr-types';

async function isAdmin() {
  return (await getCurrentUser())?.role === 'ADMIN';
}

export async function GET(request: Request) {
  const actor = await getCurrentUser();
  if (actor?.role !== 'ADMIN') {
    return NextResponse.json({ error: '접근 권한이 없습니다.' }, { status: 403 });
  }

  const url = new URL(request.url);
  const year = parseInt(url.searchParams.get('year') ?? String(new Date().getFullYear()), 10);
  const includeResigned = url.searchParams.get('includeResigned') === 'true';

  if (isNaN(year) || year < 2000 || year > 2100) {
    return NextResponse.json({ error: '유효하지 않은 연도입니다.' }, { status: 400 });
  }

  const rows = await listLeaveStatus(year, includeResigned);
  return NextResponse.json({ year, rows });
}

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

  const { employeeId, year, grantedDays, carriedDays } = body as {
    employeeId?: unknown;
    year?: unknown;
    grantedDays?: unknown;
    carriedDays?: unknown;
  };

  if (typeof employeeId !== 'string' || !employeeId) {
    return NextResponse.json({ error: '직원 ID가 필요합니다.' }, { status: 400 });
  }
  if (typeof year !== 'number' || year < 2000 || year > 2100) {
    return NextResponse.json({ error: '유효하지 않은 연도입니다.' }, { status: 400 });
  }
  if (typeof grantedDays !== 'number' || grantedDays < 0) {
    return NextResponse.json({ error: '기본 부여연차는 0 이상이어야 합니다.' }, { status: 400 });
  }
  if (typeof carriedDays !== 'number' || carriedDays < 0) {
    return NextResponse.json({ error: '이월연차는 0 이상이어야 합니다.' }, { status: 400 });
  }

  // 일 단위 → 분 단위 변환 (0.125일 = 60분, 정밀도 손실 방지)
  const grantedMinutes = daysToMinutes(grantedDays);
  const carriedMinutes = daysToMinutes(carriedDays);

  const result = await createLeaveMaster(
    employeeId,
    year,
    grantedMinutes,
    carriedMinutes,
    actor.employeeId,
  );

  if (!result.ok) {
    const status = result.error.includes('이미 존재') ? 409 : 400;
    return NextResponse.json({ error: result.error }, { status });
  }

  return NextResponse.json({ ok: true, id: result.id }, { status: 201 });
}
