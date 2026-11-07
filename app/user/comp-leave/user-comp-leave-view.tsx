'use client';

import React from 'react';
import {
  CalendarCheck2,
  Clock,
  CheckCircle2,
  Calendar,
  AlertTriangle,
  Info,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { UserCompensatoryLeaveRow, UserCompensatoryLeaveSummary, ExpiringSoonCompLeave } from '@/lib/hr-types';
import { formatDuration } from '@/lib/hr-types';

interface UserCompLeaveViewProps {
  rows: UserCompensatoryLeaveRow[];
  summary: UserCompensatoryLeaveSummary;
  expiringSoonList: ExpiringSoonCompLeave[];
  employeeName: string;
}

export function UserCompLeaveView({
  rows,
  summary,
  expiringSoonList,
  employeeName,
}: UserCompLeaveViewProps) {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* 헤더 */}
      <div>
        <p className="text-sm font-medium text-primary">휴일근무 대체휴무 현황</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight md:text-3xl">
          {employeeName}님의 대체휴무
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          휴일근무로 부여된 1일 단위 대체휴무의 잔여 및 유효기간을 확인합니다.
        </p>
      </div>

      {/* 30일 이내 만료 예정 알림 배너 */}
      {expiringSoonList.length > 0 && (
        <div className="flex items-center gap-3 p-4 bg-amber-50/80 border border-amber-200 rounded-xl text-amber-900 shadow-sm">
          <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
          <div className="text-xs sm:text-sm">
            <span className="font-bold">
              30일 이내에 만료 예정인 대체휴무가 {expiringSoonList.length}건 있습니다!
            </span>
            <p className="text-amber-700 mt-0.5">
              대체휴무는 발생일 기준 3개월 이내에 사용해야 하며, 만료 시 자동 소멸되므로 빠른 사용을 권장합니다.
            </p>
          </div>
        </div>
      )}

      {/* 요약 카드 3종 */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="shadow-sm border-0 border-l-4 border-l-emerald-500">
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs font-semibold">사용 가능</span>
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            </div>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="text-2xl font-bold text-emerald-600">{summary.availableDays}</span>
              <span className="text-xs text-muted-foreground">일</span>
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">현재 유효</p>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-0 border-l-4 border-l-blue-500">
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs font-semibold">사용 완료</span>
              <Calendar className="h-4 w-4 text-blue-500" />
            </div>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="text-2xl font-bold text-blue-600">{summary.usedDays}</span>
              <span className="text-xs text-muted-foreground">일</span>
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">누적 사용</p>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-0 border-l-4 border-l-amber-500">
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs font-semibold">만료 예정</span>
              <Clock className="h-4 w-4 text-amber-500" />
            </div>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="text-2xl font-bold text-amber-600">{summary.expiringSoonDays}</span>
              <span className="text-xs text-muted-foreground">일</span>
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">30일 이내</p>
          </CardContent>
        </Card>
      </div>

      {/* 안내 박스 */}
      <div className="flex items-start gap-2 p-3 bg-muted/40 rounded-lg text-xs text-muted-foreground border">
        <Info className="h-4 w-4 text-indigo-500 shrink-0 mt-0.5" />
        <span>
          대체휴무는 휴일근무 1건당 1일씩 별도 부여되며, 일반 연차 잔여일수와 합산되지 않고 완전히 분리되어 관리됩니다. (Req 12 원칙)
        </span>
      </div>

      {/* 대체휴무 목록 */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-bold">대체휴무 상세 내역</CardTitle>
          <CardDescription>발생일, 근거 휴일근무 및 유효기간 내역입니다.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {rows.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">
              보유 중인 대체휴무가 없습니다. (휴일근무 승인 시 1일씩 부여됩니다.)
            </div>
          ) : (
            rows.map((r) => {
              const isExpiringSoon = r.status === 'AVAILABLE' && r.daysUntilExpiry >= 0 && r.daysUntilExpiry <= 30;

              return (
                <div
                  key={r.id}
                  className="p-4 rounded-xl border bg-card hover:bg-muted/20 transition-colors space-y-2 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm text-foreground">
                        대체휴무 1일
                      </span>
                      {r.status === 'AVAILABLE' && (
                        <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-emerald-700 font-medium">
                          사용 가능
                        </Badge>
                      )}
                      {r.status === 'USED' && (
                        <Badge variant="secondary" className="bg-blue-100 text-blue-800 font-medium">
                          사용 완료
                        </Badge>
                      )}
                      {r.status === 'EXPIRED' && (
                        <Badge variant="outline" className="text-slate-500 font-medium">
                          만료됨
                        </Badge>
                      )}
                    </div>

                    {isExpiringSoon && (
                      <Badge variant="destructive" className="text-[10px] font-bold">
                        만료 D-{r.daysUntilExpiry}
                      </Badge>
                    )}
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-muted-foreground">
                    <div>
                      <span className="block text-[11px]">발생일</span>
                      <span className="font-mono text-foreground font-medium">{r.issuedOn}</span>
                    </div>
                    <div>
                      <span className="block text-[11px]">근거 휴일근무</span>
                      <span className="font-mono text-foreground font-medium">
                        {r.sourceWorkDate} ({formatDuration(r.sourceDurationMinutes)})
                      </span>
                    </div>
                    <div>
                      <span className="block text-[11px]">유효 만료일</span>
                      <span className="font-mono text-foreground font-medium">{r.expiresOn}</span>
                    </div>
                    <div>
                      <span className="block text-[11px]">사용일</span>
                      <span className="font-mono text-blue-600 font-semibold">
                        {r.usedOn ? r.usedOn : '-'}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}
