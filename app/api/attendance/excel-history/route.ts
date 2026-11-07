/**
 * GET /api/attendance/excel-history — 최근 Excel Import 이력 조회 (Phase 8)
 */
import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { listAttendanceImportBatches } from '@/lib/attendance-excel';

export async function GET() {
  const user = await getCurrentUser();
  if (!user || user.role !== 'ADMIN') {
    return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });
  }

  try {
    const batches = await listAttendanceImportBatches(20);
    return NextResponse.json({ ok: true, batches });
  } catch (err) {
    console.error('Error listing attendance import batches:', err);
    return NextResponse.json({ error: '가져오기 이력을 불러오는 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
