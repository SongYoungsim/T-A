import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { listAuditLogsPaginated } from '@/lib/reports';
import { AuditLogsView } from './audit-logs-view';

interface PageProps {
  searchParams: Promise<{
    page?: string;
    pageSize?: string;
    startDate?: string;
    endDate?: string;
    entityType?: string;
    action?: string;
    searchQuery?: string;
    actorSearch?: string;
  }>;
}

export default async function AdminAuditLogsPage({ searchParams }: PageProps) {
  const user = await getCurrentUser();
  if (!user || user.role !== 'ADMIN') {
    redirect('/login');
  }

  const resolvedParams = await searchParams;
  const page = resolvedParams.page ? parseInt(resolvedParams.page, 10) : 1;
  const pageSize = resolvedParams.pageSize ? parseInt(resolvedParams.pageSize, 10) : 30;

  const filters = {
    startDate: resolvedParams.startDate,
    endDate: resolvedParams.endDate,
    entityType: resolvedParams.entityType,
    action: resolvedParams.action,
    searchQuery: resolvedParams.searchQuery,
    actorSearch: resolvedParams.actorSearch,
  };

  const paginatedData = await listAuditLogsPaginated({
    page,
    pageSize,
    ...filters,
  });

  return (
    <AuditLogsView
      initialData={paginatedData}
      initialFilters={filters}
    />
  );
}
