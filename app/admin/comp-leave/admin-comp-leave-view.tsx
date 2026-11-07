'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  CalendarCheck2,
  CalendarDays,
  Clock,
  AlertTriangle,
  Search,
  Filter,
  RefreshCw,
  PlusCircle,
  CheckCircle2,
  XCircle,
  RotateCcw,
  Calendar,
  Building2,
  Info,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import type { CompensatoryLeaveRow, CompensatoryLeaveSummary } from '@/lib/hr-types';
import { formatDuration } from '@/lib/hr-types';

interface AdminCompLeaveViewProps {
  initialRows: CompensatoryLeaveRow[];
  initialSummary: CompensatoryLeaveSummary;
  departments: string[];
  initialDepartment: string;
  initialSearch: string;
  initialStatus: string;
}

export function AdminCompLeaveView({
  initialRows,
  initialSummary,
  departments,
  initialDepartment,
  initialSearch,
  initialStatus,
}: AdminCompLeaveViewProps) {
  const router = useRouter();

  // 필터 상태
  const [department, setDepartment] = useState(initialDepartment);
  const [search, setSearch] = useState(initialSearch);
  const [statusFilter, setStatusFilter] = useState(initialStatus);

  // 모달 상태
  const [useDialogOpen, setUseDialogOpen] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<CompensatoryLeaveRow | null>(null);
  const [targetDate, setTargetDate] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // 취소 다이얼로그
  const [cancelUsageDialogOpen, setCancelUsageDialogOpen] = useState(false);
  const [cancelGrantDialogOpen, setCancelGrantDialogOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  const handleApplyFilter = () => {
    const params = new URLSearchParams();
    if (department && department !== 'ALL') params.set('department', department);
    if (search.trim()) params.set('search', search.trim());
    if (statusFilter && statusFilter !== 'ALL') params.set('status', statusFilter);
    router.push(`/admin/comp-leave?${params.toString()}`);
  };

  const handleResetFilter = () => {
    setDepartment('ALL');
    setSearch('');
    setStatusFilter('ALL');
    router.push('/admin/comp-leave');
  };

  const openUseDialog = (record: CompensatoryLeaveRow) => {
    setSelectedRecord(record);
    setTargetDate('');
    setErrorMessage('');
    setUseDialogOpen(true);
  };

  const handleUseSubmit = async () => {
    if (!selectedRecord || !targetDate) {
      setErrorMessage('대체휴무를 사용할 날짜를 선택해주세요.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage('');
    try {
      const res = await fetch('/api/comp-leave/use', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeId: selectedRecord.employeeId,
          compensatoryLeaveId: selectedRecord.id,
          usedOn: targetDate,
        }),
      });

      const data = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setErrorMessage(data.error || '대체휴무 사용 등록에 실패했습니다.');
        setIsSubmitting(false);
        return;
      }

      setUseDialogOpen(false);
      router.refresh();
    } catch {
      setErrorMessage('서버와 통신 중 오류가 발생했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancelUsageSubmit = async () => {
    if (!selectedRecord) return;
    setIsSubmitting(true);
    setErrorMessage('');
    try {
      const res = await fetch('/api/comp-leave/cancel-usage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          compensatoryLeaveId: selectedRecord.id,
          reason: cancelReason.trim() || '관리자 대체휴무 사용 취소',
        }),
      });

      const data = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setErrorMessage(data.error || '사용 취소에 실패했습니다.');
        setIsSubmitting(false);
        return;
      }

      setCancelUsageDialogOpen(false);
      router.refresh();
    } catch {
      setErrorMessage('서버와 통신 중 오류가 발생했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancelGrantSubmit = async () => {
    if (!selectedRecord) return;
    setIsSubmitting(true);
    setErrorMessage('');
    try {
      const res = await fetch('/api/comp-leave/cancel-grant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          compensatoryLeaveId: selectedRecord.id,
          reason: cancelReason.trim() || '관리자 대체휴무 부여 취소',
        }),
      });

      const data = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setErrorMessage(data.error || '부여 취소에 실패했습니다.');
        setIsSubmitting(false);
        return;
      }

      setCancelGrantDialogOpen(false);
      router.refresh();
    } catch {
      setErrorMessage('서버와 통신 중 오류가 발생했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <CalendarCheck2 className="h-7 w-7 text-indigo-600" />
            대체휴무 관리
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            휴일근무로 발생한 대체휴무를 관리하고, 사용 등록 및 만료 내역을 통합 조회합니다.
          </p>
        </div>
      </div>

      {/* KPI 카드 4종 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <Card className="shadow-sm border-l-4 border-l-emerald-500">
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs font-semibold">총 사용 가능</span>
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            </div>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="text-2xl font-bold text-emerald-600">
                {initialSummary.totalAvailableDays}
              </span>
              <span className="text-xs text-muted-foreground">일</span>
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">현재 유효한 대체휴무</p>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-l-4 border-l-blue-500">
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs font-semibold">이번 달 사용</span>
              <Calendar className="h-4 w-4 text-blue-500" />
            </div>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="text-2xl font-bold text-blue-600">
                {initialSummary.usedThisMonthDays}
              </span>
              <span className="text-xs text-muted-foreground">일</span>
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">당월 사용 완료 건수</p>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-l-4 border-l-amber-500">
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs font-semibold">30일 내 만료 예정</span>
              <Clock className="h-4 w-4 text-amber-500" />
            </div>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="text-2xl font-bold text-amber-600">
                {initialSummary.expiringWithin30Days}
              </span>
              <span className="text-xs text-muted-foreground">일</span>
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">신속한 사용 권장</p>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-l-4 border-l-slate-400">
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs font-semibold">만료 누적</span>
              <XCircle className="h-4 w-4 text-slate-400" />
            </div>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="text-2xl font-bold text-slate-600">
                {initialSummary.expiredDays}
              </span>
              <span className="text-xs text-muted-foreground">일</span>
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">3개월 유효기간 경과</p>
          </CardContent>
        </Card>
      </div>

      {/* 필터 및 검색 바 */}
      <Card className="shadow-sm">
        <CardContent className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">부서</label>
              <select
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="ALL">전체 부서</option>
                {departments.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">상태</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="ALL">전체 상태</option>
                <option value="AVAILABLE">사용 가능</option>
                <option value="USED">사용 완료</option>
                <option value="EXPIRED">만료됨</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">직원 검색</label>
              <Input
                type="text"
                placeholder="사번 또는 성명"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleApplyFilter()}
                className="h-9 text-xs"
              />
            </div>

            <div className="flex items-end gap-2">
              <Button
                onClick={handleApplyFilter}
                size="sm"
                className="h-9 flex-1 text-xs gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white"
              >
                <Search className="h-3.5 w-3.5" />
                조회
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleResetFilter}
                className="h-9 text-xs"
                title="초기화"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ─── Desktop Table View ──────────────────────────────────────────────── */}
      <div className="hidden md:block">
        <Card className="shadow-sm">
          <Table>
            <TableHeader className="bg-muted/40">
              <TableRow>
                <TableHead className="w-[120px] text-xs">직원 (사번)</TableHead>
                <TableHead className="w-[100px] text-xs">부서</TableHead>
                <TableHead className="w-[110px] text-xs">발행일</TableHead>
                <TableHead className="text-xs">발생 근거 (휴일근무)</TableHead>
                <TableHead className="w-[120px] text-xs">만료일 (유효기간)</TableHead>
                <TableHead className="w-[110px] text-xs">상태</TableHead>
                <TableHead className="w-[130px] text-center text-xs">관리</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {initialRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-32 text-center text-muted-foreground text-sm">
                    조건에 해당하는 대체휴무 내역이 없습니다.
                  </TableCell>
                </TableRow>
              ) : (
                initialRows.map((r) => {
                  const isExpiringSoon = r.status === 'AVAILABLE' && r.daysUntilExpiry >= 0 && r.daysUntilExpiry <= 30;

                  return (
                    <TableRow key={r.id} className="hover:bg-muted/30">
                      <TableCell className="text-xs font-semibold">
                        <div>{r.fullName}</div>
                        <div className="text-[10px] text-muted-foreground font-mono">{r.employeeNumber}</div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{r.department}</TableCell>
                      <TableCell className="text-xs font-mono">{r.issuedOn}</TableCell>
                      <TableCell className="text-xs">
                        <span className="font-mono text-indigo-600 dark:text-indigo-400">{r.sourceWorkDate}</span>
                        <span className="text-muted-foreground ml-1.5">
                          ({formatDuration(r.sourceDurationMinutes)})
                        </span>
                      </TableCell>
                      <TableCell className="text-xs font-mono">
                        <div>{r.expiresOn}</div>
                        {isExpiringSoon && (
                          <span className="text-[10px] text-amber-600 font-bold block">
                            (D-{r.daysUntilExpiry})
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        {r.status === 'AVAILABLE' && (
                          <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-emerald-700 text-[11px]">
                            사용 가능
                          </Badge>
                        )}
                        {r.status === 'USED' && (
                          <div className="space-y-0.5">
                            <Badge variant="secondary" className="bg-blue-100 text-blue-800 text-[11px]">
                              사용 완료
                            </Badge>
                            {r.usedOn && (
                              <div className="text-[10px] text-muted-foreground font-mono">
                                {r.usedOn}
                              </div>
                            )}
                          </div>
                        )}
                        {r.status === 'EXPIRED' && (
                          <Badge variant="outline" className="border-slate-300 text-slate-500 text-[11px]">
                            만료됨
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-center space-x-1">
                        {r.status === 'AVAILABLE' && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs border-indigo-200 text-indigo-700 hover:bg-indigo-50"
                            onClick={() => openUseDialog(r)}
                          >
                            사용 등록
                          </Button>
                        )}
                        {r.status === 'USED' && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs text-amber-700 hover:bg-amber-50"
                            onClick={() => {
                              setSelectedRecord(r);
                              setCancelReason('');
                              setCancelUsageDialogOpen(true);
                            }}
                          >
                            사용 취소
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs text-muted-foreground hover:text-rose-600"
                          onClick={() => {
                            setSelectedRecord(r);
                            setCancelReason('');
                            setCancelGrantDialogOpen(true);
                          }}
                        >
                          부여 취소
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </Card>
      </div>

      {/* ─── Mobile Card View ────────────────────────────────────────────────── */}
      <div className="md:hidden space-y-3">
        {initialRows.length === 0 ? (
          <Card className="p-8 text-center text-muted-foreground text-sm">
            조건에 해당하는 대체휴무 내역이 없습니다.
          </Card>
        ) : (
          initialRows.map((r) => (
            <Card key={r.id} className="p-4 shadow-sm space-y-2.5">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-semibold text-sm">{r.fullName}</span>
                  <span className="text-xs text-muted-foreground ml-1 font-mono">({r.employeeNumber})</span>
                  <span className="text-xs text-muted-foreground ml-2">· {r.department}</span>
                </div>
                {r.status === 'AVAILABLE' && (
                  <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-emerald-700 text-xs">
                    사용 가능
                  </Badge>
                )}
                {r.status === 'USED' && (
                  <Badge variant="secondary" className="bg-blue-100 text-blue-800 text-xs">
                    사용 완료
                  </Badge>
                )}
                {r.status === 'EXPIRED' && (
                  <Badge variant="outline" className="text-slate-500 text-xs">
                    만료됨
                  </Badge>
                )}
              </div>

              <div className="text-xs bg-muted/30 p-2.5 rounded-lg space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">근거 휴일근무:</span>
                  <span className="font-mono">{r.sourceWorkDate} ({formatDuration(r.sourceDurationMinutes)})</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">유효 만료일:</span>
                  <span className="font-mono">{r.expiresOn}</span>
                </div>
                {r.usedOn && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">실제 사용일:</span>
                    <span className="font-mono text-blue-600 font-semibold">{r.usedOn}</span>
                  </div>
                )}
              </div>

              <div className="flex gap-2 pt-1">
                {r.status === 'AVAILABLE' && (
                  <Button
                    size="sm"
                    className="h-8 flex-1 text-xs bg-indigo-600 hover:bg-indigo-700 text-white"
                    onClick={() => openUseDialog(r)}
                  >
                    대체휴무 사용 등록
                  </Button>
                )}
                {r.status === 'USED' && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 flex-1 text-xs text-amber-700"
                    onClick={() => {
                      setSelectedRecord(r);
                      setCancelReason('');
                      setCancelUsageDialogOpen(true);
                    }}
                  >
                    사용 취소
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 text-xs text-muted-foreground"
                  onClick={() => {
                    setSelectedRecord(r);
                    setCancelReason('');
                    setCancelGrantDialogOpen(true);
                  }}
                >
                  부여 취소
                </Button>
              </div>
            </Card>
          ))
        )}
      </div>

      {/* ─── 대체휴무 사용 등록 다이얼로그 ──────────────────────────────────── */}
      <Dialog open={useDialogOpen} onOpenChange={setUseDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold">대체휴무 1일 사용 등록</DialogTitle>
            <DialogDescription>
              선택한 직원의 유효한 대체휴무를 특정 근무일에 1일 사용 처리합니다.
            </DialogDescription>
          </DialogHeader>

          {selectedRecord && (
            <div className="space-y-3 py-2 text-xs">
              <div className="p-3 bg-muted/40 rounded-lg space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">대상 직원:</span>
                  <span className="font-semibold text-foreground">
                    {selectedRecord.fullName} ({selectedRecord.employeeNumber}) · {selectedRecord.department}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">근거 휴일근무:</span>
                  <span className="font-mono">{selectedRecord.sourceWorkDate}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">유효 만료일:</span>
                  <span className="font-mono">{selectedRecord.expiresOn}</span>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold block mb-1">
                  대체휴무 사용 날짜 (출근의무 근무일) <span className="text-rose-500">*</span>
                </label>
                <Input
                  type="date"
                  value={targetDate}
                  onChange={(e) => setTargetDate(e.target.value)}
                  className="h-9 text-xs"
                />
                <p className="text-[11px] text-muted-foreground mt-1">
                  * 평일 근무일 또는 대체근무일만 지정 가능하며, 주말/공휴일은 불가합니다.
                </p>
              </div>

              {errorMessage && (
                <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg text-xs">
                  {errorMessage}
                </div>
              )}
            </div>
          )}

          <DialogFooter className="pt-2">
            <Button variant="outline" size="sm" onClick={() => setUseDialogOpen(false)} disabled={isSubmitting}>
              취소
            </Button>
            <Button
              size="sm"
              onClick={handleUseSubmit}
              disabled={isSubmitting}
              className="bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              {isSubmitting ? '등록 중...' : '대체휴무 사용 확정'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── 대체휴무 사용 취소 다이얼로그 ──────────────────────────────────── */}
      <Dialog open={cancelUsageDialogOpen} onOpenChange={setCancelUsageDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold">대체휴무 사용 취소</DialogTitle>
            <DialogDescription>
              사용 완료된 대체휴무를 취소하여 다시 사용 가능 상태로 복원합니다.
            </DialogDescription>
          </DialogHeader>

          {selectedRecord && (
            <div className="space-y-3 py-2 text-xs">
              <p className="text-muted-foreground">
                <span className="font-semibold text-foreground">{selectedRecord.fullName}</span>님의{' '}
                <span className="font-mono text-blue-600 font-semibold">{selectedRecord.usedOn}</span> 대체휴무 사용을 취소하시겠습니까?
              </p>

              <div>
                <label className="text-xs font-semibold block mb-1">취소 사유 (감사로그 기록)</label>
                <Input
                  type="text"
                  placeholder="예: 직원 요청으로 인한 일정 변경"
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  className="h-9 text-xs"
                />
              </div>

              {errorMessage && (
                <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg text-xs">
                  {errorMessage}
                </div>
              )}
            </div>
          )}

          <DialogFooter className="pt-2">
            <Button variant="outline" size="sm" onClick={() => setCancelUsageDialogOpen(false)} disabled={isSubmitting}>
              취소
            </Button>
            <Button
              size="sm"
              onClick={handleCancelUsageSubmit}
              disabled={isSubmitting}
              className="bg-amber-600 hover:bg-amber-700 text-white"
            >
              {isSubmitting ? '처리 중...' : '사용 취소 확인'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── 대체휴무 부여 취소 다이얼로그 ──────────────────────────────────── */}
      <Dialog open={cancelGrantDialogOpen} onOpenChange={setCancelGrantDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-rose-600">대체휴무 부여 취소 (원천 삭제)</DialogTitle>
            <DialogDescription>
              발행된 대체휴무 레코드를 취소합니다. 이미 사용된 경우 사용 취소 후 진행해야 합니다.
            </DialogDescription>
          </DialogHeader>

          {selectedRecord && (
            <div className="space-y-3 py-2 text-xs">
              <p className="text-muted-foreground">
                <span className="font-semibold text-foreground">{selectedRecord.fullName}</span>님의{' '}
                <span className="font-mono text-foreground font-semibold">{selectedRecord.sourceWorkDate}</span> 휴일근무에 부여된 대체휴무를 취소하시겠습니까?
              </p>

              <div>
                <label className="text-xs font-semibold block mb-1">취소 사유 (감사로그 기록)</label>
                <Input
                  type="text"
                  placeholder="예: 휴일근무 수당 지급으로 대체"
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  className="h-9 text-xs"
                />
              </div>

              {errorMessage && (
                <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg text-xs">
                  {errorMessage}
                </div>
              )}
            </div>
          )}

          <DialogFooter className="pt-2">
            <Button variant="outline" size="sm" onClick={() => setCancelGrantDialogOpen(false)} disabled={isSubmitting}>
              닫기
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={handleCancelGrantSubmit}
              disabled={isSubmitting}
            >
              {isSubmitting ? '처리 중...' : '대체휴무 부여 취소 확정'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
