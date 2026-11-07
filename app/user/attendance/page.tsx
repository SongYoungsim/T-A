import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { getUserMonthlyAttendance, todayKST } from '@/lib/attendance';
import { AttendanceMonthSelector } from './attendance-month-selector';
import { UserAttendanceCalendar } from './user-attendance-calendar';

interface PageProps {
  searchParams: Promise<{ year?: string; month?: string }>;
}

export default async function UserAttendancePage({ searchParams }: PageProps) {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/login');
  }

  const resolvedParams = await searchParams;
  const today = todayKST();
  const [currY, currM] = today.split('-').map(Number);

  const year = resolvedParams.year ? parseInt(resolvedParams.year, 10) : currY;
  const month = resolvedParams.month ? parseInt(resolvedParams.month, 10) : currM;

  const validYear = isNaN(year) ? currY : year;
  const validMonth = isNaN(month) || month < 1 || month > 12 ? currM : month;

  const { days, summary } = await getUserMonthlyAttendance(user.employeeId, validYear, validMonth);

  return (
    <div className="space-y-6">
      {/* 헤더 및 월 선택 */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">내 근태 기록</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {validYear}년 {validMonth}월 출퇴근 및 캘린더 근태 현황입니다.
          </p>
        </div>
        <AttendanceMonthSelector currentYear={validYear} currentMonth={validMonth} />
      </div>

      {/* 캘린더 및 상세 뷰 */}
      <UserAttendanceCalendar
        user={user}
        year={validYear}
        month={validMonth}
        days={days}
        summary={summary}
        today={today}
      />
    </div>
  );
}