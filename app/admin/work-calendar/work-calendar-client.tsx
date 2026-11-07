'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  Sparkles,
  Plus,
  Info,
  CheckCircle2,
  Clock,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CalendarEventDialog } from './calendar-event-dialog';
import type { CalendarDayType, EffectiveWorkday, WorkCalendarRow } from '@/lib/hr-types';
import { CALENDAR_DAY_TYPE_META } from '@/lib/hr-types';

interface WorkCalendarClientProps {
  year: number;
  month: number;
  effectiveDays: EffectiveWorkday[];
  dbRecords: WorkCalendarRow[];
  today: string;
}

export function WorkCalendarClient({
  year,
  month,
  effectiveDays,
  dbRecords,
  today,
}: WorkCalendarClientProps) {
  const router = useRouter();

  // 날짜 선택 및 모달
  const [selectedDate, setSelectedDate] = useState<string>(today);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSeeding, setIsSeeding] = useState(false);

  // DB 레코드 맵
  const dbRecordMap = new Map<string, WorkCalendarRow>();
  for (const r of dbRecords) {
    dbRecordMap.set(r.calendarDate, r);
  }

  // Effective 날짜 맵
  const effectiveMap = new Map<string, EffectiveWorkday>();
  for (const ed of effectiveDays) {
    effectiveMap.set(ed.date, ed);
  }

  // 달력 계산 (해당 월 1일의 요일 및 총 일수)
  const firstDayOfWeek = new Date(year, month - 1, 1).getDay(); // 0(일) ~ 6(토)
  const daysInMonth = new Date(year, month, 0).getDate();

  // 이전 달 / 다음 달 이동
  const handlePrevMonth = () => {
    let newY = year;
    let newM = month - 1;
    if (newM < 1) {
      newY -= 1;
      newM = 12;
    }
    router.push(`/admin/work-calendar?year=${newY}&month=${newM}`);
  };

  const handleNextMonth = () => {
    let newY = year;
    let newM = month + 1;
    if (newM > 12) {
      newY += 1;
      newM = 1;
    }
    router.push(`/admin/work-calendar?year=${newY}&month=${newM}`);
  };

  const handleCurrentMonth = () => {
    const now = new Date();
    const kstY = parseInt(new Intl.DateTimeFormat('en', { year: 'numeric', timeZone: 'Asia/Seoul' }).format(now), 10);
    const kstM = parseInt(new Intl.DateTimeFormat('en', { month: 'numeric', timeZone: 'Asia/Seoul' }).format(now), 10);
    router.push(`/admin/work-calendar?year=${kstY}&month=${kstM}`);
  };

  // 날짜 클릭
  const handleDateClick = (dateStr: string) => {
    setSelectedDate(dateStr);
    setIsDialogOpen(true);
  };

  // 공휴일 시드 실행
  const handleSeedHolidays = async () => {
    if (!confirm('2026~2027 대한민국 법정공휴일 데이터를 안전하게 등록하시겠습니까? (기존 회사 설정은 유지됩니다)')) {
      return;
    }

    setIsSeeding(true);
    try {
      const res = await fetch('/api/calendar/seed', { method: 'POST' });
      const data = (await res.json()) as { error?: string; message?: string };
      if (!res.ok) {
        alert(data.error || '공휴일 시드 등록에 실패했습니다.');
        return;
      }
      alert(data.message || '공휴일 데이터가 등록되었습니다.');
      router.refresh();
    } catch {
      alert('네트워크 오류가 발생했습니다.');
    } finally {
      setIsSeeding(false);
    }
  };

  // 통계 계산
  let workdayCount = 0;
  let weekendCount = 0;
  let holidayCount = 0;
  let companyHolidayCount = 0;
  let substituteCount = 0;

  for (const ed of effectiveDays) {
    if (ed.isWorkday) workdayCount++;
    if (ed.dayType === 'WEEKEND') weekendCount++;
    if (ed.dayType === 'PUBLIC_HOLIDAY') holidayCount++;
    if (ed.dayType === 'COMPANY_HOLIDAY') companyHolidayCount++;
    if (ed.dayType === 'SUBSTITUTE_WORKDAY') substituteCount++;
  }

  const selectedEffective = effectiveMap.get(selectedDate);
  const selectedDb = dbRecordMap.get(selectedDate);

  return (
    <div className="space-y-6">
      {/* 상단 헤더 & 컨트롤 */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">근무일 캘린더</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            공휴일, 회사 지정 휴무일, 대체근무일을 등록하고 근태 기준 근무일을 관리합니다.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* 월 이동 */}
          <div className="flex items-center rounded-lg border bg-card p-1 shadow-sm">
            <Button variant="ghost" size="icon" className="size-8" onClick={handlePrevMonth} aria-label="이전 달">
              <ChevronLeft className="size-4" />
            </Button>
            <span className="min-w-[110px] text-center font-semibold text-sm">
              {year}년 {String(month).padStart(2, '0')}월
            </span>
            <Button variant="ghost" size="icon" className="size-8" onClick={handleNextMonth} aria-label="다음 달">
              <ChevronRight className="size-4" />
            </Button>
          </div>

          <Button variant="outline" size="sm" onClick={handleCurrentMonth} className="h-10 text-xs">
            이번 달
          </Button>

          <Button
            variant="secondary"
            size="sm"
            onClick={handleSeedHolidays}
            disabled={isSeeding}
            className="h-10 text-xs gap-1.5"
          >
            <Sparkles className="size-3.5 text-purple-600" />
            공휴일 자동 등록
          </Button>
        </div>
      </div>

      {/* 요약 카드 */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground font-medium">총 근무일수</p>
            <p className="mt-1 text-2xl font-bold text-primary">
              {workdayCount}
              <span className="text-xs font-normal text-muted-foreground ml-1">일</span>
            </p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground font-medium">법정공휴일</p>
            <p className="mt-1 text-2xl font-bold text-rose-600">
              {holidayCount}
              <span className="text-xs font-normal text-muted-foreground ml-1">일</span>
            </p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground font-medium">회사 지정 휴무일</p>
            <p className="mt-1 text-2xl font-bold text-amber-600">
              {companyHolidayCount}
              <span className="text-xs font-normal text-muted-foreground ml-1">일</span>
            </p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground font-medium">대체근무일</p>
            <p className="mt-1 text-2xl font-bold text-emerald-600">
              {substituteCount}
              <span className="text-xs font-normal text-muted-foreground ml-1">일</span>
            </p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground font-medium">주말 (토/일)</p>
            <p className="mt-1 text-2xl font-bold text-blue-600">
              {weekendCount}
              <span className="text-xs font-normal text-muted-foreground ml-1">일</span>
            </p>
          </CardContent>
        </Card>
      </div>

      {/* 범례 표시 */}
      <div className="flex flex-wrap items-center gap-2 text-xs bg-muted/40 p-3 rounded-xl border">
        <span className="font-semibold mr-1 flex items-center gap-1 text-foreground">
          <Info className="size-3.5 text-muted-foreground" />
          범례:
        </span>
        <Badge variant="outline" className="bg-white text-slate-700">일반 근무일</Badge>
        <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">주말 (토/일)</Badge>
        <Badge variant="outline" className="bg-rose-50 text-rose-700 border-rose-200">공휴일</Badge>
        <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">회사 지정 휴무일</Badge>
        <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">대체근무일</Badge>
        <span className="text-muted-foreground text-[11px] ml-auto">
          * 날짜를 클릭하면 해당 일자의 휴무/대체근무 예외를 등록·수정할 수 있습니다.
        </span>
      </div>

      {/* 캘린더 그리드 */}
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

          {/* 일자 그리드 */}
          <div className="grid grid-cols-7 divide-x divide-y border-b">
            {/* 첫 주 빈 셀 */}
            {Array.from({ length: firstDayOfWeek }).map((_, i) => (
              <div key={`empty-${i}`} className="min-h-[90px] md:min-h-[110px] bg-muted/15 p-2" />
            ))}

            {/* 해당 월의 날짜들 */}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const d = i + 1;
              const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
              const dayOfWeek = (firstDayOfWeek + i) % 7;
              const isSunday = dayOfWeek === 0;
              const isSaturday = dayOfWeek === 6;
              const isToday = dateStr === today;

              const effective = effectiveMap.get(dateStr) ?? {
                date: dateStr,
                dayType: isSunday || isSaturday ? 'WEEKEND' : 'NORMAL_WORKDAY',
                isWorkday: !isSunday && !isSaturday,
                name: null,
                memo: null,
                source: 'DEFAULT',
              };

              const hasDbOverride = dbRecordMap.has(dateStr);

              return (
                <div
                  key={dateStr}
                  onClick={() => handleDateClick(dateStr)}
                  className={`min-h-[90px] md:min-h-[110px] p-2 transition-colors cursor-pointer hover:bg-muted/40 relative flex flex-col justify-between ${
                    isToday ? 'bg-primary/5 ring-1 ring-inset ring-primary' : ''
                  }`}
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

                    {hasDbOverride && (
                      <span className="size-2 rounded-full bg-purple-500" title="관리자 예외 등록됨" />
                    )}
                  </div>

                  {/* 상태 배지 / 명칭 */}
                  <div className="mt-1 space-y-1">
                    {effective.dayType === 'PUBLIC_HOLIDAY' && (
                      <div className="rounded bg-rose-50 px-1.5 py-0.5 text-[11px] font-semibold text-rose-700 border border-rose-200 truncate">
                        {effective.name || '공휴일'}
                      </div>
                    )}

                    {effective.dayType === 'COMPANY_HOLIDAY' && (
                      <div className="rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-semibold text-amber-700 border border-amber-200 truncate">
                        {effective.name || '회사 휴무'}
                      </div>
                    )}

                    {effective.dayType === 'SUBSTITUTE_WORKDAY' && (
                      <div className="rounded bg-emerald-50 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-700 border border-emerald-200 truncate">
                        {effective.name || '대체근무'}
                      </div>
                    )}

                    {effective.dayType === 'NORMAL_WORKDAY' && (
                      <span className="text-[10px] text-muted-foreground hidden md:inline">
                        근무일
                      </span>
                    )}

                    {effective.dayType === 'WEEKEND' && !effective.name && (
                      <span className="text-[10px] text-muted-foreground/60 hidden md:inline">
                        주말
                      </span>
                    )}
                  </div>

                  <div className="text-[10px] text-muted-foreground flex justify-end">
                    {effective.isWorkday ? (
                      <span className="text-emerald-700 font-medium">출근의무</span>
                    ) : (
                      <span className="text-slate-400">휴일</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* 등록 모달 */}
      <CalendarEventDialog
        isOpen={isDialogOpen}
        selectedDate={selectedDate}
        effectiveDay={selectedEffective}
        dbRecord={selectedDb}
        onClose={() => setIsDialogOpen(false)}
        onSuccess={() => router.refresh()}
      />
    </div>
  );
}
