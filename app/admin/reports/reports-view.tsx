'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  FileBarChart2,
  Download,
  Calendar,
  Filter,
  Users,
  CheckCircle2,
  AlertTriangle,
  Clock,
  CalendarOff,
  Briefcase,
  Search,
  ExternalLink,
  ChevronRight,
  TrendingUp,
  Building2,
  ShieldAlert,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EmployeeDrilldownDialog } from './employee-drilldown-dialog';
import type {
  AttendanceAnomaly,
  DepartmentMonthlySummary,
  EmployeeMonthlySummary,
  MonthlyReportKPI,
} from '@/lib/hr-types';
import { formatDuration } from '@/lib/hr-types';

interface ReportsViewProps {
  initialYear: number;
  initialMonth: number;
  initialDepartment: string;
  initialTab: 'OVERVIEW' | 'ANOMALIES';
  departments: string[];
  kpi: MonthlyReportKPI;
  employeeSummaries: EmployeeMonthlySummary[];
  departmentSummaries: DepartmentMonthlySummary[];
  anomalies: AttendanceAnomaly[];
}

export function ReportsView({
  initialYear,
  initialMonth,
  initialDepartment,
  initialTab,
  departments,
  kpi,
  employeeSummaries,
  departmentSummaries,
  anomalies,
}: ReportsViewProps) {
  const router = useRouter();

  const [year, setYear] = useState<number>(initialYear);
  const [month, setMonth] = useState<number>(initialMonth);
  const [department, setDepartment] = useState<string>(initialDepartment);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'OVERVIEW' | 'ANOMALIES'>(initialTab);

  // Drilldown dialog state
  const [drilldownEmpId, setDrilldownEmpId] = useState<string | null>(null);
  const [drilldownEmpName, setDrilldownEmpName] = useState<string | null>(null);
  const [isDrilldownOpen, setIsDrilldownOpen] = useState(false);

  // 조회 버튼 클릭
  const handleSearch = () => {
    router.push(`/admin/reports?year=${year}&month=${month}&department=${department}${activeTab === 'ANOMALIES' ? '&tab=anomalies' : ''}`);
  };

  // Excel 다운로드
  const handleDownloadExcel = () => {
    window.location.href = `/api/reports/excel?year=${year}&month=${month}&department=${department}`;
  };

  // 검색어 필터링된 직원 목록
  const filteredEmployees = employeeSummaries.filter((e) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.trim().toLowerCase();
    return (
      e.fullName.toLowerCase().includes(q) ||
      e.employeeNumber.toLowerCase().includes(q) ||
      e.department.toLowerCase().includes(q)
    );
  });

  const handleOpenDrilldown = (empId: string, empName: string) => {
    setDrilldownEmpId(empId);
    setDrilldownEmpName(empName);
    setIsDrilldownOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* ── 상단 헤더 & 필터 바 ────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl flex items-center gap-2.5">
            <FileBarChart2 className="size-7 text-primary" />
            통합 근태 리포트
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            전사 및 부서·직원별 월간 근태 현황, 이상데이터 탐지 및 월말 정산 데이터를 확인합니다.
          </p>
        </div>

        {/* Excel 다운로드 버튼 */}
        <div className="flex items-center gap-2">
          <Button
            onClick={handleDownloadExcel}
            className="text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
          >
            <Download className="size-4" />
            <span>월간 리포트 Excel 다운로드</span>
          </Button>
        </div>
      </div>

      {/* 필터 툴바 */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-3 shadow-sm text-xs">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-muted-foreground">조회 년도:</span>
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="rounded-lg border bg-background px-2.5 py-1.5 font-medium focus:outline-none"
          >
            {[2025, 2026, 2027].map((y) => (
              <option key={y} value={y}>
                {y}년
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <span className="font-semibold text-muted-foreground">조회 월:</span>
          <select
            value={month}
            onChange={(e) => setMonth(Number(e.target.value))}
            className="rounded-lg border bg-background px-2.5 py-1.5 font-medium focus:outline-none"
          >
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <option key={m} value={m}>
                {m}월
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <span className="font-semibold text-muted-foreground">부서:</span>
          <select
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
            className="rounded-lg border bg-background px-2.5 py-1.5 font-medium focus:outline-none"
          >
            <option value="ALL">전체 부서</option>
            {departments.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>

        <Button onClick={handleSearch} size="sm" className="h-8 text-xs gap-1">
          <Filter className="size-3.5" />
          조회
        </Button>

        {/* 탭 토글 */}
        <div className="ml-auto flex items-center gap-1 rounded-lg border bg-muted/40 p-1">
          <button
            type="button"
            onClick={() => setActiveTab('OVERVIEW')}
            className={`rounded-md px-3 py-1 font-semibold transition-all ${
              activeTab === 'OVERVIEW' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            종합 통계 현황
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('ANOMALIES')}
            className={`rounded-md px-3 py-1 font-semibold transition-all flex items-center gap-1.5 ${
              activeTab === 'ANOMALIES' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <span>확인 필요</span>
            {anomalies.length > 0 && (
              <Badge variant="destructive" className="h-4 px-1 text-[10px] rounded-full">
                {anomalies.length}
              </Badge>
            )}
          </button>
        </div>
      </div>

      {/* ── 탭 1: 종합 통계 현황 ──────────────────────────────────────── */}
      {activeTab === 'OVERVIEW' && (
        <div className="space-y-6">
          {/* 월간 핵심 KPI 카드 (Req 3, 4, 5, 6) */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <Card className="border-0 shadow-sm bg-gradient-to-br from-blue-50 to-white">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-blue-700">근무대상 인원</span>
                  <Users className="size-4 text-blue-500" />
                </div>
                <p className="mt-2 text-2xl font-bold">{kpi.activeEmployees}명</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  기준 근무일: {kpi.totalTargetWorkdays}일
                </p>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-sm bg-gradient-to-br from-emerald-50 to-white">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-emerald-700">정상 근무일수</span>
                  <CheckCircle2 className="size-4 text-emerald-500" />
                </div>
                <p className="mt-2 text-2xl font-bold">{kpi.normalDaysCount}일</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">지각·조퇴 없는 정상</p>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-sm bg-gradient-to-br from-rose-50 to-white">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-rose-700">지각 / 조퇴</span>
                  <AlertTriangle className="size-4 text-rose-500" />
                </div>
                <p className="mt-2 text-2xl font-bold">
                  {kpi.lateCount}회 <span className="text-base font-normal text-muted-foreground">/ {kpi.earlyLeaveCount}회</span>
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">5분 Grace 기준</p>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-sm bg-gradient-to-br from-purple-50 to-white">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-purple-700">연차 사용량</span>
                  <CalendarOff className="size-4 text-purple-500" />
                </div>
                <p className="mt-2 text-2xl font-bold">
                  {kpi.leaveDays}일
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  총 {kpi.leaveMinutes / 60}시간 (1일=8시간)
                </p>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-sm bg-gradient-to-br from-indigo-50 to-white">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-indigo-700">대체휴무 사용량</span>
                  <Briefcase className="size-4 text-indigo-500" />
                </div>
                <p className="mt-2 text-2xl font-bold">{kpi.compLeaveUsedDays}일</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">연차와 분리 집계</p>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-sm bg-gradient-to-br from-cyan-50 to-white">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-cyan-700">평일 연장근무</span>
                  <Clock className="size-4 text-cyan-500" />
                </div>
                <p className="mt-2 text-xl font-bold">{formatDuration(kpi.overtimeMinutes)}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">총 {kpi.overtimeMinutes}분</p>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-sm bg-gradient-to-br from-violet-50 to-white">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-violet-700">휴일근무 시간</span>
                  <TrendingUp className="size-4 text-violet-500" />
                </div>
                <p className="mt-2 text-xl font-bold">{formatDuration(kpi.holidayWorkMinutes)}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">총 {kpi.holidayWorkMinutes}분</p>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-sm bg-gradient-to-br from-amber-50 to-white">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-amber-700">결근 일수</span>
                  <AlertTriangle className="size-4 text-amber-500" />
                </div>
                <p className="mt-2 text-2xl font-bold">{kpi.absentCount}일</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">미출근 및 휴가 미등록</p>
              </CardContent>
            </Card>
          </div>

          {/* ── 부서별 Summary Table (Req 14) ─────────────────────────── */}
          <Card className="border-0 shadow-sm">
            <CardHeader className="py-3.5 px-5 border-b bg-muted/20">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <Building2 className="size-4 text-primary" />
                부서별 근태 요약
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader className="bg-muted/40">
                  <TableRow className="text-xs">
                    <TableHead>부서명</TableHead>
                    <TableHead className="text-center">인원</TableHead>
                    <TableHead className="text-center">총 근무대상일</TableHead>
                    <TableHead className="text-center text-emerald-700 font-semibold">정상</TableHead>
                    <TableHead className="text-center text-rose-600 font-semibold">지각</TableHead>
                    <TableHead className="text-center text-amber-600 font-semibold">조퇴</TableHead>
                    <TableHead className="text-center text-red-600 font-semibold">결근</TableHead>
                    <TableHead className="text-center text-purple-700 font-semibold">연차사용</TableHead>
                    <TableHead className="text-center text-indigo-700 font-semibold">대체휴무</TableHead>
                    <TableHead className="text-right text-cyan-700 font-semibold">평일연장</TableHead>
                    <TableHead className="text-right text-violet-700 font-semibold">휴일근무</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {departmentSummaries.map((d) => (
                    <TableRow key={d.department} className="text-xs">
                      <TableCell className="font-semibold">{d.department}</TableCell>
                      <TableCell className="text-center font-mono">{d.employeeCount}명</TableCell>
                      <TableCell className="text-center font-mono">{d.targetWorkdays}일</TableCell>
                      <TableCell className="text-center font-mono font-medium text-emerald-700">{d.normalDays}일</TableCell>
                      <TableCell className="text-center font-mono font-medium text-rose-600">{d.lateCount}회</TableCell>
                      <TableCell className="text-center font-mono font-medium text-amber-600">{d.earlyLeaveCount}회</TableCell>
                      <TableCell className="text-center font-mono font-medium text-red-600">{d.absentDays}일</TableCell>
                      <TableCell className="text-center font-mono font-medium text-purple-700">{d.leaveDays}일</TableCell>
                      <TableCell className="text-center font-mono font-medium text-indigo-700">{d.compLeaveUsedDays}일</TableCell>
                      <TableCell className="text-right font-mono font-medium text-cyan-700">{formatDuration(d.overtimeMinutes)}</TableCell>
                      <TableCell className="text-right font-mono font-medium text-violet-700">{formatDuration(d.holidayWorkMinutes)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* ── 직원별 Summary Table (Req 7, 8, 9, 10, 11, 12, 13, 16) ─── */}
          <Card className="border-0 shadow-sm">
            <CardHeader className="py-3.5 px-5 border-b bg-muted/20 flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <Users className="size-4 text-primary" />
                직원별 근태 요약 ({filteredEmployees.length}명)
              </CardTitle>
              <div className="relative w-48 sm:w-64">
                <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
                <Input
                  placeholder="사번, 성명 검색..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-8 pl-8 text-xs"
                />
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="bg-muted/40 sticky top-0 z-10">
                    <TableRow className="text-xs">
                      <TableHead className="w-24">사번</TableHead>
                      <TableHead className="w-28">성명</TableHead>
                      <TableHead className="w-24">부서</TableHead>
                      <TableHead className="w-20 text-center">근무대상일</TableHead>
                      <TableHead className="w-16 text-center text-emerald-700 font-semibold">정상</TableHead>
                      <TableHead className="w-16 text-center text-rose-600 font-semibold">지각</TableHead>
                      <TableHead className="w-16 text-center text-amber-600 font-semibold">조퇴</TableHead>
                      <TableHead className="w-16 text-center text-red-600 font-semibold">결근</TableHead>
                      <TableHead className="w-24 text-center text-purple-700 font-semibold">연차사용</TableHead>
                      <TableHead className="w-20 text-center text-indigo-700 font-semibold">대체휴무</TableHead>
                      <TableHead className="w-28 text-right text-cyan-700 font-semibold">평일연장</TableHead>
                      <TableHead className="w-28 text-right text-violet-700 font-semibold">휴일근무</TableHead>
                      <TableHead className="w-16 text-center">상세</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredEmployees.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={13} className="py-8 text-center text-xs text-muted-foreground">
                          조회된 직원이 없습니다.
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredEmployees.map((e) => (
                        <TableRow key={e.employeeId} className="text-xs hover:bg-muted/20">
                          <TableCell className="font-mono">{e.employeeNumber}</TableCell>
                          <TableCell>
                            <button
                              type="button"
                              onClick={() => handleOpenDrilldown(e.employeeId, e.fullName)}
                              className="font-semibold text-primary hover:underline flex items-center gap-1 text-left"
                            >
                              <span>{e.fullName}</span>
                              <ChevronRight className="size-3 opacity-60" />
                            </button>
                          </TableCell>
                          <TableCell className="text-muted-foreground">{e.department}</TableCell>
                          <TableCell className="text-center font-mono">{e.targetWorkdays}일</TableCell>
                          <TableCell className="text-center font-mono font-medium text-emerald-700">{e.normalDays}일</TableCell>
                          <TableCell className="text-center font-mono font-medium text-rose-600">{e.lateCount}회</TableCell>
                          <TableCell className="text-center font-mono font-medium text-amber-600">{e.earlyLeaveCount}회</TableCell>
                          <TableCell className="text-center font-mono font-medium text-red-600">{e.absentDays}일</TableCell>
                          <TableCell className="text-center font-mono font-medium text-purple-700">
                            {e.leaveDays > 0 ? `${e.leaveDays}일` : '-'}
                          </TableCell>
                          <TableCell className="text-center font-mono font-medium text-indigo-700">
                            {e.compLeaveUsedDays > 0 ? `${e.compLeaveUsedDays}일` : '-'}
                          </TableCell>
                          <TableCell className="text-right font-mono font-medium text-cyan-700">
                            {e.overtimeMinutes > 0 ? formatDuration(e.overtimeMinutes) : '-'}
                          </TableCell>
                          <TableCell className="text-right font-mono font-medium text-violet-700">
                            {e.holidayWorkMinutes > 0 ? formatDuration(e.holidayWorkMinutes) : '-'}
                          </TableCell>
                          <TableCell className="text-center">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleOpenDrilldown(e.employeeId, e.fullName)}
                              className="h-7 text-xs px-2 text-primary"
                            >
                              조회
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── 탭 2: 확인 필요 이상데이터 영역 (Req 17 ~ 21) ───────────────── */}
      {activeTab === 'ANOMALIES' && (
        <Card className="border-0 shadow-sm">
          <CardHeader className="py-4 px-5 border-b bg-muted/20">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base font-bold flex items-center gap-2">
                  <ShieldAlert className="size-5 text-amber-600" />
                  확인이 필요한 이상데이터 ({anomalies.length}건)
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-1">
                  자동 수정되지 않으며, 관리자가 내용을 확인 후 해당 관리 화면에서 직접 정정합니다.
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {anomalies.length === 0 ? (
              <div className="py-16 text-center text-xs text-muted-foreground">
                <CheckCircle2 className="size-8 text-emerald-600 mx-auto mb-2 opacity-80" />
                발견된 이상데이터가 없습니다. 모든 근태 데이터가 정상입니다.
              </div>
            ) : (
              <Table>
                <TableHeader className="bg-muted/40">
                  <TableRow className="text-xs">
                    <TableHead className="w-20 text-center">심각도</TableHead>
                    <TableHead className="w-24">일자</TableHead>
                    <TableHead className="w-24">사번</TableHead>
                    <TableHead className="w-24">성명</TableHead>
                    <TableHead className="w-24">부서</TableHead>
                    <TableHead>이상 사유 및 내용</TableHead>
                    <TableHead className="w-24 text-center">조치 바로가기</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {anomalies.map((a) => (
                    <TableRow key={a.id} className="text-xs">
                      <TableCell className="text-center">
                        <Badge
                          className={`text-[10px] px-1.5 py-0.5 ${
                            a.severity === 'ERROR'
                              ? 'bg-rose-100 text-rose-800 border-rose-300'
                              : a.severity === 'WARNING'
                              ? 'bg-amber-100 text-amber-800 border-amber-300'
                              : 'bg-blue-100 text-blue-800 border-blue-300'
                          }`}
                        >
                          {a.severity}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono">{a.date}</TableCell>
                      <TableCell className="font-semibold">{a.employeeNumber}</TableCell>
                      <TableCell>{a.fullName}</TableCell>
                      <TableCell className="text-muted-foreground">{a.department}</TableCell>
                      <TableCell className="font-medium text-slate-800">{a.message}</TableCell>
                      <TableCell className="text-center">
                        <a
                          href={a.linkUrl}
                          className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-[11px] font-semibold text-primary hover:bg-muted/50 transition-all shadow-sm"
                        >
                          <span>확인</span>
                          <ExternalLink className="size-3" />
                        </a>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {/* 직원 월간 상세 Drill-down 모달 */}
      <EmployeeDrilldownDialog
        employeeId={drilldownEmpId}
        employeeName={drilldownEmpName}
        year={year}
        month={month}
        isOpen={isDrilldownOpen}
        onClose={() => {
          setIsDrilldownOpen(false);
          setDrilldownEmpId(null);
        }}
      />
    </div>
  );
}
