'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  Calendar,
  Clock,
  Search,
  Filter,
  Users,
  CheckCircle2,
  AlertTriangle,
  CalendarOff,
  Edit2,
  RefreshCw,
  SlidersHorizontal,
  FileSpreadsheet,
  Download,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AttendanceEditDialog } from './attendance-edit-dialog';
import { ExcelImportModal } from './excel-import-modal';
import type { AttendanceListRow, AttendanceStatus, LeaveType } from '@/lib/hr-types';
import { formatTimeKST, minuteToTimeString, LEAVE_TYPE_META } from '@/lib/hr-types';

interface AttendanceAdminViewProps {
  initialRows: AttendanceListRow[];
  selectedFrom: string;
  selectedTo: string;
}

function renderStatusBadge(
  status: AttendanceStatus | null,
  isLate: boolean,
  isEarlyLeave: boolean,
  leaveType: LeaveType | null,
  checkInAt: string | null,
  isAbsent?: boolean,
  isNotClockedIn?: boolean,
  isWorkday?: boolean,
  dayName?: string | null,
  overtimeType?: string | null,
  reason?: string
) {
  if (leaveType) {
    const meta = LEAVE_TYPE_META[leaveType];
    return (
      <Badge className="bg-purple-100 text-purple-700 hover:bg-purple-100 border-purple-200">
        {meta?.label ?? '연차'}
      </Badge>
    );
  }

  if (status === 'HOLIDAY_WORK' || overtimeType === 'HOLIDAY_WORK') {
    return (
      <Badge className="bg-indigo-100 text-indigo-800 hover:bg-indigo-100 border-indigo-300 font-medium">
        휴일근무
      </Badge>
    );
  }

  if (status === 'OVERTIME' || overtimeType === 'OVERTIME') {
    return (
      <div className="flex flex-col gap-0.5">
        <div className="flex items-center gap-1">
          <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100 border-blue-300 font-medium">
            연장
          </Badge>
          {isLate && (
            <Badge variant="destructive" className="bg-rose-500 text-[10px] px-1 py-0">지각</Badge>
          )}
          {isEarlyLeave && (
            <Badge className="bg-amber-100 text-amber-800 border-amber-300 text-[10px] px-1 py-0">조퇴</Badge>
          )}
        </div>
        {!checkInAt && (
          <span className="text-[10px] text-amber-700 font-semibold flex items-center gap-0.5">
            ⚠️ 출퇴근 기록 없음
          </span>
        )}
      </div>
    );
  }

  if (isAbsent || status === 'ABSENT') {
    return (
      <Badge variant="destructive" className="bg-red-600">
        결근
      </Badge>
    );
  }

  if (isLate && isEarlyLeave) {
    return (
      <Badge variant="destructive" className="bg-rose-600">
        지각 · 조퇴
      </Badge>
    );
  }

  if (isLate || status === 'LATE') {
    return (
      <Badge variant="destructive" className="bg-rose-500 hover:bg-rose-600">
        지각
      </Badge>
    );
  }

  if (isEarlyLeave || status === 'EARLY_LEAVE') {
    return (
      <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 border-amber-300">
        조퇴
      </Badge>
    );
  }

  if (status === 'NORMAL') {
    return (
      <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 border-emerald-300">
        정상
      </Badge>
    );
  }

  if (isNotClockedIn) {
    return (
      <Badge variant="outline" className="text-muted-foreground border-dashed">
        미출근
      </Badge>
    );
  }

  if (isWorkday === false) {
    return (
      <Badge variant="outline" className="bg-muted text-muted-foreground">
        {dayName || '휴일'}
      </Badge>
    );
  }

  if (!checkInAt) {
    return (
      <Badge variant="outline" className="text-muted-foreground border-dashed">
        기록 없음
      </Badge>
    );
  }

  return <span className="text-muted-foreground text-xs">-</span>;
}

export function AttendanceAdminView({ initialRows, selectedFrom, selectedTo }: AttendanceAdminViewProps) {
  const router = useRouter();
  const [fromDate, setFromDate] = useState<string>(selectedFrom);
  const [toDate, setToDate] = useState<string>(selectedTo);
  const [searchQuery, setSearchQuery] = useState('');
  const [deptFilter, setDeptFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // 보정 모달 상태
  const [editingRow, setEditingRow] = useState<AttendanceListRow | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  // Excel 업로드 모달 상태 (Phase 8)
  const [isExcelModalOpen, setIsExcelModalOpen] = useState(false);

  const handlePeriodSearch = () => {
    if (!fromDate || !toDate) {
      window.alert('시작일과 종료일을 모두 선택해 주세요.');
      return;
    }
    if (fromDate > toDate) {
      window.alert('시작일은 종료일보다 늦을 수 없습니다.');
      return;
    }

    const days = Math.floor(
      (new Date(`${toDate}T00:00:00Z`).getTime() - new Date(`${fromDate}T00:00:00Z`).getTime())
        / 86_400_000
    ) + 1;
    if (days > 31) {
      window.alert('조회 기간은 최대 31일까지 선택할 수 있습니다.');
      return;
    }

    router.push(`/admin/attendance?from=${fromDate}&to=${toDate}`);
  };

  // 고유 부서 목록 추출
  const departments = useMemo(() => {
    const depts = new Set<string>();
    initialRows.forEach((r) => {
      if (r.department) depts.add(r.department);
    });
    return Array.from(depts);
  }, [initialRows]);

  // 필터링된 행
  const filteredRows = useMemo(() => {
    return initialRows.filter((r) => {
      // 1. 검색어 (이름 or 사번)
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const nameMatch = r.fullName.toLowerCase().includes(q);
        const numMatch = r.employeeNumber.toLowerCase().includes(q);
        if (!nameMatch && !numMatch) return false;
      }

      // 2. 부서 필터
      if (deptFilter !== 'ALL' && r.department !== deptFilter) {
        return false;
      }

      // 3. 상태 필터
      if (statusFilter !== 'ALL') {
        if (statusFilter === 'LEAVE' && !r.leaveType) return false;
        if (statusFilter === 'NORMAL' && (r.representativeStatus !== 'NORMAL' || r.leaveType)) return false;
        if (statusFilter === 'LATE' && (!r.isLate && r.representativeStatus !== 'LATE')) return false;
        if (statusFilter === 'EARLY_LEAVE' && (!r.isEarlyLeave && r.representativeStatus !== 'EARLY_LEAVE')) return false;
        if (statusFilter === 'ABSENT' && !r.isAbsent && r.representativeStatus !== 'ABSENT') return false;
        if (statusFilter === 'NOT_CLOCKED_IN' && !r.isNotClockedIn) return false;
      }

      return true;
    });
  }, [initialRows, searchQuery, deptFilter, statusFilter]);

  // 요약 통계
  const stats = useMemo(() => {
    let total = initialRows.length;
    let checkedIn = 0;
    let normal = 0;
    let late = 0;
    let earlyLeave = 0;
    let leave = 0;
    let absent = 0;
    let notClockedIn = 0;

    initialRows.forEach((r) => {
      if (r.leaveType) {
        leave++;
      } else if (r.checkInAt) {
        checkedIn++;
        if (r.isLate || r.representativeStatus === 'LATE') late++;
        else if (r.isEarlyLeave || r.representativeStatus === 'EARLY_LEAVE') earlyLeave++;
        else normal++;
      } else if (r.isAbsent || r.representativeStatus === 'ABSENT') {
        absent++;
      } else if (r.isNotClockedIn) {
        notClockedIn++;
      }
    });

    return { total, checkedIn, normal, late, earlyLeave, leave, absent, notClockedIn };
  }, [initialRows]);

  const handleEditClick = (row: AttendanceListRow) => {
    setEditingRow(row);
    setIsDialogOpen(true);
  };

  const handleEditSuccess = () => {
    router.refresh();
  };

  return (
    <div className="space-y-6">
      {/* 헤더 및 날짜 선택 */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">근태 관리</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            전체 직원의 일별 출퇴근 기록을 조회하고 이상 근태를 보정합니다.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 rounded-lg border bg-card px-3 py-1.5 shadow-sm">
            <Calendar className="size-4 shrink-0 text-muted-foreground" />
            <input
              type="date"
              value={fromDate}
              max={toDate}
              onChange={(e) => setFromDate(e.target.value)}
              aria-label="조회 시작일"
              className="min-w-0 bg-transparent text-sm font-semibold focus:outline-none"
            />
            <span className="text-xs text-muted-foreground">~</span>
            <input
              type="date"
              value={toDate}
              min={fromDate}
              onChange={(e) => setToDate(e.target.value)}
              aria-label="조회 종료일"
              className="min-w-0 bg-transparent text-sm font-semibold focus:outline-none"
            />
          </div>
          <Button
            type="button"
            size="sm"
            className="h-9 px-4"
            onClick={handlePeriodSearch}
          >
            조회
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="size-9"
            onClick={() => router.refresh()}
            title="새로고침"
          >
            <RefreshCw className="size-4" />
          </Button>

          <a
            href="/api/attendance/excel-template"
            download="attendance_import_template.xlsx"
            className="inline-flex items-center gap-1.5 rounded-lg border bg-card px-3 py-2 text-xs font-semibold shadow-sm hover:bg-muted/50 transition-all text-muted-foreground hover:text-foreground"
            title="표준 Excel 양식 다운로드"
          >
            <Download className="size-3.5 text-emerald-600" />
            <span className="hidden sm:inline">양식 다운로드</span>
          </a>

          <Button
            onClick={() => setIsExcelModalOpen(true)}
            className="text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
          >
            <FileSpreadsheet className="size-4" />
            <span>Excel 업로드</span>
          </Button>
        </div>
      </div>

      {/* 통계 요약 카드 */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">조회 건수</p>
            <p className="mt-1 text-2xl font-bold">{stats.total}건</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">정상 출근</p>
            <p className="mt-1 text-2xl font-bold text-emerald-600">{stats.normal}건</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">지각</p>
            <p className="mt-1 text-2xl font-bold text-rose-600">{stats.late}건</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">조퇴</p>
            <p className="mt-1 text-2xl font-bold text-amber-600">{stats.earlyLeave}건</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">연차 사용</p>
            <p className="mt-1 text-2xl font-bold text-purple-600">{stats.leave}건</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">미출근/결근</p>
            <p className="mt-1 text-2xl font-bold text-slate-500">{stats.absent + stats.notClockedIn}건</p>
          </CardContent>
        </Card>
      </div>

      {/* 필터 및 검색 바 */}
      <div className="flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-wrap items-center gap-3">
          {/* 검색창 */}
          <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="이름 또는 사번 검색"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 text-sm"
            />
          </div>

          {/* 부서 선택 */}
          <select
            value={deptFilter}
            onChange={(e) => setDeptFilter(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="ALL">전체 부서</option>
            {departments.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>

          {/* 상태 선택 */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="ALL">전체 상태</option>
            <option value="NORMAL">정상출근</option>
            <option value="LATE">지각</option>
            <option value="EARLY_LEAVE">조퇴</option>
            <option value="LEAVE">연차</option>
            <option value="ABSENT">미출근</option>
          </select>
        </div>

        <div className="text-xs text-muted-foreground text-right">
          조회 결과: <span className="font-semibold text-foreground">{filteredRows.length}</span>건
        </div>
      </div>

      {/* 근태 테이블 */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-0">
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead className="w-[110px]">근무일자</TableHead>
                  <TableHead className="w-[150px]">사원명 / 사번</TableHead>
                  <TableHead className="w-[130px]">부서</TableHead>
                  <TableHead className="w-[140px]">개인 기준시간</TableHead>
                  <TableHead className="w-[120px]">실제 출근</TableHead>
                  <TableHead className="w-[120px]">실제 퇴근</TableHead>
                  <TableHead className="w-[120px]">판정 상태</TableHead>
                  <TableHead className="w-[110px]">등록 구분</TableHead>
                  <TableHead className="text-right w-[100px]">관리</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="py-12 text-center text-muted-foreground">
                      조건에 일치하는 사원 근태 기록이 없습니다.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredRows.map((row) => (
                    <TableRow key={`${row.workDate}-${row.employeeId}`}>
                      <TableCell className="whitespace-nowrap font-mono text-xs font-medium">
                        {row.workDate}
                      </TableCell>
                      <TableCell>
                        <div className="font-semibold text-sm">{row.fullName}</div>
                        <div className="text-xs text-muted-foreground font-mono">{row.employeeNumber}</div>
                      </TableCell>
                      <TableCell className="text-sm">{row.department}</TableCell>
                      <TableCell className="text-xs text-muted-foreground font-mono">
                        {minuteToTimeString(row.standardStartMinute)} ~ {minuteToTimeString(row.standardEndMinute)}
                      </TableCell>
                      <TableCell>
                        {row.checkInAt ? (
                          <span className="font-mono text-sm font-medium">{formatTimeKST(row.checkInAt)}</span>
                        ) : (
                          <span className="text-muted-foreground text-xs">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {row.checkOutAt ? (
                          <span className="font-mono text-sm font-medium">{formatTimeKST(row.checkOutAt)}</span>
                        ) : (
                          <span className="text-muted-foreground text-xs">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {renderStatusBadge(
                          row.representativeStatus,
                          row.isLate,
                          row.isEarlyLeave,
                          row.leaveType,
                          row.checkInAt,
                          row.isAbsent,
                          row.isNotClockedIn,
                          row.isWorkday,
                          row.dayName,
                          row.overtimeType,
                          row.reason
                        )}
                      </TableCell>
                      <TableCell>
                        {row.source === 'ADMIN_EDIT' ? (
                          <span className="text-[11px] text-amber-700 bg-amber-50 px-2 py-0.5 rounded font-medium">
                            관리자 보정
                          </span>
                        ) : row.source === 'WEB' ? (
                          <span className="text-[11px] text-muted-foreground">웹</span>
                        ) : (
                          <span className="text-xs text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEditClick(row)}
                          className="h-8 gap-1 text-xs"
                        >
                          <Edit2 className="size-3.5" />
                          보정
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* 모바일 리스트 */}
          <div className="divide-y md:hidden">
            {filteredRows.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                조회된 근태 기록이 없습니다.
              </div>
            ) : (
              filteredRows.map((row) => (
                <div key={`${row.workDate}-${row.employeeId}`} className="p-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="mb-1 font-mono text-xs font-semibold text-primary">{row.workDate}</div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm">{row.fullName}</span>
                        <span className="text-xs text-muted-foreground font-mono">({row.employeeNumber})</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {row.department} · 기준 {minuteToTimeString(row.standardStartMinute)}~{minuteToTimeString(row.standardEndMinute)}
                      </p>
                    </div>
                    {renderStatusBadge(
                      row.representativeStatus,
                      row.isLate,
                      row.isEarlyLeave,
                      row.leaveType,
                      row.checkInAt,
                      row.isAbsent,
                      row.isNotClockedIn,
                      row.isWorkday,
                      row.dayName,
                      row.overtimeType,
                      row.reason
                    )}
                  </div>

                  <div className="flex items-center justify-between rounded-lg bg-muted/40 p-2.5 text-xs">
                    <div>
                      <span className="text-muted-foreground">출근: </span>
                      <span className="font-mono font-medium">
                        {row.checkInAt ? formatTimeKST(row.checkInAt) : '-'}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">퇴근: </span>
                      <span className="font-mono font-medium">
                        {row.checkOutAt ? formatTimeKST(row.checkOutAt) : '-'}
                      </span>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleEditClick(row)}
                      className="h-7 text-xs px-2"
                    >
                      <Edit2 className="size-3 mr-1" />
                      보정
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* 보정 모달 */}
      <AttendanceEditDialog
        row={editingRow}
        isOpen={isDialogOpen}
        onClose={() => {
          setIsDialogOpen(false);
          setEditingRow(null);
        }}
        onSuccess={handleEditSuccess}
      />

      {/* Excel 일괄 업로드 모달 (Phase 8) */}
      <ExcelImportModal
        isOpen={isExcelModalOpen}
        onClose={() => setIsExcelModalOpen(false)}
        onSuccess={() => router.refresh()}
      />
    </div>
  );
}
