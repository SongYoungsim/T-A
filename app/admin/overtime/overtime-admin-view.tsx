'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  Clock,
  Calendar,
  Filter,
  Search,
  Plus,
  Edit2,
  CalendarDays,
  Users,
  Briefcase,
  ChevronLeft,
  ChevronRight,
  Gift,
  CheckCircle2,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { OvertimeDialog } from './overtime-dialog';
import type { EmployeeRecord, OvertimeRecord, OvertimeSummary, WorkType } from '@/lib/hr-types';
import { WORK_TYPE_META, formatDuration } from '@/lib/hr-types';

interface OvertimeAdminViewProps {
  initialRecords: OvertimeRecord[];
  initialSummary: OvertimeSummary;
  year: number;
  month: number;
  employees: EmployeeRecord[];
}

export function OvertimeAdminView({
  initialRecords,
  initialSummary,
  year,
  month,
  employees,
}: OvertimeAdminViewProps) {
  const router = useRouter();

  const [records, setRecords] = useState<OvertimeRecord[]>(initialRecords);
  const [summary, setSummary] = useState<OvertimeSummary>(initialSummary);

  // 필터 상태 (Requirement 21)
  const [employeeFilter, setEmployeeFilter] = useState('ALL');
  const [deptFilter, setDeptFilter] = useState('ALL');
  const [workTypeFilter, setWorkTypeFilter] = useState<'ALL' | WorkType>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // 다이얼로그 상태
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<OvertimeRecord | null>(null);

  // 부서 목록
  const departments = useMemo(() => {
    const set = new Set<string>();
    employees.forEach((e) => {
      if (e.department) set.add(e.department);
    });
    return Array.from(set).sort();
  }, [employees]);

  // 클라이언트 필터링
  const filteredRecords = useMemo(() => {
    return records.filter((r) => {
      if (employeeFilter !== 'ALL' && r.employeeId !== employeeFilter) return false;
      if (deptFilter !== 'ALL' && r.department !== deptFilter) return false;
      if (workTypeFilter !== 'ALL' && r.workType !== workTypeFilter) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchName = (r.fullName ?? '').toLowerCase().includes(q);
        const matchNum = (r.employeeNumber ?? '').toLowerCase().includes(q);
        const matchDesc = (r.description ?? r.workDescription ?? '').toLowerCase().includes(q);
        if (!matchName && !matchNum && !matchDesc) return false;
      }

      return true;
    });
  }, [records, employeeFilter, deptFilter, workTypeFilter, searchQuery]);

  // 연월 변경
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
    router.push(`/admin/overtime?year=${nextY}&month=${nextM}`);
  };

  // 등록 및 수정 완료 후 리프레시
  const handleSuccess = () => {
    router.refresh();
    fetch(`/api/overtime?year=${year}&month=${month}`)
      .then((res) => res.json())
      .then((data: any) => {
        if (data.ok) {
          setRecords(data.records);
          setSummary(data.summary);
        }
      });
  };

  return (
    <div className="space-y-6">
      {/* 상단 헤더 */}
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">연장근무 관리</h1>
          <p className="mt-1 text-xs sm:text-sm text-muted-foreground">
            평일 연장근무와 휴일근무를 통합하여 분 단위로 정밀하게 관리합니다.
          </p>
        </div>
        <Button
          onClick={() => {
            setSelectedRecord(null);
            setIsDialogOpen(true);
          }}
          className="gap-1.5 bg-blue-600 hover:bg-blue-700 shadow-sm self-start sm:self-auto"
          size="sm"
        >
          <Plus className="size-4" />
          연장근무 등록
        </Button>
      </div>

      {/* 월간 Summary 카드 (Requirement 30) */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="border-0 shadow-sm bg-blue-50/60 border border-blue-100">
          <CardHeader className="p-4 pb-1">
            <CardTitle className="text-xs font-semibold text-blue-900 flex items-center justify-between">
              <span>평일연장 총시간</span>
              <Clock className="size-4 text-blue-600" />
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-1">
            <p className="text-xl font-bold text-blue-950 font-mono">
              {formatDuration(summary.overtimeMinutes)}
            </p>
            <p className="text-[11px] text-blue-700 mt-0.5">
              등록: <span className="font-semibold">{summary.overtimeCount}</span>건
            </p>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm bg-indigo-50/60 border border-indigo-100">
          <CardHeader className="p-4 pb-1">
            <CardTitle className="text-xs font-semibold text-indigo-900 flex items-center justify-between">
              <span>휴일근무 총시간</span>
              <CalendarDays className="size-4 text-indigo-600" />
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-1">
            <p className="text-xl font-bold text-indigo-950 font-mono">
              {formatDuration(summary.holidayWorkMinutes)}
            </p>
            <p className="text-[11px] text-indigo-700 mt-0.5">
              등록: <span className="font-semibold">{summary.holidayWorkCount}</span>건
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
              총 <span className="font-semibold">{summary.overtimeCount + summary.holidayWorkCount}</span>건 등록됨
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
              Phase 7 연계 준비 건수
            </p>
          </CardContent>
        </Card>
      </div>

      {/* 필터 및 검색 바 (Requirement 21) */}
      <div className="space-y-3 rounded-xl border bg-card p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* 월 네비게이션 */}
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="icon"
              className="size-8"
              onClick={() => handleMonthChange(-1)}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <span className="text-sm font-bold px-2 min-w-[100px] text-center font-mono">
              {year}년 {month}월
            </span>
            <Button
              variant="outline"
              size="icon"
              className="size-8"
              onClick={() => handleMonthChange(1)}
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>

          {/* 검색창 */}
          <div className="relative flex-1 min-w-[180px] max-w-xs">
            <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="사원명, 사번, 업무내용 검색"
              className="pl-8 text-xs h-9"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-1 border-t">
          {/* 근무구분 필터 */}
          <select
            value={workTypeFilter}
            onChange={(e) => setWorkTypeFilter(e.target.value as any)}
            className="h-8 rounded-md border border-input bg-background px-2.5 text-xs shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="ALL">전체 근무구분</option>
            <option value="OVERTIME">평일연장</option>
            <option value="HOLIDAY_WORK">휴일근무</option>
          </select>

          {/* 부서 필터 */}
          <select
            value={deptFilter}
            onChange={(e) => setDeptFilter(e.target.value)}
            className="h-8 rounded-md border border-input bg-background px-2.5 text-xs shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="ALL">전체 부서</option>
            {departments.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>

          {/* 직원 필터 */}
          <select
            value={employeeFilter}
            onChange={(e) => setEmployeeFilter(e.target.value)}
            className="h-8 rounded-md border border-input bg-background px-2.5 text-xs shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="ALL">전체 직원</option>
            {employees.map((emp) => (
              <option key={emp.id} value={emp.id}>
                {emp.fullName} ({emp.employeeNumber})
              </option>
            ))}
          </select>

          <span className="text-xs text-muted-foreground ml-auto">
            조회 결과: <span className="font-semibold text-foreground">{filteredRecords.length}</span>건
          </span>
        </div>
      </div>

      {/* 데스크톱 테이블 (Requirement 22) */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-0">
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead className="w-[110px]">근무일자</TableHead>
                  <TableHead className="w-[100px]">사번</TableHead>
                  <TableHead className="w-[120px]">성명</TableHead>
                  <TableHead className="w-[110px]">부서</TableHead>
                  <TableHead className="w-[110px]">근무구분</TableHead>
                  <TableHead className="w-[90px]">시작</TableHead>
                  <TableHead className="w-[90px]">종료</TableHead>
                  <TableHead className="w-[120px]">근무시간</TableHead>
                  <TableHead>업무내용</TableHead>
                  <TableHead className="w-[110px] text-center">대체휴무</TableHead>
                  <TableHead className="w-[80px] text-right">관리</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRecords.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={11} className="py-12 text-center text-muted-foreground text-sm">
                      등록된 연장근무 기록이 없습니다.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredRecords.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono text-xs font-medium">{r.workDate}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{r.employeeNumber}</TableCell>
                      <TableCell className="text-xs font-semibold">{r.fullName}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{r.department}</TableCell>
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
                      <TableCell className="font-mono text-xs font-semibold text-blue-950">
                        {formatDuration(r.durationMinutes ?? r.actualMinutes ?? 0)}
                      </TableCell>
                      <TableCell className="text-xs max-w-xs truncate" title={r.description ?? r.workDescription}>
                        {r.description ?? r.workDescription}
                      </TableCell>
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
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setSelectedRecord(r);
                            setIsDialogOpen(true);
                          }}
                          className="h-8 gap-1 text-xs"
                        >
                          <Edit2 className="size-3.5" />
                          수정
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* 모바일 카드 목록 (Requirement 23) */}
          <div className="divide-y md:hidden">
            {filteredRecords.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                등록된 연장근무 기록이 없습니다.
              </div>
            ) : (
              filteredRecords.map((r) => (
                <div key={r.id} className="p-4 space-y-2.5">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-sm">{r.fullName}</span>
                        <span className="text-xs text-muted-foreground font-mono">({r.employeeNumber})</span>
                        <span className="text-xs text-muted-foreground">· {r.department}</span>
                      </div>
                      <p className="text-xs text-muted-foreground font-mono mt-0.5">{r.workDate}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Badge
                        className={
                          r.workType === 'HOLIDAY_WORK'
                            ? 'bg-indigo-100 text-indigo-800 hover:bg-indigo-100 border-indigo-300'
                            : 'bg-blue-100 text-blue-800 hover:bg-blue-100 border-blue-300'
                        }
                      >
                        {WORK_TYPE_META[r.workType].label}
                      </Badge>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setSelectedRecord(r);
                          setIsDialogOpen(true);
                        }}
                        className="h-7 px-2 text-xs"
                      >
                        <Edit2 className="size-3" />
                      </Button>
                    </div>
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

      {/* 등록 및 수정 다이얼로그 */}
      <OvertimeDialog
        isOpen={isDialogOpen}
        onClose={() => setIsDialogOpen(false)}
        onSuccess={handleSuccess}
        record={selectedRecord}
        employees={employees}
      />
    </div>
  );
}
