/**
 * GET /api/audit-logs — 전체 감사로그 페이징 조회 및 필터링 (Phase 9)
 */
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { listAuditLogsPaginated } from '@/lib/reports';

export async function GET(request: Request) {
  const user = await requireAdmin();
  if (!user) {
    return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);

  const startDate = searchParams.get('startDate') || undefined;
  const endDate = searchParams.get('endDate') || undefined;
  const feature = searchParams.get('feature') || undefined;
  const action = searchParams.get('action') || undefined;
  const search = searchParams.get('search') || undefined;
  const page = parseInt(searchParams.get('page') || '1', 10);
  const pageSize = parseInt(searchParams.get('pageSize') || '30', 10);

  try {
    const result = await listAuditLogsPaginated({
      startDate,
      endDate,
      feature,
      action,
      search,
      page: isNaN(page) ? 1 : page,
      pageSize: isNaN(pageSize) ? 30 : Math.min(100, Math.max(10, pageSize)),
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error('Error fetching audit logs:', err);
    return NextResponse.json({ error: '감사로그를 조회하는 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
