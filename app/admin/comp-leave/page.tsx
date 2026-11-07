import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { listCompensatoryLeavesAdmin } from '@/lib/compensatory-leave';
import { env } from 'cloudflare:workers';
import { AdminCompLeaveView } from './admin-comp-leave-view';

interface PageProps {
  searchParams: Promise<{
    department?: string;
    search?: string;
    status?: string;
  }>;
}

export default async function AdminCompLeavePage({ searchParams }: PageProps) {
  const user = await getCurrentUser();
  if (!user || user.role !== 'ADMIN') {
    redirect('/login');
  }

  const resolved = await searchParams;
  const department = resolved.department || 'ALL';
  const search = resolved.search || '';
  const statusFilter = (resolved.status as 'ALL' | 'AVAILABLE' | 'USED' | 'EXPIRED') || 'ALL';

  // 1. 부서 목록 조회
  const deptRows = await env.DB.prepare(
    `SELECT DISTINCT department FROM employees WHERE employment_status <> 'RESIGNED' ORDER BY department ASC`
  ).all<{ department: string }>();
  const departments = deptRows.results.map((r) => r.department);

  // 2. 대체휴무 목록 및 집계 조회
  const { rows, summary } = await listCompensatoryLeavesAdmin({
    department,
    search,
    statusFilter,
  });

  return (
    <AdminCompLeaveView
      initialRows={rows}
      initialSummary={summary}
      departments={departments}
      initialDepartment={department}
      initialSearch={search}
      initialStatus={statusFilter}
    />
  );
}