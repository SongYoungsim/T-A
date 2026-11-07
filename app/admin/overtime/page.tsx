import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { listOvertimeAdmin, calculateOvertimeSummary } from '@/lib/overtime';
import { listEmployees } from '@/lib/employees';
import { todayKST } from '@/lib/attendance';
import { OvertimeAdminView } from './overtime-admin-view';

interface PageProps {
  searchParams: Promise<{ year?: string; month?: string }>;
}

export default async function AdminOvertimePage({ searchParams }: PageProps) {
  const user = await getCurrentUser();
  if (!user || user.role !== 'ADMIN') {
    redirect('/login');
  }

  const resolved = await searchParams;
  const today = todayKST();
  const [currY, currM] = today.split('-').map(Number);

  const year = resolved.year ? parseInt(resolved.year, 10) : currY;
  const month = resolved.month ? parseInt(resolved.month, 10) : currM;

  const validYear = isNaN(year) ? currY : year;
  const validMonth = isNaN(month) || month < 1 || month > 12 ? currM : month;

  const [records, employees] = await Promise.all([
    listOvertimeAdmin({ year: validYear, month: validMonth }),
    listEmployees(),
  ]);

  const summary = calculateOvertimeSummary(records);

  return (
    <OvertimeAdminView
      initialRecords={records}
      initialSummary={summary}
      year={validYear}
      month={validMonth}
      employees={employees}
    />
  );
}