'use client';

import { useState, useEffect, useCallback } from 'react';
import { CalendarDays, Clock3, TrendingDown, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatDays, formatHours, minutesToDays, LEAVE_TYPE_META } from '@/lib/hr-types';
import type { LeaveSummary, LeaveUsageDisplay, LeaveType } from '@/lib/hr-types';

// ─── 요약 카드 ────────────────────────────────────────────────────────────────

function SummaryCard({
  label,
  minutes,
  accent,
}: {
  label: string;
  minutes: number;
  accent?: boolean;
}) {
  const days = minutesToDays(minutes);
  return (
    <Card className={`border-0 shadow-sm ${accent ? 'bg-[#1e3353] text-white' : ''}`}>
      <CardContent className="p-4 sm:p-5">
        <p className={`text-xs font-medium ${accent ? 'text-blue-200' : 'text-muted-foreground'}`}>
          {label}
        </p>
        <p className={`mt-2 text-2xl font-bold ${accent ? 'text-white' : ''}`}>
          {days.toFixed(3).replace(/\.?0+$/, '')}일
        </p>
        <p className={`mt-1 text-xs ${accent ? 'text-blue-300' : 'text-muted-foreground'}`}>
          {formatHours(minutes)}
        </p>
      </CardContent>
    </Card>
  );
}

// ─── 메인 컴포넌트 ────────────────────────────────────────────────────────────

export default function UserLeaveView() {
  const currentYear = new Date().getFullYear();
  const yearOptions = [currentYear - 1, currentYear, currentYear + 1];

  const [year, setYear] = useState(currentYear);
  const [summary, setSummary] = useState<LeaveSummary | null>(null);
  const [usages, setUsages] = useState<LeaveUsageDisplay[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/leave/my?year=${year}`);
      if (!res.ok) {
        setError('데이터를 불러오는 중 오류가 발생했습니다.');
        return;
      }
      const data = await res.json() as { summary: LeaveSummary; usages: LeaveUsageDisplay[] };
      setSummary(data.summary);
      setUsages(data.usages);
    } finally {
      setLoading(false);
    }
  }, [year]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const totalMinutes = summary ? summary.grantedMinutes + summary.carriedMinutes : 0;
  const remainMinutes = summary ? totalMinutes - summary.usedMinutes : 0;
  const activeUsages = usages.filter((u) => !u.cancelledAt);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">내 연차</h1>
        <p className="mt-1 text-sm text-muted-foreground">연도별 연차 잔여 및 사용내역을 확인합니다.</p>
      </div>

      {/* 연도 선택 */}
      <div className="flex gap-1 rounded-xl bg-muted p-1 w-fit">
        {yearOptions.map((y) => (
          <button
            key={y}
            onClick={() => setYear(y)}
            className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${
              y === year ? 'bg-white text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {y}
          </button>
        ))}
      </div>

      {loading && (
        <p className="py-6 text-center text-sm text-muted-foreground">불러오는 중...</p>
      )}

      {error && (
        <div className="flex items-center gap-2 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
          <AlertCircle className="size-4" />
          {error}
        </div>
      )}

      {!loading && summary && (
        <>
          {!summary.masterId && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              {year}년도 연차 마스터가 아직 설정되지 않았습니다. 관리자에게 문의하세요.
            </div>
          )}

          {/* 잔여연차 강조 카드 (Mobile 우선) */}
          <Card className="border-0 bg-[#1e3353] text-white shadow-lg">
            <CardContent className="p-5 sm:p-7">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-blue-200">{year}년 잔여 연차</p>
                  <p className={`mt-2 text-4xl font-bold ${remainMinutes < 0 ? 'text-rose-300' : ''}`}>
                    {minutesToDays(remainMinutes).toFixed(3).replace(/\.?0+$/, '')}일
                  </p>
                  <p className="mt-1 text-lg text-blue-200">{formatHours(remainMinutes)}</p>
                </div>
                <TrendingDown className="size-8 text-blue-300 opacity-60" />
              </div>
              {remainMinutes < 0 && (
                <p className="mt-3 text-sm text-rose-300">⚠ 잔여 연차가 부족합니다.</p>
              )}
            </CardContent>
          </Card>

          {/* 요약 카드들 */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <SummaryCard label="기본 부여" minutes={summary.grantedMinutes} />
            <SummaryCard label="이월" minutes={summary.carriedMinutes} />
            <SummaryCard label="총 연차" minutes={totalMinutes} />
            <SummaryCard label="사용" minutes={summary.usedMinutes} />
          </div>

          {/* 사용내역 */}
          <Card className="border-0 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <CalendarDays className="size-4 text-primary" />
                연차 사용내역
                <Badge variant="secondary" className="ml-1">{activeUsages.length}건</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {usages.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">사용내역이 없습니다.</p>
              ) : (
                <div className="space-y-0">
                  {/* 데스크톱 테이블 */}
                  <div className="hidden sm:block">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-xs text-muted-foreground">
                          <th className="pb-2 text-left font-medium">사용일자</th>
                          <th className="pb-2 text-left font-medium">연차종류</th>
                          <th className="pb-2 text-right font-medium">사용일수</th>
                          <th className="pb-2 text-right font-medium">사용시간</th>
                          <th className="pb-2 text-right font-medium">상태</th>
                        </tr>
                      </thead>
                      <tbody>
                        {usages.map((u) => (
                          <tr key={u.id} className={`border-b last:border-0 ${u.cancelledAt ? 'opacity-40' : ''}`}>
                            <td className="py-3 font-mono text-xs">{u.leaveDate}</td>
                            <td className="py-3">
                              <Badge variant="outline">{LEAVE_TYPE_META[u.leaveType as LeaveType].label}</Badge>
                            </td>
                            <td className="py-3 text-right">{minutesToDays(u.minutes).toFixed(3).replace(/\.?0+$/, '')}일</td>
                            <td className="py-3 text-right text-muted-foreground">{formatHours(u.minutes)}</td>
                            <td className="py-3 text-right">
                              {u.cancelledAt ? (
                                <Badge variant="secondary" className="text-xs">취소됨</Badge>
                              ) : (
                                <span className="text-xs text-emerald-600">정상</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* 모바일 카드 */}
                  <div className="space-y-2 sm:hidden">
                    {usages.map((u) => (
                      <div key={u.id} className={`flex items-center justify-between rounded-xl border p-3 ${u.cancelledAt ? 'opacity-40' : ''}`}>
                        <div className="flex items-center gap-3">
                          <span className="grid size-11 place-items-center rounded-xl bg-muted text-xs font-semibold leading-tight text-center">
                            {u.leaveDate.slice(5).replace('-', '.')}
                          </span>
                          <div>
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-xs">{LEAVE_TYPE_META[u.leaveType as LeaveType].label}</Badge>
                              {u.cancelledAt && <Badge variant="secondary" className="text-xs">취소됨</Badge>}
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground">{formatHours(u.minutes)}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold">{minutesToDays(u.minutes).toFixed(3).replace(/\.?0+$/, '')}일</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* 연차 사용 분포 (간단한 시각화) */}
          {summary.masterId && totalMinutes > 0 && (
            <Card className="border-0 shadow-sm">
              <CardContent className="p-4 sm:p-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Clock3 className="size-4 text-primary" />
                    <span className="text-sm font-medium">연차 사용률</span>
                  </div>
                  <span className="text-sm font-semibold">
                    {((summary.usedMinutes / totalMinutes) * 100).toFixed(1)}%
                  </span>
                </div>
                <div className="mt-3 h-3 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{
                      width: `${Math.min(100, (summary.usedMinutes / totalMinutes) * 100)}%`,
                    }}
                  />
                </div>
                <div className="mt-2 flex justify-between text-xs text-muted-foreground">
                  <span>사용 {formatHours(summary.usedMinutes)}</span>
                  <span>잔여 {formatHours(Math.max(0, remainMinutes))}</span>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
