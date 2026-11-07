/**
 * GET /api/leave/today-count — 오늘 연차 인원 수 (ADMIN Dashboard)
 */
import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { countTodayLeave } from '@/lib/leave';

export async function GET() {
  const actor = await getCurrentUser();
  if (actor?.role !== 'ADMIN') {
    return NextResponse.json({ error: '접근 권한이 없습니다.' }, { status: 403 });
  }

  const data = await countTodayLeave();
  return NextResponse.json(data);
}
