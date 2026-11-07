import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { todayKST } from '@/lib/attendance';
import { getMonthlyAttendanceReport } from '@/lib/reports';
import { ReportsView } from './reports-view';

interface PageProps {
  searchParams: Promise<{
    year?: string;
    month?: string;
    department?: string;
    tab?: string;
  }>;
}

export default async function AdminReportsPage({ searchParams }: PageProps) {
  const user = await getCurrentUser();
  if (!user || user.role !== 'ADMIN') {
    redirect('/login');
  }

  const resolvedParams = await searchParams;
  const today = todayKST();
  const [currentYear, currentMonth] = today.split('-').map(Number);

  const year = resolvedParams.year ? parseInt(resolvedParams.year, 10) : currentYear;
  const month = resolvedParams.month ? parseInt(resolvedParams.month, 10) : currentMonth;
  const department = resolvedParams.department || 'ALL';
  const initialTab = resolvedParams.tab?.toLowerCase() === 'anomalies' ? 'ANOMALIES' as const : 'OVERVIEW' as const;

  const reportData = await getMonthlyAttendanceReport({
    year,
    month,
    department,
  });

  return (
    <ReportsView
      initialYear={reportData.year}
      initialMonth={reportData.month}
      initialDepartment={reportData.selectedDepartment}
      initialTab={initialTab}
      departments={reportData.departments}
      kpi={reportData.kpi}
      employeeSummaries={reportData.employeeSummaries}
      departmentSummaries={reportData.departmentSummaries}
      anomalies={reportData.anomalies}
    />
  );
}
