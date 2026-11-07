import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { listUserOvertime, calculateOvertimeSummary } from '@/lib/overtime';
import { todayKST } from '@/lib/attendance';
import { UserOvertimeView } from './user-overtime-view';

interface PageProps {
  searchParams: Promise<{ year?: string; month?: string }>;
}

export default async function UserOvertimePage({ searchParams }: PageProps) {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/login');
  }

  // 타 직원의 employee_id 파라미터가 오더라도 세션의 본인 ID만 사용 (Requirement 27)
  const employeeId = user.employeeId;

  const resolved = await searchParams;
  const today = todayKST();
  const [currY, currM] = today.split('-').map(Number);

  const year = resolved.year ? parseInt(resolved.year, 10) : currY;
  const month = resolved.month ? parseInt(resolved.month, 10) : currM;

  const validYear = isNaN(year) ? currY : year;
  const validMonth = isNaN(month) || month < 1 || month > 12 ? currM : month;

  const records = await listUserOvertime(employeeId, validYear, validMonth);
  const summary = calculateOvertimeSummary(records);

  return (
    <UserOvertimeView
      records={records}
      summary={summary}
      year={validYear}
      month={validMonth}
      employeeName={user.fullName}
    />
  );
}