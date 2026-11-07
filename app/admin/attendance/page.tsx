import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { listAttendanceRangeAdmin, todayKST } from '@/lib/attendance';
import { AttendanceAdminView } from './attendance-admin-view';

interface PageProps {
  searchParams: Promise<{ date?: string; from?: string; to?: string }>;
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function shiftDate(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export default async function AdminAttendancePage({ searchParams }: PageProps) {
  const user = await getCurrentUser();
  if (!user || user.role !== 'ADMIN') {
    redirect('/login');
  }

  const resolvedParams = await searchParams;
  const today = todayKST();
  const legacyDate = DATE_PATTERN.test(resolvedParams.date ?? '') ? resolvedParams.date : undefined;
  const requestedTo = DATE_PATTERN.test(resolvedParams.to ?? '') ? resolvedParams.to! : legacyDate ?? today;
  const requestedFrom = DATE_PATTERN.test(resolvedParams.from ?? '')
    ? resolvedParams.from!
    : legacyDate ?? shiftDate(requestedTo, -6);
  const normalizedFrom = requestedFrom <= requestedTo ? requestedFrom : shiftDate(requestedTo, -6);
  const earliestAllowed = shiftDate(requestedTo, -30);
  const selectedFrom = normalizedFrom < earliestAllowed ? earliestAllowed : normalizedFrom;
  const selectedTo = requestedTo;

  const rows = await listAttendanceRangeAdmin(selectedFrom, selectedTo);

  return <AttendanceAdminView initialRows={rows} selectedFrom={selectedFrom} selectedTo={selectedTo} />;
}
