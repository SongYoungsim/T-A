import {
  AlertTriangle,
  CalendarOff,
  Clock3,
  TimerReset,
  TrendingUp,
  UserCheck,
  Users,
  ArrowUpRight,
  Briefcase,
  FileBarChart2,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { getCurrentUser } from '@/lib/auth';
import { countTodayLeave } from '@/lib/leave';
import { getTodayAttendanceDashboard, todayKST } from '@/lib/attendance';
import { LEAVE_TYPE_META, formatTimeKST, formatDuration } from '@/lib/hr-types';
import { getMonthlyAttendanceReport } from '@/lib/reports';

const toneMap: Record<string, string> = {
  blue: 'bg-blue-50 text-blue-700',
  green: 'bg-emerald-50 text-emerald-700',
  amber: 'bg-amber-50 text-amber-700',
  violet: 'bg-violet-50 text-violet-700',
  red: 'bg-rose-50 text-rose-700',
  cyan: 'bg-cyan-50 text-cyan-700',
};

export default async function AdminDashboard() {
  const currentUser = await getCurrentUser();
  const todayStr = todayKST();
  const [currentYear, currentMonth] = todayStr.split('-').map(Number);

  // 실제 근태 대시보드 데이터 및 이번 달 리포트 통계 조회
  const [todayLeave, attendanceDash, monthlyReport] = await Promise.all([
    countTodayLeave(),
    getTodayAttendanceDashboard(),
    getMonthlyAttendanceReport({ year: currentYear, month: currentMonth, department: 'ALL' }).catch(() => null),
  ]);

  const monthKpi = monthlyReport?.kpi;
  const anomalies = monthlyReport?.anomalies || [];
  const expiringCompLeaves = anomalies.filter((a) => a.category === 'EXPIRING_COMP_LEAVE');
  const actionRequiredAnomalies = anomalies.filter((a) => a.category !== 'EXPIRING_COMP_LEAVE');

  // 오늘 연차 설명 구성
  const leaveNote = Object.entries(todayLeave.byType)
    .map(([type, cnt]) => `${LEAVE_TYPE_META[type as keyof typeof LEAVE_TYPE_META]?.label ?? type} ${cnt}`)
    .join(' · ') || '연차 없음';

  const attendancePercent =
    attendanceDash.activeEmployees > 0
      ? Math.round((attendanceDash.clockedIn / attendanceDash.activeEmployees) * 100)
      : 0;

  const kpis = [
    {
      label: '전체 재직인원',
      value: String(attendanceDash.activeEmployees),
      unit: '명',
      note: 'D1 실시간 등록 기준',
      icon: Users,
      tone: 'blue',
    },
    {
      label: '현재 출근인원',
      value: String(attendanceDash.clockedIn),
      unit: '명',
      note: attendanceDash.isHoliday ? '휴일 출근 기록' : `${attendancePercent}% 출근`,
      icon: UserCheck,
      tone: 'green',
    },
    {
      label: '미출근인원',
      value: String(Math.max(0, attendanceDash.notClockedIn)),
      unit: '명',
      note: attendanceDash.isHoliday
        ? '출근의무 없음 (휴일)'
        : attendanceDash.notClockedIn > 0
        ? '출근 확인 필요'
        : '전원 출근 완료',
      icon: Clock3,
      tone: 'amber',
    },
    {
      label: '오늘 연차인원',
      value: String(todayLeave.total),
      unit: '명',
      note: todayLeave.total > 0 ? leaveNote : '연차 없음',
      icon: CalendarOff,
      tone: 'violet',
    },
    {
      label: '지각인원',
      value: String(attendanceDash.lateCount),
      unit: '명',
      note: attendanceDash.isHoliday ? '휴일 해당 없음' : attendanceDash.lateCount > 0 ? '5분 Grace 초과' : '지각 없음',
      icon: AlertTriangle,
      tone: 'red',
    },
    {
      label: attendanceDash.isHoliday ? '오늘 휴일근무' : '오늘 연장근무',
      value: String(attendanceDash.isHoliday ? attendanceDash.holidayWorkCount : attendanceDash.overtimeCount),
      unit: '명',
      note: (attendanceDash.isHoliday ? attendanceDash.holidayWorkCount : attendanceDash.overtimeCount) > 0
        ? 'D1 공식 승인 등록'
        : '등록 인원 없음',
      icon: Briefcase,
      tone: attendanceDash.isHoliday ? 'violet' : 'blue',
    },
    {
      label: '근무 구분',
      value: attendanceDash.isHoliday ? '휴일' : '근무일',
      unit: '',
      note: attendanceDash.holidayName || (attendanceDash.isHoliday ? '주말/공휴일' : '정상 근무일'),
      icon: TimerReset,
      tone: attendanceDash.isHoliday ? 'violet' : 'cyan',
    },
  ];

  return (
    <div className="space-y-6">
      {/* 휴일 알림 배너 */}
      {attendanceDash.isHoliday && (
        <div className="flex items-center justify-between rounded-xl border border-purple-200 bg-purple-50/70 p-4 text-purple-900 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-xl bg-purple-100 text-purple-700">
              <CalendarOff className="size-5" />
            </span>
            <div>
              <p className="font-semibold text-sm">
                오늘은 {attendanceDash.holidayName ? `[${attendanceDash.holidayName}] ` : ''}휴일입니다.
              </p>
              <p className="text-xs text-purple-700 mt-0.5">
                출근 의무가 없으며, 기록이 없어도 결근으로 판정되지 않습니다.
              </p>
            </div>
          </div>
          <a href="/admin/work-calendar">
            <Button size="sm" variant="outline" className="text-xs border-purple-200 bg-white">
              캘린더 확인
            </Button>
          </a>
        </div>
      )}

      {/* 헤더 */}
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-medium text-primary">오늘의 근태 현황 ({todayStr})</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight md:text-3xl">
            안녕하세요, {currentUser?.fullName ?? '관리자'}님
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            재직 직원 {attendanceDash.activeEmployees}명의 실시간 출퇴근 현황입니다.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a href="/admin/attendance">
            <Button size="sm" variant="outline" className="gap-1.5 text-xs">
              근태 관리 전체보기
              <ArrowUpRight className="size-3.5" />
            </Button>
          </a>
          <div className="flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 px-2.5 py-1.5 rounded-lg border border-emerald-200">
            <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
            실시간 연동
          </div>
        </div>
      </div>

      {/* 오늘의 근태 KPI 그리드 */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-7">
        {kpis.map(({ label, value, unit, note, icon: Icon, tone }) => (
          <Card key={label} className="border-0 shadow-sm">
            <CardContent className="p-4 md:p-5">
              <div className={`mb-4 grid size-9 place-items-center rounded-xl ${toneMap[tone]}`}>
                <Icon className="size-4.5" />
              </div>
              <p className="text-sm text-muted-foreground">{label}</p>
              <p className="mt-1 text-2xl font-bold">
                {value}
                <span className="ml-1 text-sm font-medium text-muted-foreground">{unit}</span>
              </p>
              <p className="mt-2 text-xs text-muted-foreground">{note}</p>
            </CardContent>
          </Card>
        ))}
      </section>

      {/* 이번 달 주요 현황 (Phase 9 Req 29, 30, 46) */}
      {monthKpi && (
        <Card className="border shadow-sm bg-gradient-to-r from-card to-muted/20">
          <CardHeader className="flex flex-row items-center justify-between pb-2 pt-4 px-5">
            <div className="flex items-center gap-2">
              <FileBarChart2 className="h-5 w-5 text-indigo-600" />
              <div>
                <CardTitle className="text-base font-bold">
                  이번 달 주요 근태 현황 ({currentYear}년 {currentMonth}월)
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  월간 누적 핵심 KPI 지표 요약
                </p>
              </div>
            </div>
            <a href={`/admin/reports?year=${currentYear}&month=${currentMonth}`}>
              <Button size="sm" variant="outline" className="text-xs gap-1.5 border-indigo-200 text-indigo-700 hover:bg-indigo-50 dark:hover:bg-indigo-950/30">
                월간 리포트 상세
                <ArrowUpRight className="h-3.5 w-3.5" />
              </Button>
            </a>
          </CardHeader>
          <CardContent className="px-5 pb-4 pt-2">
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
              <a
                href={`/admin/reports?year=${currentYear}&month=${currentMonth}`}
                className="p-3 bg-background rounded-lg border hover:border-indigo-300 hover:bg-indigo-50/20 transition-colors"
              >
                <span className="text-xs text-muted-foreground block">근무대상 / 정상</span>
                <span className="text-lg font-bold text-foreground">
                  {monthKpi.activeEmployees}명
                  <span className="text-xs font-normal text-muted-foreground ml-1">/ {monthKpi.normalDaysCount}일</span>
                </span>
              </a>

              <a
                href={`/admin/reports?year=${currentYear}&month=${currentMonth}`}
                className="p-3 bg-background rounded-lg border hover:border-amber-300 hover:bg-amber-50/20 transition-colors"
              >
                <span className="text-xs text-muted-foreground block">지각 / 조퇴</span>
                <span className="text-lg font-bold text-amber-600">
                  {monthKpi.lateCount}건
                  <span className="text-xs font-normal text-muted-foreground ml-1">/ {monthKpi.earlyLeaveCount}건</span>
                </span>
              </a>

              <a
                href={`/admin/reports?year=${currentYear}&month=${currentMonth}`}
                className="p-3 bg-background rounded-lg border hover:border-red-300 hover:bg-red-50/20 transition-colors"
              >
                <span className="text-xs text-muted-foreground block">결근</span>
                <span className="text-lg font-bold text-red-600">
                  {monthKpi.absentCount}일
                </span>
              </a>

              <a
                href={`/admin/reports?year=${currentYear}&month=${currentMonth}`}
                className="p-3 bg-background rounded-lg border hover:border-purple-300 hover:bg-purple-50/20 transition-colors"
              >
                <span className="text-xs text-muted-foreground block">연차 사용</span>
                <span className="text-lg font-bold text-purple-600">
                  {monthKpi.leaveDays}일
                </span>
              </a>

              <a
                href={`/admin/reports?year=${currentYear}&month=${currentMonth}`}
                className="p-3 bg-background rounded-lg border hover:border-teal-300 hover:bg-teal-50/20 transition-colors"
              >
                <span className="text-xs text-muted-foreground block">대체휴무 사용</span>
                <span className="text-lg font-bold text-teal-600">
                  {monthKpi.compLeaveUsedDays}일
                </span>
              </a>

              <a
                href={`/admin/reports?year=${currentYear}&month=${currentMonth}`}
                className="p-3 bg-background rounded-lg border hover:border-blue-300 hover:bg-blue-50/20 transition-colors"
              >
                <span className="text-xs text-muted-foreground block">평일 연장근무</span>
                <span className="text-base font-bold text-blue-600">
                  {formatDuration(monthKpi.overtimeMinutes)}
                </span>
              </a>

              <a
                href={`/admin/reports?year=${currentYear}&month=${currentMonth}`}
                className="p-3 bg-background rounded-lg border hover:border-indigo-300 hover:bg-indigo-50/20 transition-colors"
              >
                <span className="text-xs text-muted-foreground block">휴일근무</span>
                <span className="text-base font-bold text-indigo-600">
                  {formatDuration(monthKpi.holidayWorkMinutes)}
                </span>
              </a>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 하단 2단 그리드: 직원별 오늘 근태 테이블 + 사이드 카드 */}
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_330px]">
        {/* 좌측: 직원별 오늘 근태 테이블 */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="text-lg">직원별 오늘 근태</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">재직자 기준 실시간 현황</p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary">{attendanceDash.staffList.length}명</Badge>
              <a href="/admin/attendance" className="text-xs text-primary hover:underline font-medium">
                보정 및 상세
              </a>
            </div>
          </CardHeader>
          <CardContent>
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>성명</TableHead>
                    <TableHead>부서</TableHead>
                    <TableHead>기준출근</TableHead>
                    <TableHead>실제출근</TableHead>
                    <TableHead>실제퇴근</TableHead>
                    <TableHead>오늘상태</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {attendanceDash.staffList.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground text-sm">
                        재직 중인 직원이 없습니다.
                      </TableCell>
                    </TableRow>
                  ) : (
                    attendanceDash.staffList.slice(0, 10).map((row) => (
                      <TableRow key={row.fullName + row.department}>
                        <TableCell className="font-semibold">{row.fullName}</TableCell>
                        <TableCell className="text-sm">{row.department}</TableCell>
                        <TableCell className="font-mono text-xs">{row.standardStart}</TableCell>
                        <TableCell className="font-mono text-sm">
                          {row.checkInAt ? formatTimeKST(row.checkInAt) : '-'}
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {row.checkOutAt ? formatTimeKST(row.checkOutAt) : '-'}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              row.status === '지각'
                                ? 'destructive'
                                : row.status === '1일' || row.status === '반차' || row.status === '반반차' || row.status === '시차'
                                ? 'secondary'
                                : row.status === '미출근'
                                ? 'outline'
                                : 'default'
                            }
                            className={
                              row.status === '근무중'
                                ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-100 border-emerald-300'
                                : row.status === '퇴근'
                                ? 'bg-slate-100 text-slate-800 hover:bg-slate-100'
                                : ''
                            }
                          >
                            {row.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
              {attendanceDash.staffList.length > 10 && (
                <div className="mt-3 text-center">
                  <a href="/admin/attendance" className="text-xs text-primary font-medium hover:underline">
                    전체 {attendanceDash.staffList.length}명 조회하기 →
                  </a>
                </div>
              )}
            </div>

            {/* 모바일 뷰 */}
            <div className="space-y-3 md:hidden">
              {attendanceDash.staffList.slice(0, 10).map((row) => (
                <div key={row.fullName + row.department} className="rounded-xl border p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-sm">{row.fullName}</p>
                      <p className="text-xs text-muted-foreground">{row.department}</p>
                    </div>
                    <Badge
                      variant={
                        row.status === '지각'
                          ? 'destructive'
                          : row.status === '미출근'
                          ? 'outline'
                          : 'secondary'
                      }
                    >
                      {row.status}
                    </Badge>
                  </div>
                  <div className="mt-3 grid grid-cols-3 text-xs bg-muted/30 p-2 rounded-lg">
                    <span>기준 {row.standardStart}</span>
                    <span>출근 {row.checkInAt ? formatTimeKST(row.checkInAt) : '-'}</span>
                    <span>퇴근 {row.checkOutAt ? formatTimeKST(row.checkOutAt) : '-'}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* 우측 사이드 카드 */}
        <div className="space-y-5">
          <Card className="border-0 shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">확인이 필요한 항목</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <a
                href="/admin/attendance"
                className="flex items-center justify-between rounded-xl bg-muted/55 p-3 text-sm hover:bg-muted/80 transition-colors"
              >
                <span>{attendanceDash.isHoliday ? '오늘 미출근 (휴일 제외)' : '오늘 미출근 (연차 제외)'}</span>
                <strong className={attendanceDash.notClockedIn > 0 ? 'text-amber-600 font-bold' : ''}>
                  {Math.max(0, attendanceDash.notClockedIn)}명 →
                </strong>
              </a>

              <a
                href="/admin/attendance"
                className="flex items-center justify-between rounded-xl bg-muted/55 p-3 text-sm hover:bg-muted/80 transition-colors"
              >
                <span>오늘 지각 인원</span>
                <strong className={attendanceDash.lateCount > 0 ? 'text-rose-600 font-bold' : ''}>
                  {attendanceDash.lateCount}명 →
                </strong>
              </a>

              <a
                href="/admin/leave"
                className="flex items-center justify-between rounded-xl bg-muted/55 p-3 text-sm hover:bg-muted/80 transition-colors"
              >
                <span>오늘 연차 인원</span>
                <strong className="text-purple-600 font-bold">{todayLeave.total}명 →</strong>
              </a>

              <a
                href={`/admin/reports?year=${currentYear}&month=${currentMonth}&tab=anomalies`}
                className="flex items-center justify-between rounded-xl bg-muted/55 p-3 text-sm hover:bg-muted/80 transition-colors"
              >
                <span className="flex items-center gap-1.5">
                  <ShieldAlert className="h-4 w-4 text-red-500" />
                  근태 확인 필요 데이터
                </span>
                <strong className={actionRequiredAnomalies.length > 0 ? 'text-rose-600 font-bold' : 'text-muted-foreground'}>
                  {actionRequiredAnomalies.length}건 →
                </strong>
              </a>

              <a
                href="/admin/comp-leave"
                className="flex items-center justify-between rounded-xl bg-muted/55 p-3 text-sm hover:bg-muted/80 transition-colors"
              >
                <span className="flex items-center gap-1.5">
                  <Clock3 className="h-4 w-4 text-amber-500" />
                  30일 내 만료예정 대체휴무
                </span>
                <strong className={expiringCompLeaves.length > 0 ? 'text-amber-600 font-bold' : 'text-muted-foreground'}>
                  {expiringCompLeaves.length}건 →
                </strong>
              </a>
            </CardContent>
          </Card>

          <Card className="border-0 bg-[#1e3353] text-white shadow-sm">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <TrendingUp className="size-5 text-blue-200" />
                <Badge variant="secondary" className="bg-blue-900/60 text-blue-200 border-0 text-[10px]">
                  Phase 9 운영
                </Badge>
              </div>
              <p className="mt-4 text-sm text-blue-100">관리자 운영 고도화</p>
              <p className="mt-1 text-xl font-bold">통합 리포트 & 감사로그</p>
              <p className="mt-2 text-xs text-slate-300 leading-relaxed">
                월별 KPI, 직원/부서 Summary, 이상데이터 탐지 및 Excel 다운로드가 연동되었습니다.
              </p>
              <div className="mt-4 flex gap-2">
                <a href="/admin/reports" className="flex-1">
                  <Button size="sm" variant="secondary" className="w-full text-xs font-semibold h-8">
                    월간 리포트
                  </Button>
                </a>
                <a href="/admin/audit-logs" className="flex-1">
                  <Button size="sm" variant="outline" className="w-full text-xs text-white border-white/30 hover:bg-white/10 h-8">
                    감사로그
                  </Button>
                </a>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}