import { CalendarCheck2, CalendarDays, Clock3, TimerReset } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { getCurrentUser } from '@/lib/auth';
import { getUserLeaveSummary } from '@/lib/leave';
import { getRecentAttendance } from '@/lib/attendance';
import { getUserCurrentMonthOvertimeMinutes } from '@/lib/overtime';
import { getUserCompensatoryLeaves } from '@/lib/compensatory-leave';
import { AttendanceCard } from '@/components/attendance-card';
import {
  ATTENDANCE_STATUS_LABEL,
  LEAVE_TYPE_META,
  formatTimeKST,
  minuteToTimeString,
  formatDuration,
} from '@/lib/hr-types';

export default async function UserDashboard() {
  const currentUser = await getCurrentUser();

  const now = new Date();
  const currentYear = parseInt(
    new Intl.DateTimeFormat('en', { year: 'numeric', timeZone: 'Asia/Seoul' }).format(now),
    10,
  );
  const currentMonth = parseInt(
    new Intl.DateTimeFormat('en', { month: 'numeric', timeZone: 'Asia/Seoul' }).format(now),
    10,
  );

  const [leaveSummary, recentDays, overtimeStats, compLeaveData] = await Promise.all([
    currentUser ? getUserLeaveSummary(currentUser.employeeId, currentYear) : null,
    currentUser ? getRecentAttendance(currentUser.employeeId, 5) : [],
    currentUser
      ? getUserCurrentMonthOvertimeMinutes(currentUser.employeeId, currentYear, currentMonth)
      : { overtimeMinutes: 0, holidayWorkMinutes: 0, totalMinutes: 0, overtimeCount: 0, holidayWorkCount: 0, compLeaveGrantedCount: 0 },
    currentUser ? getUserCompensatoryLeaves(currentUser.employeeId) : null,
  ]);

  const totalMinutes = leaveSummary
    ? leaveSummary.grantedMinutes + leaveSummary.carriedMinutes
    : 0;
  const remainMinutes = leaveSummary ? totalMinutes - leaveSummary.usedMinutes : 0;
  const remainDays = remainMinutes / 480;

  const remainLabel = leaveSummary?.masterId
    ? `${remainDays.toFixed(3).replace(/\.?0+$/, '')}일`
    : '미설정';
  const remainSub = leaveSummary?.masterId
    ? `${(remainMinutes / 60).toFixed(1)}시간`
    : '관리자 문의';

  const stdStart = currentUser
    ? minuteToTimeString(currentUser.standardStartMinute ?? 540)
    : '09:00';
  const stdEnd = currentUser
    ? minuteToTimeString(currentUser.standardEndMinute ?? 1080)
    : '18:00';

  const overtimeValue =
    overtimeStats && overtimeStats.totalMinutes > 0
      ? formatDuration(overtimeStats.totalMinutes)
      : '0분';
  const overtimeSub =
    overtimeStats && overtimeStats.totalMinutes > 0
      ? `평일 ${formatDuration(overtimeStats.overtimeMinutes)} · 휴일 ${formatDuration(overtimeStats.holidayWorkMinutes)}`
      : '추가근무 없음';

  const compAvailableDays = compLeaveData?.summary.availableDays ?? 0;
  const compExpiringDays = compLeaveData?.summary.expiringSoonDays ?? 0;

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div>
        <p className="text-sm font-medium text-primary">오늘도 좋은 하루 보내세요</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">
          {currentUser?.fullName ?? '직원'}님의 근태
        </h1>
      </div>

      {/* 출퇴근 카드 (실제 API 연동) */}
      <AttendanceCard
        employeeName={currentUser?.fullName ?? '직원'}
        standardStartMinute={currentUser?.standardStartMinute ?? 540}
        standardEndMinute={currentUser?.standardEndMinute ?? 1080}
      />

      {/* 요약 카드 4종 (연차 잔여, 대체휴무 잔여, 기준 출퇴근, 이번달 추가근무) */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: '잔여 연차', value: remainLabel, sub: remainSub, icon: CalendarDays },
          {
            label: '대체휴무 잔여',
            value: `${compAvailableDays}일`,
            sub: compExpiringDays > 0 ? `30일내 만료 ${compExpiringDays}일` : '연차와 분리 보관',
            icon: CalendarCheck2,
          },
          { label: '기준 출근', value: stdStart, sub: `기준 퇴근 ${stdEnd}`, icon: Clock3 },
          { label: '이번 달 추가근무', value: overtimeValue, sub: overtimeSub, icon: TimerReset },
        ].map(({ label, value, sub, icon: Icon }) => (
          <Card key={label} className="border-0 shadow-sm">
            <CardContent className="p-4 sm:p-5">
              <Icon className="size-5 text-primary" />
              <p className="mt-4 text-xs sm:text-sm text-muted-foreground">{label}</p>
              <p className="mt-1 text-lg sm:text-xl font-bold">{value}</p>
              <p className="mt-1 text-xs text-muted-foreground">{sub}</p>
            </CardContent>
          </Card>
        ))}
      </section>

      {/* 최근 근태 (실제 데이터) */}
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">최근 근태</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          {recentDays.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">근태 기록이 없습니다.</p>
          ) : (
            recentDays.map((d) => {
              // 표시용 상태
              const status = d.leaveType
                ? LEAVE_TYPE_META[d.leaveType].label
                : d.representativeStatus
                ? ATTENDANCE_STATUS_LABEL[d.representativeStatus]
                : '미출근';

              const timeStr = d.checkInAt
                ? `${formatTimeKST(d.checkInAt)}${d.checkOutAt ? ' · ' + formatTimeKST(d.checkOutAt) : ''}`
                : d.leaveType
                ? LEAVE_TYPE_META[d.leaveType].label
                : '-';

              const badgeVariant =
                d.representativeStatus === 'LATE' ? 'destructive'
                : d.representativeStatus === 'OVERTIME' ? 'default'
                : d.leaveType ? 'secondary'
                : 'outline';

              return (
                <div key={d.date} className="flex items-center justify-between border-b py-3 last:border-0">
                  <div className="flex items-center gap-3">
                    <span className="grid size-10 place-items-center rounded-xl bg-muted text-sm font-semibold">
                      {d.date.slice(5).replace('-', '.')}
                    </span>
                    <div className="flex items-center gap-1">
                      <Badge variant={badgeVariant}>{status}</Badge>
                      {d.isLate && d.isEarlyLeave && (
                        <Badge variant="outline" className="text-xs">조퇴</Badge>
                      )}
                    </div>
                  </div>
                  <span className="text-sm text-muted-foreground tabular-nums">{timeStr}</span>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}