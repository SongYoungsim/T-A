/**
 * /api/calendar — 근무일 캘린더 관리 API
 * GET: 월별 캘린더 조회
 * POST: 캘린더 예외 등록/수정 (ADMIN 전용)
 * DELETE: 캘린더 예외 삭제 (ADMIN 전용)
 */

import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import {
  listWorkCalendarByMonth,
  getEffectiveWorkdaysInRange,
  upsertWorkCalendar,
  deleteWorkCalendar,
} from '@/lib/calendar';
import type { CalendarDayType } from '@/lib/hr-types';

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const now = new Date();
  const year = parseInt(searchParams.get('year') || String(now.getFullYear()), 10);
  const month = parseInt(searchParams.get('month') || String(now.getMonth() + 1), 10);

  const from = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const to = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  const [dbRecords, effectiveMap] = await Promise.all([
    listWorkCalendarByMonth(year, month),
    getEffectiveWorkdaysInRange(from, to),
  ]);

  const effectiveDays = Array.from(effectiveMap.values());

  return NextResponse.json({
    year,
    month,
    dbRecords,
    effectiveDays,
  });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user || user.role !== 'ADMIN') {
    return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });
  }

  let body: {
    date?: string;
    dayType?: CalendarDayType;
    name?: string;
    memo?: string;
    reason?: string;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청 본문입니다.' }, { status: 400 });
  }

  if (!body.date || !body.dayType) {
    return NextResponse.json({ error: '날짜와 캘린더 유형은 필수입니다.' }, { status: 400 });
  }

  const result = await upsertWorkCalendar({
    date: body.date,
    dayType: body.dayType,
    name: body.name?.trim() || undefined,
    memo: body.memo?.trim() || undefined,
    actorId: user.employeeId,
    reason: body.reason?.trim() || undefined,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const user = await getCurrentUser();
  if (!user || user.role !== 'ADMIN') {
    return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const date = searchParams.get('date');
  const reason = searchParams.get('reason') || '관리자 수동 삭제';

  if (!date) {
    return NextResponse.json({ error: '삭제할 날짜가 필요합니다.' }, { status: 400 });
  }

  const result = await deleteWorkCalendar(date, user.employeeId, reason);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
