'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Clock,
  CalendarDays,
  Briefcase,
  Gift,
  ChevronLeft,
  ChevronRight,
  Info,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { OvertimeRecord, OvertimeSummary } from '@/lib/hr-types';
import { WORK_TYPE_META, formatDuration } from '@/lib/hr-types';

interface UserOvertimeViewProps {
  records: OvertimeRecord[];
  summary: OvertimeSummary;
  year: number;
  month: number;
  employeeName: string;
}

export function UserOvertimeView({
  records,
  summary,
  year,
  month,
  employeeName,
}: UserOvertimeViewProps) {
  const router = useRouter();

  const handleMonthChange = (offset: number) => {
    let nextY = year;
    let nextM = month + offset;
    if (nextM < 1) {
      nextM = 12;
      nextY -= 1;
    } else if (nextM > 12) {
      nextM = 1;
      nextY += 1;
    }
    router.push(`/user/overtime?year=${nextY}&month=${nextM}`);
  };

  return (
    <div className="space-y-6">
      {/* 상단 헤더 */}
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">내 연장근무</h1>
          <p className="mt-1 text-xs sm:text-sm text-muted-foreground">
            {employeeName}님의 평일 연장근무 및 휴일근무 승인 내역을 확인합니다.
          </p>
        </div>

        {/* 월 네비게이션 */}
        <div className="flex items-center gap-1.5 self-start sm:self-auto bg-card border rounded-lg p-1 shadow-sm">
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={() => handleMonthChange(-1)}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <span className="text-xs sm:text-sm font-bold px-2 min-w-[90px] text-center font-mono">
            {year}년 {month}월
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={() => handleMonthChange(1)}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>

      {/* 안내 박스: 신청 절차 안내 (연장근무 신청 버튼 없음 - Requirement 2) */}
      <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-3.5 text-xs text-blue-900 flex items-start gap-2.5">
        <Info className="size-4 text-blue-600 shrink-0 mt-0.5" />
        <div className="space-y-0.5">
          <p className="font-semibold">연장근무 등록 안내</p>
          <p className="text-blue-800 text-[11px] leading-relaxed">
            연장근무 및 휴일근무는 사내 승인 완료 후 관리자(ADMIN)가 시스템에 직접 등록합니다. 직원은 승인 완료된 본인의 기록을 조회할 수 있습니다.
          </p>
        </div>
      </div>

      {/* 월간 Summary 카드 (Requirement 28, 39) */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="border-0 shadow-sm bg-blue-50/60 border border-blue-100">
          <CardHeader className="p-4 pb-1">
            <CardTitle className="text-xs font-semibold text-blue-900 flex items-center justify-between">
              <span>이번 달 평일연장</span>
              <Clock className="size-4 text-blue-600" />
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-1">
            <p className="text-xl font-bold text-blue-950 font-mono">
              {formatDuration(summary.overtimeMinutes)}
            </p>
            <p className="text-[11px] text-blue-700 mt-0.5">
              분 단위 정밀 집계
            </p>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm bg-indigo-50/60 border border-indigo-100">
          <CardHeader className="p-4 pb-1">
            <CardTitle className="text-xs font-semibold text-indigo-900 flex items-center justify-between">
              <span>이번 달 휴일근무</span>
              <CalendarDays className="size-4 text-indigo-600" />
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-1">
            <p className="text-xl font-bold text-indigo-950 font-mono">
              {formatDuration(summary.holidayWorkMinutes)}
            </p>
            <p className="text-[11px] text-indigo-700 mt-0.5">
              공식 승인시간 기준
            </p>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm bg-emerald-50/60 border border-emerald-100">
          <CardHeader className="p-4 pb-1">
            <CardTitle className="text-xs font-semibold text-emerald-900 flex items-center justify-between">
              <span>총 추가근무시간</span>
              <Briefcase className="size-4 text-emerald-600" />
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-1">
            <p className="text-xl font-bold text-emerald-950 font-mono">
              {formatDuration(summary.totalMinutes)}
            </p>
            <p className="text-[11px] text-emerald-700 mt-0.5">
              총 {summary.overtimeCount + summary.holidayWorkCount}건
            </p>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm bg-purple-50/60 border border-purple-100">
          <CardHeader className="p-4 pb-1">
            <CardTitle className="text-xs font-semibold text-purple-900 flex items-center justify-between">
              <span>대체휴무 부여예정</span>
              <Gift className="size-4 text-purple-600" />
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-1">
            <p className="text-xl font-bold text-purple-950 font-mono">
              {summary.compLeaveGrantedCount ?? 0}일
            </p>
            <p className="text-[11px] text-purple-700 mt-0.5">
              Phase 7 연계 대상
            </p>
          </CardContent>
        </Card>
      </div>

      {/* 상세 목록 (Requirement 29) */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="p-4 border-b">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold">
              {year}년 {month}월 상세 근무 내역
            </CardTitle>
            <span className="text-xs text-muted-foreground">
              총 <span className="font-semibold text-foreground">{records.length}</span>건
            </span>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {/* 데스크톱 테이블 */}
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead className="w-[120px]">근무일자</TableHead>
                  <TableHead className="w-[120px]">근무구분</TableHead>
                  <TableHead className="w-[100px]">시작시간</TableHead>
                  <TableHead className="w-[100px]">종료시간</TableHead>
                  <TableHead className="w-[130px]">실제 근무시간</TableHead>
                  <TableHead>업무내용</TableHead>
                  <TableHead className="w-[140px] text-center">대체휴무</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {records.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-12 text-center text-muted-foreground text-sm">
                      해당 월에 등록된 연장/휴일근무 기록이 없습니다.
                    </TableCell>
                  </TableRow>
                ) : (
                  records.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono text-xs font-semibold">{r.workDate}</TableCell>
                      <TableCell>
                        <Badge
                          className={
                            r.workType === 'HOLIDAY_WORK'
                              ? 'bg-indigo-100 text-indigo-800 hover:bg-indigo-100 border-indigo-300 font-medium'
                              : 'bg-blue-100 text-blue-800 hover:bg-blue-100 border-blue-300 font-medium'
                          }
                        >
                          {WORK_TYPE_META[r.workType].label}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{r.startedAt ?? r.startTime}</TableCell>
                      <TableCell className="font-mono text-xs">{r.endedAt ?? r.endTime}</TableCell>
                      <TableCell className="font-mono text-xs font-bold text-blue-950">
                        {formatDuration(r.durationMinutes ?? r.actualMinutes ?? 0)}
                      </TableCell>
                      <TableCell className="text-xs">{r.description ?? r.workDescription}</TableCell>
                      <TableCell className="text-center">
                        {r.workType === 'HOLIDAY_WORK' ? (
                          r.grantCompLeave ? (
                            <Badge className="bg-purple-100 text-purple-800 hover:bg-purple-100 border-purple-300 text-[11px]">
                              1일 부여예정
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground text-xs">미부여</span>
                          )
                        ) : (
                          <span className="text-muted-foreground text-xs">-</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* 모바일 카드 목록 */}
          <div className="divide-y md:hidden">
            {records.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                해당 월에 등록된 연장/휴일근무 기록이 없습니다.
              </div>
            ) : (
              records.map((r) => (
                <div key={r.id} className="p-4 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-semibold text-sm">{r.workDate}</span>
                    <Badge
                      className={
                        r.workType === 'HOLIDAY_WORK'
                          ? 'bg-indigo-100 text-indigo-800 hover:bg-indigo-100 border-indigo-300'
                          : 'bg-blue-100 text-blue-800 hover:bg-blue-100 border-blue-300'
                      }
                    >
                      {WORK_TYPE_META[r.workType].label}
                    </Badge>
                  </div>

                  <div className="rounded-lg bg-muted/40 p-2.5 text-xs flex items-center justify-between font-mono">
                    <div>
                      <span className="text-muted-foreground font-sans">시간: </span>
                      <span className="font-semibold">
                        {r.startedAt ?? r.startTime} ~ {r.endedAt ?? r.endTime}
                      </span>
                    </div>
                    <div>
                      <span className="text-blue-900 font-bold bg-blue-50 px-2 py-0.5 rounded border border-blue-100">
                        {formatDuration(r.durationMinutes ?? r.actualMinutes ?? 0)}
                      </span>
                    </div>
                  </div>

                  <div className="text-xs text-muted-foreground flex items-center justify-between pt-0.5">
                    <span className="truncate max-w-[200px]">업무: {r.description ?? r.workDescription}</span>
                    {r.workType === 'HOLIDAY_WORK' && r.grantCompLeave && (
                      <Badge className="bg-purple-100 text-purple-800 hover:bg-purple-100 border-purple-300 text-[10px] shrink-0">
                        대체휴무 1일 부여예정
                      </Badge>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
