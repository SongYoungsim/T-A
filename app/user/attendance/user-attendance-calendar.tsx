'use client';

import { useState } from 'react';
import {
  Calendar as CalendarIcon,
  List,
  CheckCircle2,
  AlertTriangle,
  Clock,
  CalendarOff,
  UserX,
  Info,
  X,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type {
  AttendanceStatus,
  CalendarDayType,
  CurrentUser,
  LeaveType,
  MonthlyAttendanceDay,
  MonthlyAttendanceSummary,
} from '@/lib/hr-types';
import { formatTimeKST, minuteToTimeString, LEAVE_TYPE_META, CALENDAR_DAY_TYPE_META } from '@/lib/hr-types';

interface UserAttendanceCalendarProps {
  user: CurrentUser;
  year: number;
  month: number;
  days: MonthlyAttendanceDay[];
  summary: MonthlyAttendanceSummary;
  today: string;
}

function getDayOfWeekInfo(dateStr: string) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d, 3, 0, 0));
  const day = date.getUTCDay();
  const names = ['일', '월', '화', '수', '목', '금', '토'];
  return {
    label: names[day],
    isWeekend: day === 0 || day === 6,
    isSunday: day === 0,
    isSaturday: day === 6,
  };
}

export function UserAttendanceCalendar({
  user,
  year,
  month,
  days,
  summary,
  today,
}: UserAttendanceCalendarProps) {
  const [viewMode, setViewMode] = useState<'calendar' | 'list'>('calendar');
  const [selectedDay, setSelectedDay] = useState<MonthlyAttendanceDay | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  // 달력 첫날 요일 및 일수
  const firstDayOfWeek = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();

  // 날짜별 맵
  const dayMap = new Map<string, MonthlyAttendanceDay>();
  for (const d of days) {
    dayMap.set(d.date, d);
  }

  const handleDayClick = (day: MonthlyAttendanceDay) => {
    setSelectedDay(day);
    setIsDetailOpen(true);
  };

  const renderBadge = (day: MonthlyAttendanceDay) => {
    if (day.leaveType) {
      const meta = LEAVE_TYPE_META[day.leaveType];
      return (
        <Badge className="bg-purple-100 text-purple-700 hover:bg-purple-100 border-purple-200 text-[11px] px-1.5 py-0">
          {meta?.label ?? '연차'}
        </Badge>
      );
    }

    if (day.isAbsent) {
      return (
        <Badge variant="destructive" className="bg-red-600 text-[11px] px-1.5 py-0">
          결근
        </Badge>
      );
    }

    if (day.isLate && day.isEarlyLeave) {
      return (
        <Badge variant="destructive" className="bg-rose-600 text-[11px] px-1.5 py-0">
          지각·조퇴
        </Badge>
      );
    }

    if (day.isLate || day.representativeStatus === 'LATE') {
      return (
        <Badge variant="destructive" className="bg-rose-500 hover:bg-rose-600 text-[11px] px-1.5 py-0">
          지각
        </Badge>
      );
    }

    if (day.isEarlyLeave || day.representativeStatus === 'EARLY_LEAVE') {
      return (
        <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 border-amber-300 text-[11px] px-1.5 py-0">
          조퇴
        </Badge>
      );
    }

    if (day.representativeStatus === 'NORMAL') {
      return (
        <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 border-emerald-300 text-[11px] px-1.5 py-0">
          정상
        </Badge>
      );
    }

    if (day.isNotClockedIn) {
      return (
        <Badge variant="outline" className="text-muted-foreground border-dashed text-[11px] px-1.5 py-0">
          미출근
        </Badge>
      );
    }

    if (!day.isWorkday) {
      if (day.dayType === 'PUBLIC_HOLIDAY') {
        return (
          <Badge variant="outline" className="bg-rose-50 text-rose-700 border-rose-200 text-[10px] px-1.5 py-0">
            {day.dayName || '공휴일'}
          </Badge>
        );
      }
      if (day.dayType === 'COMPANY_HOLIDAY') {
        return (
          <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-[10px] px-1.5 py-0">
            {day.dayName || '회사휴무'}
          </Badge>
        );
      }
      return null;
    }

    return null;
  };

  return (
    <div className="space-y-6">
      {/* 월간 요약 카드 5종 */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Card className="border-0 shadow-sm bg-card">
          <CardContent className="p-4 md:p-5">
            <div className="flex items-center gap-3">
              <div className="grid size-10 place-items-center rounded-xl bg-emerald-50 text-emerald-600">
                <CheckCircle2 className="size-5" />
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground">정상 출근</p>
                <p className="text-2xl font-bold mt-0.5 text-emerald-700">
                  {summary.normal}
                  <span className="text-xs font-normal text-muted-foreground ml-1">일</span>
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm bg-card">
          <CardContent className="p-4 md:p-5">
            <div className="flex items-center gap-3">
              <div className="grid size-10 place-items-center rounded-xl bg-rose-50 text-rose-600">
                <AlertTriangle className="size-5" />
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground">지각</p>
                <p className="text-2xl font-bold mt-0.5 text-rose-600">
                  {summary.late}
                  <span className="text-xs font-normal text-muted-foreground ml-1">회</span>
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm bg-card">
          <CardContent className="p-4 md:p-5">
            <div className="flex items-center gap-3">
              <div className="grid size-10 place-items-center rounded-xl bg-amber-50 text-amber-600">
                <Clock className="size-5" />
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground">조퇴</p>
                <p className="text-2xl font-bold mt-0.5 text-amber-600">
                  {summary.earlyLeave}
                  <span className="text-xs font-normal text-muted-foreground ml-1">회</span>
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm bg-card">
          <CardContent className="p-4 md:p-5">
            <div className="flex items-center gap-3">
              <div className="grid size-10 place-items-center rounded-xl bg-red-50 text-red-600">
                <UserX className="size-5" />
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground">결근</p>
                <p className="text-2xl font-bold mt-0.5 text-red-600">
                  {summary.absent}
                  <span className="text-xs font-normal text-muted-foreground ml-1">일</span>
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm bg-card">
          <CardContent className="p-4 md:p-5">
            <div className="flex items-center gap-3">
              <div className="grid size-10 place-items-center rounded-xl bg-purple-50 text-purple-600">
                <CalendarOff className="size-5" />
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground">연차 사용</p>
                <p className="text-2xl font-bold mt-0.5 text-purple-700">
                  {summary.leaveUsed}
                  <span className="text-xs font-normal text-muted-foreground ml-1">일</span>
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 뷰 모드 전환 버튼 */}
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold tracking-tight">
          {year}년 {month}월 근태 현황
        </h2>
        <div className="flex items-center rounded-lg border bg-muted/30 p-1">
          <Button
            variant={viewMode === 'calendar' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setViewMode('calendar')}
            className="h-8 gap-1.5 text-xs font-medium"
          >
            <CalendarIcon className="size-3.5" />
            달력 보기
          </Button>
          <Button
            variant={viewMode === 'list' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setViewMode('list')}
            className="h-8 gap-1.5 text-xs font-medium"
          >
            <List className="size-3.5" />
            목록 보기
          </Button>
        </div>
      </div>

      {/* 1. 달력 뷰 */}
      {viewMode === 'calendar' ? (
        <Card className="border-0 shadow-sm overflow-hidden">
          <CardContent className="p-0">
            {/* 요일 헤더 */}
            <div className="grid grid-cols-7 border-b bg-muted/60 text-center font-semibold text-xs py-2.5">
              <span className="text-rose-600">일</span>
              <span>월</span>
              <span>화</span>
              <span>수</span>
              <span>목</span>
              <span>금</span>
              <span className="text-blue-600">토</span>
            </div>

            {/* 그리드 */}
            <div className="grid grid-cols-7 divide-x divide-y border-b">
              {Array.from({ length: firstDayOfWeek }).map((_, i) => (
                <div key={`empty-${i}`} className="min-h-[90px] md:min-h-[110px] bg-muted/15 p-2" />
              ))}

              {Array.from({ length: daysInMonth }).map((_, i) => {
                const d = i + 1;
                const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                const dayOfWeek = (firstDayOfWeek + i) % 7;
                const isSunday = dayOfWeek === 0;
                const isSaturday = dayOfWeek === 6;
                const isToday = dateStr === today;

                const dayData = dayMap.get(dateStr) ?? {
                  date: dateStr,
                  checkInAt: null,
                  checkOutAt: null,
                  representativeStatus: null,
                  isLate: false,
                  isEarlyLeave: false,
                  isAbsent: false,
                  isNotClockedIn: false,
                  isWorkday: !isSunday && !isSaturday,
                  dayType: (isSunday || isSaturday ? 'WEEKEND' : 'NORMAL_WORKDAY') as CalendarDayType,
                  dayName: null,
                  leaveType: null,
                  source: null,
                };

                return (
                  <div
                    key={dateStr}
                    onClick={() => handleDayClick(dayData)}
                    className={`min-h-[90px] md:min-h-[110px] p-2 transition-colors cursor-pointer hover:bg-muted/40 flex flex-col justify-between ${
                      isToday ? 'bg-primary/5 ring-1 ring-inset ring-primary' : ''
                    } ${dayData.isAbsent ? 'bg-red-50/30' : ''}`}
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className={`text-sm font-bold size-6 grid place-items-center rounded-full ${
                          isToday
                            ? 'bg-primary text-primary-foreground'
                            : isSunday
                            ? 'text-rose-600'
                            : isSaturday
                            ? 'text-blue-600'
                            : 'text-foreground'
                        }`}
                      >
                        {d}
                      </span>
                      {isToday && (
                        <span className="text-[10px] bg-primary text-primary-foreground px-1 rounded-full font-bold">
                          오늘
                        </span>
                      )}
                    </div>

                    {/* 상태 배지 */}
                    <div className="my-1 space-y-1">
                      {renderBadge(dayData)}

                      {dayData.checkInAt && (
                        <div className="text-[11px] font-mono text-muted-foreground hidden sm:block">
                          {formatTimeKST(dayData.checkInAt)}
                          {dayData.checkOutAt && ` ~ ${formatTimeKST(dayData.checkOutAt)}`}
                        </div>
                      )}
                    </div>

                    <div className="text-[10px] text-muted-foreground flex justify-end">
                      {dayData.dayName ? (
                        <span className="truncate max-w-[80px] text-rose-600 font-medium">
                          {dayData.dayName}
                        </span>
                      ) : dayData.dayType === 'SUBSTITUTE_WORKDAY' ? (
                        <span className="text-emerald-700 font-medium">대체근무</span>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      ) : (
        /* 2. 목록 뷰 */
        <Card className="border-0 shadow-sm">
          <CardContent className="p-0">
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="w-[140px]">일자 (요일)</TableHead>
                    <TableHead className="w-[130px]">근무 구분</TableHead>
                    <TableHead className="w-[120px]">출근 시간</TableHead>
                    <TableHead className="w-[120px]">퇴근 시간</TableHead>
                    <TableHead className="w-[130px]">근태 상태</TableHead>
                    <TableHead>비고 / 사유</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {days.map((row) => {
                    const dayInfo = getDayOfWeekInfo(row.date);
                    const isToday = row.date === today;
                    return (
                      <TableRow
                        key={row.date}
                        onClick={() => handleDayClick(row)}
                        className={`cursor-pointer hover:bg-muted/40 ${
                          isToday ? 'bg-primary/5 font-medium' : ''
                        } ${row.isAbsent ? 'bg-red-50/20' : ''}`}
                      >
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <span>{row.date}</span>
                            <span
                              className={`text-xs px-1.5 py-0.5 rounded font-semibold ${
                                dayInfo.isSunday
                                  ? 'text-rose-600 bg-rose-50'
                                  : dayInfo.isWeekend
                                  ? 'text-blue-600 bg-blue-50'
                                  : 'text-muted-foreground'
                              }`}
                            >
                              ({dayInfo.label})
                            </span>
                            {isToday && (
                              <span className="text-[10px] bg-primary text-primary-foreground px-1.5 py-0.5 rounded-full font-bold">
                                오늘
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="text-xs">
                            {row.dayName
                              ? row.dayName
                              : CALENDAR_DAY_TYPE_META[row.dayType]?.label || '일반 근무일'}
                          </span>
                        </TableCell>
                        <TableCell>
                          {row.checkInAt ? (
                            <span className="font-mono text-sm">{formatTimeKST(row.checkInAt)}</span>
                          ) : (
                            <span className="text-muted-foreground text-xs">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {row.checkOutAt ? (
                            <span className="font-mono text-sm">{formatTimeKST(row.checkOutAt)}</span>
                          ) : (
                            <span className="text-muted-foreground text-xs">-</span>
                          )}
                        </TableCell>
                        <TableCell>{renderBadge(row)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {row.reason ||
                            (row.leaveType && `연차 (${LEAVE_TYPE_META[row.leaveType]?.label}) 적용일`)}
                          {row.source === 'ADMIN_EDIT' && ' (관리자 보정)'}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            {/* 모바일 목록 */}
            <div className="divide-y md:hidden">
              {days.map((row) => {
                const dayInfo = getDayOfWeekInfo(row.date);
                const isToday = row.date === today;
                return (
                  <div
                    key={row.date}
                    onClick={() => handleDayClick(row)}
                    className={`p-4 space-y-2 cursor-pointer ${isToday ? 'bg-primary/5' : ''} ${
                      row.isAbsent ? 'bg-red-50/20' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-sm">{row.date}</span>
                        <span
                          className={`text-xs px-1.5 py-0.5 rounded font-semibold ${
                            dayInfo.isSunday
                              ? 'text-rose-600 bg-rose-50'
                              : dayInfo.isWeekend
                              ? 'text-blue-600 bg-blue-50'
                              : 'text-muted-foreground'
                          }`}
                        >
                          ({dayInfo.label})
                        </span>
                        {isToday && (
                          <span className="text-[10px] bg-primary text-primary-foreground px-1.5 rounded-full font-bold">
                            오늘
                          </span>
                        )}
                      </div>
                      {renderBadge(row)}
                    </div>

                    <div className="flex items-center justify-between text-xs bg-muted/30 p-2 rounded-lg">
                      <div>
                        <span className="text-muted-foreground">출근: </span>
                        <span className="font-mono">{row.checkInAt ? formatTimeKST(row.checkInAt) : '-'}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">퇴근: </span>
                        <span className="font-mono">{row.checkOutAt ? formatTimeKST(row.checkOutAt) : '-'}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 날짜 선택 상세 모달 */}
      <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <DialogContent className="sm:max-w-[440px]">
          {selectedDay && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-lg">
                  <CalendarIcon className="size-5 text-primary" />
                  근태 상세 내역
                </DialogTitle>
                <DialogDescription>
                  {selectedDay.date} ({getDayOfWeekInfo(selectedDay.date).label}요일)
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-3 pt-2 text-sm">
                <div className="flex justify-between items-center py-1.5 border-b">
                  <span className="text-muted-foreground">근무 구분:</span>
                  <span className="font-semibold">
                    {selectedDay.dayName
                      ? `${selectedDay.dayName} (${CALENDAR_DAY_TYPE_META[selectedDay.dayType]?.label})`
                      : CALENDAR_DAY_TYPE_META[selectedDay.dayType]?.label || '일반 근무일'}
                  </span>
                </div>

                <div className="flex justify-between items-center py-1.5 border-b">
                  <span className="text-muted-foreground">출근 의무:</span>
                  <Badge variant={selectedDay.isWorkday ? 'default' : 'secondary'}>
                    {selectedDay.isWorkday ? '근무일 (출근 의무 있음)' : '휴일 (출근 의무 없음)'}
                  </Badge>
                </div>

                <div className="flex justify-between items-center py-1.5 border-b">
                  <span className="text-muted-foreground">개인 기준 출퇴근:</span>
                  <span className="font-mono">
                    {minuteToTimeString(user.standardStartMinute)} ~ {minuteToTimeString(user.standardEndMinute)}
                  </span>
                </div>

                <div className="flex justify-between items-center py-1.5 border-b">
                  <span className="text-muted-foreground">실제 출근 시각:</span>
                  <span className="font-mono font-medium">
                    {selectedDay.checkInAt ? formatTimeKST(selectedDay.checkInAt) : '기록 없음'}
                  </span>
                </div>

                <div className="flex justify-between items-center py-1.5 border-b">
                  <span className="text-muted-foreground">실제 퇴근 시각:</span>
                  <span className="font-mono font-medium">
                    {selectedDay.checkOutAt ? formatTimeKST(selectedDay.checkOutAt) : '기록 없음'}
                  </span>
                </div>

                <div className="flex justify-between items-center py-1.5 border-b">
                  <span className="text-muted-foreground">최종 근태 상태:</span>
                  <div>{renderBadge(selectedDay) || <span className="text-muted-foreground">-</span>}</div>
                </div>

                {selectedDay.reason && (
                  <div className="rounded-lg bg-muted/60 p-3 text-xs space-y-1">
                    <span className="font-semibold text-muted-foreground">판정 사유:</span>
                    <p className="text-foreground">{selectedDay.reason}</p>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
