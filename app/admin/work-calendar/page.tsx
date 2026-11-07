import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { listWorkCalendarByMonth, getEffectiveWorkdaysInRange } from '@/lib/calendar';
import { todayKST } from '@/lib/attendance';
import { WorkCalendarClient } from './work-calendar-client';

interface PageProps {
  searchParams: Promise<{ year?: string; month?: string }>;
}

export default async function AdminWorkCalendarPage({ searchParams }: PageProps) {
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

  const from = `${validYear}-${String(validMonth).padStart(2, '0')}-01`;
  const lastDay = new Date(validYear, validMonth, 0).getDate();
  const to = `${validYear}-${String(validMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  const [dbRecords, effectiveMap] = await Promise.all([
    listWorkCalendarByMonth(validYear, validMonth),
    getEffectiveWorkdaysInRange(from, to),
  ]);

  const effectiveDays = Array.from(effectiveMap.values());

  return (
    <WorkCalendarClient
      year={validYear}
      month={validMonth}
      effectiveDays={effectiveDays}
      dbRecords={dbRecords}
      today={today}
    />
  );
}