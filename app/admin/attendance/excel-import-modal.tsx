'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Upload,
  FileSpreadsheet,
  Download,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  HelpCircle,
  History,
  RotateCcw,
  Check,
  ArrowRight,
  ShieldAlert,
  Loader2,
  FileText,
  Search,
} from 'lucide-react';
import type {
  AttendanceImportBatchRecord,
  ExcelAttendanceCommitResult,
  ExcelAttendancePreviewRow,
  ExcelAttendancePreviewSummary,
  ExcelAttendanceRowStatus,
  ExcelConflictResolution,
} from '@/lib/hr-types';

interface ExcelImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

type TabType = 'IMPORT' | 'HISTORY';

export function ExcelImportModal({ isOpen, onClose, onSuccess }: ExcelImportModalProps) {
  const [activeTab, setActiveTab] = useState<TabType>('IMPORT');

  // STEP 관리: 1 (파일선택) -> 2 (미리보기) -> 3 (결과보고)
  const [step, setStep] = useState<1 | 2 | 3>(1);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // 미리보기 데이터
  const [fileName, setFileName] = useState<string>('');
  const [fileSizeBytes, setFileSizeBytes] = useState<number>(0);
  const [summary, setSummary] = useState<ExcelAttendancePreviewSummary | null>(null);
  const [previewRows, setPreviewRows] = useState<ExcelAttendancePreviewRow[]>([]);

  // 필터 및 검색
  const [statusFilter, setStatusFilter] = useState<'ALL' | ExcelAttendanceRowStatus>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Commit 확인 모달
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);

  // Commit 최종 결과
  const [commitResult, setCommitResult] = useState<ExcelAttendanceCommitResult | null>(null);

  // 이력 목록
  const [historyList, setHistoryList] = useState<AttendanceImportBatchRecord[]>([]);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // 모달 닫힐 때 초기화
  const handleDialogChange = (open: boolean) => {
    if (!open) {
      onClose();
    }
  };

  // 모달 오픈 시 리셋
  useEffect(() => {
    if (isOpen) {
      setStep(1);
      setSelectedFile(null);
      setErrorMessage(null);
      setSummary(null);
      setPreviewRows([]);
      setCommitResult(null);
      setStatusFilter('ALL');
      setSearchQuery('');
      if (activeTab === 'HISTORY') {
        loadHistory();
      }
    }
  }, [isOpen, activeTab]);

  const loadHistory = async () => {
    setIsHistoryLoading(true);
    try {
      const res = await fetch('/api/attendance/excel-history');
      const data = (await res.json()) as any;
      if (res.ok && data.batches) {
        setHistoryList(data.batches);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsHistoryLoading(false);
    }
  };

  // 1. 파일 선택 및 업로드
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.xlsx')) {
      setErrorMessage('지원되지 않는 파일 형식입니다. .xlsx 파일만 업로드할 수 있습니다.');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setErrorMessage('파일 크기가 5MB를 초과했습니다.');
      return;
    }

    setSelectedFile(file);
    setErrorMessage(null);
    await uploadAndPreview(file);
  };

  const uploadAndPreview = async (file: File) => {
    setIsLoading(true);
    setErrorMessage(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/attendance/excel-preview', {
        method: 'POST',
        body: formData,
      });

      const data = (await res.json()) as any;
      if (!res.ok) {
        setErrorMessage(data.error || 'Excel 파일을 분석하는 데 실패했습니다.');
        return;
      }

      setFileName(data.fileName);
      setFileSizeBytes(data.fileSizeBytes);
      setSummary(data.summary);
      setPreviewRows(data.rows);
      setStep(2);
    } catch (err) {
      console.error(err);
      setErrorMessage('서버와 통신 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  // 2. 충돌 처리방식 개별 변경
  const handleRowResolutionChange = (rowNumber: number, resolution: ExcelConflictResolution) => {
    setPreviewRows((prev) =>
      prev.map((r) => (r.rowNumber === rowNumber ? { ...r, resolution } : r))
    );
  };

  // 3. 충돌 처리방식 일괄 변경
  const handleBatchResolutionChange = (resolution: ExcelConflictResolution) => {
    if (resolution === 'OVERWRITE_EXCEL') {
      const conflictCount = previewRows.filter((r) => r.status === 'CONFLICT').length;
      if (
        !window.confirm(
          `기존 근태기록 ${conflictCount}건을 Excel 데이터로 변경합니다. 계속하시겠습니까?`
        )
      ) {
        return;
      }
    }
    setPreviewRows((prev) =>
      prev.map((r) => (r.status === 'CONFLICT' ? { ...r, resolution } : r))
    );
  };

  // 4. 필터링된 행 목록
  const filteredRows = useMemo(() => {
    return previewRows.filter((r) => {
      if (statusFilter !== 'ALL' && r.status !== statusFilter) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const empNo = r.employeeNumber.toLowerCase();
        const name = (r.employeeName || r.dbEmployeeName || '').toLowerCase();
        const dept = (r.department || '').toLowerCase();
        if (!empNo.includes(q) && !name.includes(q) && !dept.includes(q)) {
          return false;
        }
      }
      return true;
    });
  }, [previewRows, statusFilter, searchQuery]);

  // 5. Commit 대상 계산
  const commitEligibleRows = useMemo(() => {
    return previewRows.filter(
      (r) =>
        r.status !== 'ERROR' &&
        r.status !== 'SAME' &&
        (r.status === 'NEW' || r.status === 'WARNING' || (r.status === 'CONFLICT' && r.resolution === 'OVERWRITE_EXCEL'))
    );
  }, [previewRows]);

  const commitKeepRowsCount = useMemo(() => {
    return previewRows.filter((r) => r.status === 'CONFLICT' && r.resolution === 'KEEP_EXISTING').length;
  }, [previewRows]);

  // 6. 오류 목록 다운로드
  const handleDownloadErrors = async () => {
    try {
      const res = await fetch('/api/attendance/excel-errors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: previewRows }),
      });
      if (!res.ok) throw new Error('다운로드 실패');

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `attendance_import_errors_${fileName || 'report'}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (e) {
      alert('오류 목록 다운로드 중 오류가 발생했습니다.');
    }
  };

  // 7. Commit 실행
  const handleExecuteCommit = async () => {
    setIsCommitting(true);
    setErrorMessage(null);

    const rowsPayload = previewRows
      .filter((r) => r.status !== 'ERROR' && r.status !== 'SAME')
      .map((r) => ({
        rowNumber: r.rowNumber,
        employeeNumber: r.employeeNumber,
        workDate: r.workDate,
        checkInTime: r.checkInTime,
        checkOutTime: r.checkOutTime,
        resolution: r.resolution,
      }));

    try {
      const res = await fetch('/api/attendance/excel-commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName,
          fileSizeBytes,
          rows: rowsPayload,
        }),
      });

      const data = (await res.json()) as any;
      if (!res.ok) {
        setErrorMessage(data.error || 'DB 반영 중 오류가 발생했습니다.');
        setIsConfirmOpen(false);
        return;
      }

      setCommitResult(data.result);
      setIsConfirmOpen(false);
      setStep(3); // 결과 화면
    } catch (err) {
      console.error(err);
      setErrorMessage('서버와 통신 중 오류가 발생했습니다.');
      setIsConfirmOpen(false);
    } finally {
      setIsCommitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleDialogChange}>
      <DialogContent className="max-h-[92vh] max-w-5xl overflow-hidden p-0 flex flex-col">
        {/* 헤더 */}
        <DialogHeader className="border-b px-6 py-4 bg-muted/20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="flex size-9 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
                <FileSpreadsheet className="size-5" />
              </div>
              <div>
                <DialogTitle className="text-lg font-bold">근태 Excel 일괄 업로드</DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground">
                  표준 Excel 파일로부터 출퇴근 기록을 검증 후 안전하게 반영합니다.
                </DialogDescription>
              </div>
            </div>

            {/* 상단 탭 */}
            <div className="flex items-center gap-1 rounded-lg border bg-background p-1 text-xs">
              <button
                type="button"
                onClick={() => {
                  setActiveTab('IMPORT');
                  setErrorMessage(null);
                }}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1 font-medium transition-all ${
                  activeTab === 'IMPORT' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Upload className="size-3.5" />
                업로드 및 검증
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveTab('HISTORY');
                  setErrorMessage(null);
                  loadHistory();
                }}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1 font-medium transition-all ${
                  activeTab === 'HISTORY' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <History className="size-3.5" />
                가져오기 이력
              </button>
            </div>
          </div>
        </DialogHeader>

        {/* 탭 내용 영역 */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {errorMessage && (
            <div className="mb-4 flex items-center gap-2 rounded-lg bg-rose-50 p-3 text-sm text-rose-800 border border-rose-200">
              <AlertTriangle className="size-4 shrink-0" />
              <p className="flex-1 text-xs font-medium">{errorMessage}</p>
              <button
                type="button"
                onClick={() => setErrorMessage(null)}
                className="text-xs font-bold hover:underline"
              >
                닫기
              </button>
            </div>
          )}

          {activeTab === 'IMPORT' && (
            <>
              {/* ─── STEP 1: 파일 선택 ────────────────────────── */}
              {step === 1 && (
                <div className="flex flex-col items-center justify-center space-y-6 py-8">
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="flex flex-col items-center justify-center w-full max-w-xl h-56 border-2 border-dashed border-muted-foreground/30 hover:border-primary/60 rounded-2xl cursor-pointer bg-muted/10 hover:bg-muted/20 transition-all p-6 text-center"
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".xlsx"
                      className="hidden"
                      onChange={handleFileChange}
                    />
                    <div className="size-14 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mb-3 shadow-inner">
                      <Upload className="size-7" />
                    </div>
                    <p className="text-base font-semibold">
                      클릭하여 Excel(.xlsx) 파일을 선택하거나 여기에 드래그하세요
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      표준 양식 필수 컬럼: 사번, 근무일자, 출근시간, 퇴근시간 (최대 5MB, 2,000행)
                    </p>
                    {isLoading && (
                      <div className="mt-4 flex items-center gap-2 text-xs font-semibold text-primary">
                        <Loader2 className="size-4 animate-spin" />
                        파일을 분석 및 유효성 검증 중입니다...
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-3">
                    <a
                      href="/api/attendance/excel-template"
                      download="attendance_import_template.xlsx"
                      className="inline-flex items-center gap-2 rounded-lg border bg-card px-4 py-2 text-xs font-medium shadow-sm hover:bg-muted/50 transition-all"
                    >
                      <Download className="size-4 text-emerald-600" />
                      표준 Excel 양식 다운로드
                    </a>
                  </div>

                  <div className="rounded-xl border bg-muted/30 p-4 max-w-xl w-full text-xs text-muted-foreground space-y-1.5">
                    <div className="font-semibold text-foreground flex items-center gap-1.5 mb-1">
                      <HelpCircle className="size-4 text-blue-600" />
                      Excel 작성 시 안내사항
                    </div>
                    <p>• <strong>사번</strong>은 직원을 식별하는 기준키(Source of Truth)입니다.</p>
                    <p>• <strong>근무일자</strong>는 YYYY-MM-DD 형식 또는 엑셀 날짜 형식을 사용하세요.</p>
                    <p>• <strong>출근시간</strong>만 있는 기록은 등록 가능하며, <strong>퇴근시간만 있는 기록</strong>은 등록이 불가합니다.</p>
                    <p>• 파일 내 동일 사번·동일 날짜가 중복되면 오류로 처리됩니다.</p>
                    <p>• 기존 웹 등록이나 관리자 보정 기록과 충돌하는 경우 관리자가 처리방법을 직접 선택합니다.</p>
                  </div>
                </div>
              )}

              {/* ─── STEP 2: 미리보기 및 충돌 처리 ──────────────── */}
              {step === 2 && summary && (
                <div className="space-y-4">
                  {/* 상단 파일 정보 및 요약 KPI */}
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-3 shadow-sm">
                    <div className="flex items-center gap-2">
                      <FileSpreadsheet className="size-5 text-emerald-600" />
                      <div>
                        <p className="text-sm font-bold">{fileName}</p>
                        <p className="text-[11px] text-muted-foreground">
                          총 {summary.totalRows}행 분석 완료 (반영 대상: {summary.canCommitCount}건)
                        </p>
                      </div>
                    </div>

                    {/* KPI 배지들 */}
                    <div className="flex flex-wrap items-center gap-1.5 text-xs">
                      <button
                        type="button"
                        onClick={() => setStatusFilter('ALL')}
                        className={`rounded-lg px-2.5 py-1 font-semibold transition-all border ${
                          statusFilter === 'ALL' ? 'bg-primary text-primary-foreground border-primary' : 'bg-muted/30 text-muted-foreground'
                        }`}
                      >
                        전체 {summary.totalRows}
                      </button>
                      <button
                        type="button"
                        onClick={() => setStatusFilter('NEW')}
                        className={`rounded-lg px-2.5 py-1 font-semibold transition-all border ${
                          statusFilter === 'NEW' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        }`}
                      >
                        신규 {summary.newCount}
                      </button>
                      <button
                        type="button"
                        onClick={() => setStatusFilter('CONFLICT')}
                        className={`rounded-lg px-2.5 py-1 font-semibold transition-all border ${
                          statusFilter === 'CONFLICT' ? 'bg-amber-600 text-white border-amber-600' : 'bg-amber-50 text-amber-700 border-amber-200'
                        }`}
                      >
                        충돌 {summary.conflictCount}
                      </button>
                      <button
                        type="button"
                        onClick={() => setStatusFilter('SAME')}
                        className={`rounded-lg px-2.5 py-1 font-semibold transition-all border ${
                          statusFilter === 'SAME' ? 'bg-slate-700 text-white border-slate-700' : 'bg-slate-50 text-slate-700 border-slate-200'
                        }`}
                      >
                        동일 {summary.sameCount}
                      </button>
                      <button
                        type="button"
                        onClick={() => setStatusFilter('WARNING')}
                        className={`rounded-lg px-2.5 py-1 font-semibold transition-all border ${
                          statusFilter === 'WARNING' ? 'bg-purple-600 text-white border-purple-600' : 'bg-purple-50 text-purple-700 border-purple-200'
                        }`}
                      >
                        경고 {summary.warningCount}
                      </button>
                      <button
                        type="button"
                        onClick={() => setStatusFilter('ERROR')}
                        className={`rounded-lg px-2.5 py-1 font-semibold transition-all border ${
                          statusFilter === 'ERROR' ? 'bg-rose-600 text-white border-rose-600' : 'bg-rose-50 text-rose-700 border-rose-200'
                        }`}
                      >
                        오류 {summary.errorCount}
                      </button>
                    </div>
                  </div>

                  {/* 일괄 액션 바 및 검색 */}
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
                    {/* 충돌 일괄 처리 */}
                    {summary.conflictCount > 0 ? (
                      <div className="flex items-center gap-2 text-xs bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5">
                        <span className="font-semibold text-amber-800">충돌 {summary.conflictCount}건 일괄 처리:</span>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleBatchResolutionChange('KEEP_EXISTING')}
                          className="h-7 text-xs bg-white"
                        >
                          모두 기존값 유지
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleBatchResolutionChange('OVERWRITE_EXCEL')}
                          className="h-7 text-xs bg-amber-600 text-white hover:bg-amber-700 hover:text-white"
                        >
                          모두 Excel값 적용
                        </Button>
                      </div>
                    ) : (
                      <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                        <CheckCircle2 className="size-4 text-emerald-600" />
                        충돌 항목이 없습니다.
                      </div>
                    )}

                    {/* 검색 및 오류 다운로드 */}
                    <div className="flex items-center gap-2">
                      <div className="relative w-48 sm:w-60">
                        <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
                        <Input
                          placeholder="사번, 성명 검색..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="h-8 pl-8 text-xs"
                        />
                      </div>
                      {(summary.errorCount > 0 || summary.warningCount > 0 || summary.conflictCount > 0) && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleDownloadErrors}
                          className="h-8 text-xs gap-1.5"
                          title="오류 및 경고 행 Excel 다운로드"
                        >
                          <Download className="size-3.5 text-rose-600" />
                          오류/경고 받기
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* 미리보기 테이블 (Desktop) */}
                  <div className="rounded-xl border bg-card shadow-sm overflow-hidden hidden md:block">
                    <div className="max-h-[50vh] overflow-y-auto">
                      <Table>
                        <TableHeader className="bg-muted/40 sticky top-0 z-10">
                          <TableRow className="text-xs">
                            <TableHead className="w-12 text-center">Row</TableHead>
                            <TableHead className="w-24">사번</TableHead>
                            <TableHead className="w-24">성명</TableHead>
                            <TableHead className="w-24">근무일자</TableHead>
                            <TableHead className="w-20">출근</TableHead>
                            <TableHead className="w-20">퇴근</TableHead>
                            <TableHead className="w-32">기존 근태 기록</TableHead>
                            <TableHead className="w-20 text-center">상태</TableHead>
                            <TableHead>검증 메시지</TableHead>
                            <TableHead className="w-40 text-center">처리방법 선택</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredRows.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={10} className="py-8 text-center text-xs text-muted-foreground">
                                필터에 해당하는 데이터가 없습니다.
                              </TableCell>
                            </TableRow>
                          ) : (
                            filteredRows.map((r) => {
                              const isConflict = r.status === 'CONFLICT';
                              const isError = r.status === 'ERROR';
                              const isSame = r.status === 'SAME';

                              return (
                                <TableRow
                                  key={r.rowNumber}
                                  className={`text-xs ${
                                    isError
                                      ? 'bg-rose-50/50 hover:bg-rose-50'
                                      : isConflict
                                      ? 'bg-amber-50/40 hover:bg-amber-50/70'
                                      : isSame
                                      ? 'bg-muted/10 opacity-70'
                                      : ''
                                  }`}
                                >
                                  <TableCell className="text-center font-mono text-muted-foreground">
                                    {r.rowNumber}
                                  </TableCell>
                                  <TableCell className="font-semibold">{r.employeeNumber}</TableCell>
                                  <TableCell>
                                    <div>{r.dbEmployeeName || r.employeeName || '-'}</div>
                                    {r.department && (
                                      <div className="text-[10px] text-muted-foreground">{r.department}</div>
                                    )}
                                  </TableCell>
                                  <TableCell className="font-mono">{r.workDate || '-'}</TableCell>
                                  <TableCell className="font-mono font-medium text-emerald-700">
                                    {r.checkInTime || '-'}
                                  </TableCell>
                                  <TableCell className="font-mono font-medium text-blue-700">
                                    {r.checkOutTime || '-'}
                                  </TableCell>

                                  {/* 기존 근태 기록 비교 */}
                                  <TableCell>
                                    {r.existingSource ? (
                                      <div className="space-y-0.5">
                                        <div className="font-mono text-[11px]">
                                          {r.existingCheckIn || '-'} ~ {r.existingCheckOut || '-'}
                                        </div>
                                        <Badge
                                          variant="outline"
                                          className={`text-[9px] px-1 py-0 ${
                                            r.existingSource === 'WEB'
                                              ? 'bg-blue-50 text-blue-700 border-blue-200'
                                              : r.existingSource === 'ADMIN_EDIT'
                                              ? 'bg-purple-50 text-purple-700 border-purple-200'
                                              : 'bg-slate-50 text-slate-700 border-slate-200'
                                          }`}
                                        >
                                          {r.existingSource === 'WEB'
                                            ? '직원 직접등록'
                                            : r.existingSource === 'ADMIN_EDIT'
                                            ? '관리자 보정'
                                            : '기존 Excel'}
                                        </Badge>
                                      </div>
                                    ) : (
                                      <span className="text-muted-foreground">-</span>
                                    )}
                                  </TableCell>

                                  {/* 상태 배지 */}
                                  <TableCell className="text-center">
                                    <Badge
                                      className={`text-[10px] px-1.5 py-0.5 ${
                                        r.status === 'ERROR'
                                          ? 'bg-rose-100 text-rose-800 border-rose-300'
                                          : r.status === 'CONFLICT'
                                          ? 'bg-amber-100 text-amber-800 border-amber-300'
                                          : r.status === 'SAME'
                                          ? 'bg-slate-100 text-slate-700 border-slate-300'
                                          : r.status === 'WARNING'
                                          ? 'bg-purple-100 text-purple-800 border-purple-300'
                                          : 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                      }`}
                                    >
                                      {r.status === 'NEW'
                                        ? '신규'
                                        : r.status === 'SAME'
                                        ? '동일'
                                        : r.status === 'CONFLICT'
                                        ? '충돌'
                                        : r.status === 'WARNING'
                                        ? '경고'
                                        : '오류'}
                                    </Badge>
                                  </TableCell>

                                  {/* 검증 메시지 */}
                                  <TableCell>
                                    <div className="space-y-0.5">
                                      {r.errors.map((err, idx) => (
                                        <p key={idx} className="text-rose-600 font-medium text-[11px] flex items-center gap-1">
                                          <XCircle className="size-3 shrink-0" />
                                          {err}
                                        </p>
                                      ))}
                                      {r.warnings.map((warn, idx) => (
                                        <p key={idx} className="text-purple-700 text-[11px] flex items-center gap-1">
                                          <AlertTriangle className="size-3 shrink-0" />
                                          {warn}
                                        </p>
                                      ))}
                                      {r.status === 'SAME' && (
                                        <p className="text-muted-foreground text-[11px]">기존 데이터와 동일 — 반영 제외</p>
                                      )}
                                      {r.status === 'NEW' && r.warnings.length === 0 && (
                                        <p className="text-emerald-700 text-[11px]">정상 신규 등록 대상</p>
                                      )}
                                    </div>
                                  </TableCell>

                                  {/* 처리방식 선택 */}
                                  <TableCell className="text-center">
                                    {isConflict ? (
                                      <div className="flex flex-col gap-1 items-start text-[11px]">
                                        <label className="flex items-center gap-1 cursor-pointer">
                                          <input
                                            type="radio"
                                            name={`res_${r.rowNumber}`}
                                            checked={r.resolution === 'KEEP_EXISTING'}
                                            onChange={() =>
                                              handleRowResolutionChange(r.rowNumber, 'KEEP_EXISTING')
                                            }
                                          />
                                          <span className="font-medium text-slate-700">기존값 유지</span>
                                        </label>
                                        <label className="flex items-center gap-1 cursor-pointer">
                                          <input
                                            type="radio"
                                            name={`res_${r.rowNumber}`}
                                            checked={r.resolution === 'OVERWRITE_EXCEL'}
                                            onChange={() =>
                                              handleRowResolutionChange(r.rowNumber, 'OVERWRITE_EXCEL')
                                            }
                                          />
                                          <span className="font-semibold text-amber-700">Excel값 적용</span>
                                        </label>
                                      </div>
                                    ) : isError ? (
                                      <span className="text-[10px] text-rose-500 font-semibold">반영 불가</span>
                                    ) : isSame ? (
                                      <span className="text-[10px] text-muted-foreground">반영 제외</span>
                                    ) : (
                                      <span className="text-[10px] text-emerald-600 font-semibold">자동 신규반영</span>
                                    )}
                                  </TableCell>
                                </TableRow>
                              );
                            })
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </div>

                  {/* 모바일 카드 뷰 */}
                  <div className="space-y-3 md:hidden max-h-[50vh] overflow-y-auto">
                    {filteredRows.map((r) => (
                      <div
                        key={r.rowNumber}
                        className={`rounded-xl border p-3.5 text-xs space-y-2 ${
                          r.status === 'ERROR'
                            ? 'bg-rose-50/40 border-rose-200'
                            : r.status === 'CONFLICT'
                            ? 'bg-amber-50/40 border-amber-200'
                            : 'bg-card'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-muted-foreground">Row #{r.rowNumber}</span>
                          <Badge
                            className={`text-[10px] ${
                              r.status === 'ERROR'
                                ? 'bg-rose-100 text-rose-800'
                                : r.status === 'CONFLICT'
                                ? 'bg-amber-100 text-amber-800'
                                : r.status === 'SAME'
                                ? 'bg-slate-100 text-slate-700'
                                : 'bg-emerald-100 text-emerald-800'
                            }`}
                          >
                            {r.status}
                          </Badge>
                        </div>
                        <div className="flex justify-between items-center font-semibold">
                          <span>{r.employeeNumber} ({r.dbEmployeeName || r.employeeName || '-'})</span>
                          <span className="font-mono text-muted-foreground">{r.workDate}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 bg-muted/20 p-2 rounded-lg text-[11px]">
                          <div>Excel: {r.checkInTime || '-'} ~ {r.checkOutTime || '-'}</div>
                          <div>기존: {r.existingCheckIn || '-'} ~ {r.existingCheckOut || '-'}</div>
                        </div>
                        {r.errors.length > 0 && (
                          <p className="text-rose-600 text-[11px] font-medium">{r.errors.join(', ')}</p>
                        )}
                        {r.warnings.length > 0 && (
                          <p className="text-purple-700 text-[11px]">{r.warnings.join(', ')}</p>
                        )}
                        {r.status === 'CONFLICT' && (
                          <div className="flex items-center gap-3 pt-1 border-t">
                            <label className="flex items-center gap-1 cursor-pointer">
                              <input
                                type="radio"
                                name={`mob_res_${r.rowNumber}`}
                                checked={r.resolution === 'KEEP_EXISTING'}
                                onChange={() => handleRowResolutionChange(r.rowNumber, 'KEEP_EXISTING')}
                              />
                              기존값 유지
                            </label>
                            <label className="flex items-center gap-1 cursor-pointer">
                              <input
                                type="radio"
                                name={`mob_res_${r.rowNumber}`}
                                checked={r.resolution === 'OVERWRITE_EXCEL'}
                                onChange={() => handleRowResolutionChange(r.rowNumber, 'OVERWRITE_EXCEL')}
                              />
                              Excel값 적용
                            </label>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ─── STEP 3: 반영 완료 리포트 ──────────────────── */}
              {step === 3 && commitResult && (
                <div className="flex flex-col items-center justify-center space-y-6 py-6 text-center">
                  <div className="size-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center shadow-inner">
                    <CheckCircle2 className="size-10" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-foreground">Excel 근태 DB 반영 완료</h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      선택하신 Excel 근태 기록이 운영 데이터베이스에 성공적으로 반영되었습니다.
                    </p>
                  </div>

                  {/* 결과 통계 카드 */}
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 w-full max-w-2xl">
                    <div className="rounded-xl border bg-card p-3 shadow-sm">
                      <p className="text-[11px] text-muted-foreground">신규 등록</p>
                      <p className="text-xl font-bold text-emerald-600 mt-1">{commitResult.newCount}건</p>
                    </div>
                    <div className="rounded-xl border bg-card p-3 shadow-sm">
                      <p className="text-[11px] text-muted-foreground">기존 기록 변경</p>
                      <p className="text-xl font-bold text-amber-600 mt-1">{commitResult.updatedCount}건</p>
                    </div>
                    <div className="rounded-xl border bg-card p-3 shadow-sm">
                      <p className="text-[11px] text-muted-foreground">기존값 유지</p>
                      <p className="text-xl font-bold text-slate-700 mt-1">{commitResult.keptExistingCount}건</p>
                    </div>
                    <div className="rounded-xl border bg-card p-3 shadow-sm">
                      <p className="text-[11px] text-muted-foreground">동일 데이터 제외</p>
                      <p className="text-xl font-bold text-muted-foreground mt-1">{commitResult.sameCount}건</p>
                    </div>
                    <div className="rounded-xl border bg-card p-3 shadow-sm">
                      <p className="text-[11px] text-muted-foreground">오류 제외</p>
                      <p className="text-xl font-bold text-rose-600 mt-1">{commitResult.errorCount}건</p>
                    </div>
                  </div>

                  <div className="rounded-xl border bg-muted/20 p-4 max-w-xl w-full text-xs text-muted-foreground text-left space-y-1">
                    <p>• <strong>배치 번호:</strong> {commitResult.batchId}</p>
                    <p>• <strong>파일명:</strong> {commitResult.fileName}</p>
                    <p>• <strong>근태 판정:</strong> 기존 5분 Grace Period 및 일별 근태 상태 자동 재계산 완료</p>
                    <p>• <strong>감사 로그:</strong> 관리자 변경 및 Import Batch 감사기록이 영구 보존됩니다.</p>
                  </div>
                </div>
              )}
            </>
          )}

          {/* ─── HISTORY 탭: 최근 가져오기 이력 ────────────────── */}
          {activeTab === 'HISTORY' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-bold">최근 Excel 근태 업로드 이력</h4>
                  <p className="text-xs text-muted-foreground">
                    관리자가 일괄 반영한 최근 Import Batch 목록입니다.
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={loadHistory}
                  disabled={isHistoryLoading}
                  className="h-8 text-xs gap-1.5"
                >
                  <RotateCcw className={`size-3.5 ${isHistoryLoading ? 'animate-spin' : ''}`} />
                  새로고침
                </Button>
              </div>

              {isHistoryLoading ? (
                <div className="flex items-center justify-center py-12 text-xs text-muted-foreground">
                  <Loader2 className="size-5 animate-spin mr-2" /> 이력을 불러오는 중...
                </div>
              ) : historyList.length === 0 ? (
                <div className="rounded-xl border border-dashed py-12 text-center text-xs text-muted-foreground">
                  가져오기 이력이 없습니다.
                </div>
              ) : (
                <div className="rounded-xl border bg-card overflow-hidden shadow-sm">
                  <Table>
                    <TableHeader className="bg-muted/40">
                      <TableRow className="text-xs">
                        <TableHead>처리일시</TableHead>
                        <TableHead>파일명</TableHead>
                        <TableHead>처리 관리자</TableHead>
                        <TableHead className="text-center">총 건수</TableHead>
                        <TableHead className="text-center text-emerald-600">신규</TableHead>
                        <TableHead className="text-center text-amber-600">수정</TableHead>
                        <TableHead className="text-center text-rose-600">오류</TableHead>
                        <TableHead className="text-center">상태</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {historyList.map((b) => (
                        <TableRow key={b.id} className="text-xs">
                          <TableCell className="font-mono text-muted-foreground">
                            {b.createdAt ? new Date(b.createdAt).toLocaleString('ko-KR') : '-'}
                          </TableCell>
                          <TableCell className="font-medium flex items-center gap-1.5">
                            <FileSpreadsheet className="size-3.5 text-emerald-600 shrink-0" />
                            {b.fileName}
                          </TableCell>
                          <TableCell>{b.actorName || '시스템 관리자'}</TableCell>
                          <TableCell className="text-center font-mono">{b.totalRows}</TableCell>
                          <TableCell className="text-center font-mono font-semibold text-emerald-600">
                            {b.newCount}
                          </TableCell>
                          <TableCell className="text-center font-mono font-semibold text-amber-600">
                            {b.updatedCount}
                          </TableCell>
                          <TableCell className="text-center font-mono font-semibold text-rose-600">
                            {b.errorCount}
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge
                              className={`text-[10px] ${
                                b.status === 'COMMITTED'
                                  ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                  : 'bg-rose-100 text-rose-800 border-rose-300'
                              }`}
                            >
                              {b.status === 'COMMITTED' ? '반영완료' : '실패'}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 푸터 버튼 */}
        <DialogFooter className="border-t px-6 py-3 bg-muted/10 flex items-center justify-between sm:justify-between">
          {activeTab === 'IMPORT' ? (
            <>
              {step === 1 && (
                <Button variant="outline" size="sm" onClick={onClose} className="text-xs">
                  닫기
                </Button>
              )}

              {step === 2 && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setStep(1);
                      setSelectedFile(null);
                      setPreviewRows([]);
                    }}
                    className="text-xs gap-1.5"
                  >
                    <RotateCcw className="size-3.5" />
                    다른 파일 선택
                  </Button>

                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={onClose} className="text-xs">
                      취소
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => setIsConfirmOpen(true)}
                      disabled={commitEligibleRows.length === 0 && commitKeepRowsCount === 0}
                      className="text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                    >
                      <Check className="size-3.5" />
                      검증 완료 데이터 반영 ({commitEligibleRows.length}건)
                    </Button>
                  </div>
                </>
              )}

              {step === 3 && (
                <div className="w-full flex justify-end">
                  <Button
                    size="sm"
                    onClick={() => {
                      onSuccess();
                      onClose();
                    }}
                    className="text-xs bg-primary"
                  >
                    확인 및 근태 관리로 이동
                  </Button>
                </div>
              )}
            </>
          ) : (
            <div className="w-full flex justify-end">
              <Button variant="outline" size="sm" onClick={onClose} className="text-xs">
                닫기
              </Button>
            </div>
          )}
        </DialogFooter>
      </DialogContent>

      {/* 최종 Commit 확인 다이얼로그 (Req 37) */}
      <Dialog open={isConfirmOpen} onOpenChange={setIsConfirmOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <ShieldAlert className="size-5 text-amber-600" />
              Excel 근태 DB 반영 확인
            </DialogTitle>
            <DialogDescription className="text-xs mt-2">
              검증 완료된 근태 기록을 운영 데이터베이스에 최종 반영합니다.
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-xl border bg-muted/30 p-3.5 text-xs space-y-2">
            <p className="font-semibold text-foreground">
              신규 {previewRows.filter((r) => r.status === 'NEW' || r.status === 'WARNING').length}건을 등록하고,
              기존 근태 {previewRows.filter((r) => r.status === 'CONFLICT' && r.resolution === 'OVERWRITE_EXCEL').length}건을 수정합니다.
            </p>
            <p className="text-muted-foreground">
              동일 {summary?.sameCount ?? 0}건, 기존값 유지 {commitKeepRowsCount}건, 오류 {summary?.errorCount ?? 0}건은 반영되지 않습니다.
            </p>
            <p className="text-[11px] text-amber-700 font-medium">
              * Commit 시점에 DB 상태를 재검증하여 실시간 충돌을 방지합니다.
            </p>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsConfirmOpen(false)}
              disabled={isCommitting}
              className="text-xs"
            >
              취소
            </Button>
            <Button
              size="sm"
              onClick={handleExecuteCommit}
              disabled={isCommitting}
              className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
            >
              {isCommitting ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" /> 반영 중...
                </>
              ) : (
                '계속하시겠습니까?'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
