'use client';

import React, { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ShieldCheck,
  Search,
  Filter,
  RefreshCw,
  Calendar,
  ChevronLeft,
  ChevronRight,
  FileText,
  User,
  SlidersHorizontal,
  Info,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AuditDetailDialog } from './audit-detail-dialog';
import type { AuditLogPaginatedResult, AuditLogQueryItem } from '@/lib/hr-types';

interface AuditLogsViewProps {
  initialData: AuditLogPaginatedResult;
  initialFilters: {
    startDate?: string;
    endDate?: string;
    entityType?: string;
    action?: string;
    searchQuery?: string;
    actorSearch?: string;
  };
}

const FEATURE_OPTIONS = [
  { value: 'ALL', label: '전체 기능' },
  { value: 'EMPLOYEE', label: '사원관리' },
  { value: 'ATTENDANCE', label: '출퇴근/근태관리' },
  { value: 'ANNUAL_LEAVE', label: '연차관리' },
  { value: 'COMPENSATORY_LEAVE', label: '대체휴무' },
  { value: 'OVERTIME_WORK', label: '연장/휴일근무' },
  { value: 'WORK_CALENDAR', label: '근무일캘린더' },
  { value: 'EXCEL_IMPORT', label: '엑셀일괄등록' },
];

export function AuditLogsView({ initialData, initialFilters }: AuditLogsViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // 필터 상태
  const [startDate, setStartDate] = useState(initialFilters.startDate || '');
  const [endDate, setEndDate] = useState(initialFilters.endDate || '');
  const [entityType, setEntityType] = useState(initialFilters.entityType || 'ALL');
  const [searchQuery, setSearchQuery] = useState(initialFilters.searchQuery || '');
  const [actorSearch, setActorSearch] = useState(initialFilters.actorSearch || '');

  // 상세 모달 상태
  const [selectedLog, setSelectedLog] = useState<AuditLogQueryItem | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  // 필터 적용 핸들러
  const handleApplyFilter = (pageNumber = 1) => {
    const params = new URLSearchParams();
    if (startDate) params.set('startDate', startDate);
    if (endDate) params.set('endDate', endDate);
    if (entityType && entityType !== 'ALL') params.set('entityType', entityType);
    if (searchQuery.trim()) params.set('searchQuery', searchQuery.trim());
    if (actorSearch.trim()) params.set('actorSearch', actorSearch.trim());
    params.set('page', String(pageNumber));
    params.set('pageSize', String(initialData.pageSize || 30));

    router.push(`/admin/audit-logs?${params.toString()}`);
  };

  const handleResetFilter = () => {
    setStartDate('');
    setEndDate('');
    setEntityType('ALL');
    setSearchQuery('');
    setActorSearch('');
    router.push('/admin/audit-logs?page=1&pageSize=30');
  };

  const handlePageChange = (newPage: number) => {
    if (newPage < 1 || newPage > initialData.totalPages) return;
    handleApplyFilter(newPage);
  };

  const openDetail = (log: AuditLogQueryItem) => {
    setSelectedLog(log);
    setDetailOpen(true);
  };

  const formatDateTime = (isoStr: string) => {
    try {
      const d = new Date(isoStr);
      return d.toLocaleString('ko-KR', {
        timeZone: 'Asia/Seoul',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
    } catch {
      return isoStr;
    }
  };

  return (
    <div className="space-y-6">
      {/* 상단 타이틀 */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <ShieldCheck className="h-7 w-7 text-indigo-600" />
            감사로그 통합 조회
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            사원정보, 근태, 연차, 대체휴무, 캘린더, 엑셀 등록 등 시스템의 모든 데이터 변경 이력을 조회합니다. (조회 전용)
          </p>
        </div>
      </div>

      {/* 필터 및 검색 바 */}
      <Card className="shadow-sm border-muted">
        <CardContent className="p-4 sm:p-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {/* 시작일 */}
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">시작일</label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="h-9 text-xs"
              />
            </div>

            {/* 종료일 */}
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">종료일</label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="h-9 text-xs"
              />
            </div>

            {/* 기능 선택 */}
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">기능</label>
              <select
                value={entityType}
                onChange={(e) => setEntityType(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                {FEATURE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* 대상 직원 검색 */}
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">
                대상 사번 / 성명
              </label>
              <Input
                type="text"
                placeholder="홍길동 or EMP002"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleApplyFilter(1)}
                className="h-9 text-xs"
              />
            </div>

            {/* 처리자 검색 */}
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">
                처리자 (관리자)
              </label>
              <Input
                type="text"
                placeholder="처리자 성명"
                value={actorSearch}
                onChange={(e) => setActorSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleApplyFilter(1)}
                className="h-9 text-xs"
              />
            </div>

            {/* 필터 버튼 */}
            <div className="flex items-end gap-2">
              <Button
                onClick={() => handleApplyFilter(1)}
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
                className="h-9 text-xs gap-1"
                title="필터 초기화"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 안내 배너 */}
      <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg text-xs text-muted-foreground border">
        <Info className="h-4 w-4 shrink-0 text-indigo-500" />
        <span>
          감사로그는 데이터 무결성을 위해 일체 수정/삭제가 불가능하며, 비밀번호·해시·세션 등 민감정보는 사전에 마스킹 처리되어 안전하게 보관·표시됩니다.
        </span>
      </div>

      {/* 결과 수 안내 */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <div>
          총 <span className="font-semibold text-foreground">{initialData.totalCount.toLocaleString()}</span>건의
          감사 기록 (페이지 {initialData.page} / {initialData.totalPages})
        </div>
      </div>

      {/* ─── 1. Desktop Table View (md 이상) ─────────────────────────────────── */}
      <div className="hidden md:block">
        <Card className="shadow-sm">
          <Table>
            <TableHeader className="bg-muted/40">
              <TableRow>
                <TableHead className="w-[120px] text-xs">일시</TableHead>
                <TableHead className="w-[110px] text-xs">처리자</TableHead>
                <TableHead className="w-[120px] text-xs">기능</TableHead>
                <TableHead className="w-[110px] text-xs">작업</TableHead>
                <TableHead className="w-[140px] text-xs">대상자 (일자)</TableHead>
                <TableHead className="text-xs">변경 요약</TableHead>
                <TableHead className="w-[160px] text-xs">사유</TableHead>
                <TableHead className="w-[80px] text-center text-xs">상세</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {initialData.logs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="h-40 text-center text-muted-foreground text-sm">
                    조건에 해당하는 감사로그가 없습니다.
                  </TableCell>
                </TableRow>
              ) : (
                initialData.logs.map((log) => (
                  <TableRow key={log.id} className="hover:bg-muted/30">
                    <TableCell className="text-xs font-mono text-muted-foreground whitespace-nowrap">
                      {formatDateTime(log.createdAt)}
                    </TableCell>
                    <TableCell className="text-xs font-medium">
                      <div>{log.actorName}</div>
                      {log.actorEmployeeNumber && (
                        <div className="text-[10px] text-muted-foreground">
                          {log.actorEmployeeNumber}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[11px] font-normal">
                        {log.feature}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="text-[11px] font-medium">
                        {log.actionLabel}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">
                      {log.targetEmployeeName ? (
                        <div>
                          <span className="font-semibold">{log.targetEmployeeName}</span>
                          {log.targetEmployeeNumber && (
                            <span className="text-muted-foreground ml-1">
                              ({log.targetEmployeeNumber})
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                      {log.targetDate && (
                        <div className="text-[10px] text-indigo-600 dark:text-indigo-400 font-mono">
                          {log.targetDate}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-xs max-w-xs">
                      <div className="truncate text-muted-foreground" title={log.afterSummary || log.beforeSummary || ''}>
                        {log.afterSummary || log.beforeSummary || '-'}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[150px]">
                      <div className="truncate" title={log.reason || ''}>
                        {log.reason || '-'}
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() => openDetail(log)}
                      >
                        상세
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Card>
      </div>

      {/* ─── 2. Mobile Card/List View (md 미만) ───────────────────────────────── */}
      <div className="md:hidden space-y-3">
        {initialData.logs.length === 0 ? (
          <Card className="p-8 text-center text-muted-foreground text-sm">
            조건에 해당하는 감사로그가 없습니다.
          </Card>
        ) : (
          initialData.logs.map((log) => (
            <Card key={log.id} className="p-4 shadow-sm space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono text-muted-foreground">
                  {formatDateTime(log.createdAt)}
                </span>
                <div className="flex items-center gap-1.5">
                  <Badge variant="outline" className="text-[10px]">
                    {log.feature}
                  </Badge>
                  <Badge variant="secondary" className="text-[10px]">
                    {log.actionLabel}
                  </Badge>
                </div>
              </div>

              <div className="text-sm font-medium flex items-center justify-between">
                <div>
                  <span className="text-xs text-muted-foreground mr-1">대상:</span>
                  {log.targetEmployeeName ? (
                    <span className="font-semibold">
                      {log.targetEmployeeName} ({log.targetEmployeeNumber})
                    </span>
                  ) : (
                    <span className="text-muted-foreground">-</span>
                  )}
                  {log.targetDate && <span className="text-xs text-indigo-600 ml-1.5">• {log.targetDate}</span>}
                </div>
                <div className="text-xs text-muted-foreground">
                  처리자: {log.actorName}
                </div>
              </div>

              <div className="text-xs bg-muted/50 p-2 rounded text-muted-foreground line-clamp-2">
                {log.afterSummary || log.beforeSummary || '변경 내용 요약 없음'}
              </div>

              {log.reason && (
                <div className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">사유:</span> {log.reason}
                </div>
              )}

              <div className="pt-1 flex justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs w-full"
                  onClick={() => openDetail(log)}
                >
                  상세 Before / After 확인
                </Button>
              </div>
            </Card>
          ))
        )}
      </div>

      {/* 페이지네이션 컨트롤 */}
      {initialData.totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <Button
            variant="outline"
            size="sm"
            className="h-8 px-2 text-xs"
            disabled={initialData.page <= 1}
            onClick={() => handlePageChange(initialData.page - 1)}
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            이전
          </Button>

          <div className="text-xs font-medium text-muted-foreground px-2">
            {initialData.page} / {initialData.totalPages}
          </div>

          <Button
            variant="outline"
            size="sm"
            className="h-8 px-2 text-xs"
            disabled={initialData.page >= initialData.totalPages}
            onClick={() => handlePageChange(initialData.page + 1)}
          >
            다음
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      )}

      {/* 상세 모달 다이얼로그 */}
      <AuditDetailDialog
        log={selectedLog}
        open={detailOpen}
        onOpenChange={setDetailOpen}
      />
    </div>
  );
}
