'use client';

import { useState, useEffect, useCallback } from 'react';
import { CalendarDays, ChevronDown, Plus, Search, X, Pencil, Trash2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { minutesToDays, formatDays, formatHours, LEAVE_TYPE_META } from '@/lib/hr-types';
import type { LeaveStatusRow, LeaveUsageDisplay, LeaveType } from '@/lib/hr-types';

// ─── 유틸리티 ────────────────────────────────────────────────────────────────

function fmtDays(minutes: number) {
  const d = minutesToDays(minutes);
  return d.toFixed(3);
}

function statusBadge(status: string) {
  if (status === 'ACTIVE') return <Badge className="bg-emerald-50 text-emerald-700 hover:bg-emerald-50">재직</Badge>;
  if (status === 'LEAVE') return <Badge className="bg-amber-50 text-amber-700 hover:bg-amber-50">휴직</Badge>;
  return <Badge className="bg-slate-100 text-slate-500 hover:bg-slate-100">퇴사</Badge>;
}

// ─── Toast 알림 ──────────────────────────────────────────────────────────────

function Toast({ message, type, onClose }: { message: string; type: 'success' | 'error'; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 4000);
    return () => clearTimeout(t);
  }, [onClose]);

  return (
    <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-2xl px-5 py-4 shadow-xl transition-all ${
      type === 'success' ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'
    }`}>
      {type === 'success' ? <CheckCircle2 className="size-5 shrink-0" /> : <AlertCircle className="size-5 shrink-0" />}
      <span className="text-sm font-medium">{message}</span>
      <button onClick={onClose} className="ml-2 opacity-70 hover:opacity-100"><X className="size-4" /></button>
    </div>
  );
}

// ─── 연차 마스터 설정 다이얼로그 ─────────────────────────────────────────────

function MasterDialog({
  open,
  onClose,
  row,
  year,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  row: LeaveStatusRow | null;
  year: number;
  onSuccess: (msg: string) => void;
}) {
  const [granted, setGranted] = useState('');
  const [carried, setCarried] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open && row) {
      setGranted(minutesToDays(row.grantedMinutes).toFixed(3).replace(/\.?0+$/, ''));
      setCarried(minutesToDays(row.carriedMinutes).toFixed(3).replace(/\.?0+$/, ''));
      setError('');
    }
  }, [open, row]);

  async function handleSubmit() {
    if (!row) return;
    const grantedDays = parseFloat(granted);
    const carriedDays = parseFloat(carried);
    if (isNaN(grantedDays) || grantedDays < 0) {
      setError('기본 부여연차를 올바르게 입력하세요.');
      return;
    }
    if (isNaN(carriedDays) || carriedDays < 0) {
      setError('이월연차를 올바르게 입력하세요.');
      return;
    }
    // 0.125일(60분) 단위 검증
    const grantedCheck = Math.round(grantedDays * 480);
    const carriedCheck = Math.round(carriedDays * 480);
    if (grantedCheck % 60 !== 0) {
      setError('기본 부여연차는 0.125일(시차 1개) 단위로 입력하세요.');
      return;
    }
    if (carriedCheck % 60 !== 0) {
      setError('이월연차는 0.125일(시차 1개) 단위로 입력하세요.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      if (row.masterId) {
        // 수정
        const res = await fetch(`/api/leave/masters/${row.masterId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ grantedDays, carriedDays }),
        });
        const data = await res.json() as { error?: string };
        if (!res.ok) { setError(data.error ?? '오류가 발생했습니다.'); return; }
        onSuccess('연차 마스터가 수정되었습니다.');
      } else {
        // 생성
        const res = await fetch('/api/leave/masters', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ employeeId: row.employeeId, year, grantedDays, carriedDays }),
        });
        const data = await res.json() as { error?: string };
        if (!res.ok) { setError(data.error ?? '오류가 발생했습니다.'); return; }
        onSuccess('연차 마스터가 생성되었습니다.');
      }
      onClose();
    } finally {
      setLoading(false);
    }
  }

  if (!row) return null;

  const grantedN = parseFloat(granted) || 0;
  const carriedN = parseFloat(carried) || 0;
  const totalDays = grantedN + carriedN;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>연차 마스터 {row.masterId ? '수정' : '설정'}</DialogTitle>
          <DialogDescription>
            {row.fullName} ({row.employeeNumber}) · {year}년
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="granted">기본 부여연차 (일)</Label>
            <Input
              id="granted"
              type="number"
              step="0.125"
              min="0"
              value={granted}
              onChange={(e) => setGranted(e.target.value)}
              placeholder="예: 15"
              className="mt-1"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              0.125일 단위 입력 가능 · 입력값: {grantedN > 0 ? formatHours(Math.round(grantedN * 480)) : '—'}
            </p>
          </div>
          <div>
            <Label htmlFor="carried">전년도 이월연차 (일)</Label>
            <Input
              id="carried"
              type="number"
              step="0.125"
              min="0"
              value={carried}
              onChange={(e) => setCarried(e.target.value)}
              placeholder="예: 2"
              className="mt-1"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              0.125일 단위 입력 가능 · 입력값: {carriedN > 0 ? formatHours(Math.round(carriedN * 480)) : '—'}
            </p>
          </div>
          <div className="rounded-xl bg-blue-50 p-4">
            <p className="text-sm font-semibold text-blue-900">
              총 연차: {totalDays.toFixed(3).replace(/\.?0+$/, '')}일
              <span className="ml-2 font-normal text-blue-700">
                ({formatHours(Math.round(totalDays * 480))})
              </span>
            </p>
          </div>
          {error && (
            <div className="flex items-center gap-2 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
              <AlertCircle className="size-4 shrink-0" />
              {error}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>취소</Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading ? '저장 중...' : (row.masterId ? '수정' : '생성')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── 연차 사용 등록/수정 다이얼로그 ──────────────────────────────────────────

function UsageDialog({
  open,
  onClose,
  employeeId,
  employeeName,
  year,
  editUsage,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  employeeId: string;
  employeeName: string;
  year: number;
  editUsage: LeaveUsageDisplay | null;
  onSuccess: (msg: string) => void;
}) {
  const [leaveDate, setLeaveDate] = useState('');
  const [leaveType, setLeaveType] = useState<LeaveType>('FULL_DAY');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      if (editUsage) {
        setLeaveDate(editUsage.leaveDate);
        setLeaveType(editUsage.leaveType);
      } else {
        setLeaveDate('');
        setLeaveType('FULL_DAY');
      }
      setError('');
    }
  }, [open, editUsage]);

  async function handleSubmit() {
    if (!leaveDate) { setError('사용일자를 입력하세요.'); return; }
    setLoading(true);
    setError('');
    try {
      if (editUsage) {
        const res = await fetch(`/api/leave/usages/${editUsage.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ leaveDate, leaveType }),
        });
        const data = await res.json() as { error?: string };
        if (!res.ok) { setError(data.error ?? '오류가 발생했습니다.'); return; }
        onSuccess('연차 사용내역이 수정되었습니다.');
      } else {
        const res = await fetch('/api/leave/usages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ employeeId, leaveDate, leaveType }),
        });
        const data = await res.json() as { error?: string };
        if (!res.ok) { setError(data.error ?? '오류가 발생했습니다.'); return; }
        onSuccess('연차 사용내역이 등록되었습니다.');
      }
      onClose();
    } finally {
      setLoading(false);
    }
  }

  const meta = LEAVE_TYPE_META[leaveType];

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>연차 사용 {editUsage ? '수정' : '등록'}</DialogTitle>
          <DialogDescription>{employeeName} · {year}년</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="leaveDate">사용일자</Label>
            <Input
              id="leaveDate"
              type="date"
              value={leaveDate}
              onChange={(e) => setLeaveDate(e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="leaveType">연차 종류</Label>
            <Select value={leaveType} onValueChange={(v) => setLeaveType(v as LeaveType)}>
              <SelectTrigger id="leaveType" className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.entries(LEAVE_TYPE_META) as [LeaveType, { label: string; minutes: number }][]).map(([k, v]) => (
                  <SelectItem key={k} value={k}>
                    {v.label} ({formatHours(v.minutes)})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="rounded-xl bg-blue-50 p-3 text-sm text-blue-900">
            선택: {meta.label} · {formatHours(meta.minutes)} · {formatDays(meta.minutes)}
          </div>
          {error && (
            <div className="flex items-center gap-2 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
              <AlertCircle className="size-4 shrink-0" />
              {error}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>취소</Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading ? '저장 중...' : (editUsage ? '수정' : '등록')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── 직원별 연차 상세 패널 ────────────────────────────────────────────────────

function LeaveUsageHistoryDialog({
  open,
  onClose,
  row,
  year,
}: {
  open: boolean;
  onClose: () => void;
  row: LeaveStatusRow | null;
  year: number;
}) {
  const [usages, setUsages] = useState<LeaveUsageDisplay[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open || !row?.masterId) return;
    let cancelled = false;

    async function loadUsages() {
      setLoading(true);
      setError('');
      try {
        const res = await fetch(`/api/leave/masters/${row!.masterId}`);
        const data = (await res.json().catch(() => ({}))) as {
          usages?: LeaveUsageDisplay[];
          error?: string;
        };
        if (!res.ok) throw new Error(data.error || '연차 사용내역을 불러오지 못했습니다.');
        if (!cancelled) setUsages(data.usages ?? []);
      } catch (err) {
        if (!cancelled) {
          setUsages([]);
          setError(err instanceof Error ? err.message : '연차 사용내역을 불러오지 못했습니다.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadUsages();
    return () => { cancelled = true; };
  }, [open, row]);

  if (!row) return null;
  const activeCount = usages.filter((usage) => !usage.cancelledAt).length;

  return (
    <Dialog open={open} onOpenChange={(value) => !value && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarDays className="size-5 text-primary" />
            연차 사용내역
          </DialogTitle>
          <DialogDescription>
            {row.fullName} ({row.employeeNumber}) · {year}년
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3 text-sm">
          <span className="text-muted-foreground">등록된 사용일자</span>
          <Badge variant="secondary">정상 {activeCount}건</Badge>
        </div>

        {loading ? (
          <p className="py-10 text-center text-sm text-muted-foreground">불러오는 중...</p>
        ) : error ? (
          <div className="flex items-center gap-2 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
            <AlertCircle className="size-4 shrink-0" />
            {error}
          </div>
        ) : usages.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">연차 사용내역이 없습니다.</p>
        ) : (
          <div className="max-h-[420px] overflow-auto rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>사용일자</TableHead>
                  <TableHead>연차 종류</TableHead>
                  <TableHead className="text-right">사용일수</TableHead>
                  <TableHead className="text-right">사용시간</TableHead>
                  <TableHead className="text-center">상태</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {usages.map((usage) => (
                  <TableRow key={usage.id} className={usage.cancelledAt ? 'opacity-50' : ''}>
                    <TableCell className="font-mono text-xs">{usage.leaveDate}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{LEAVE_TYPE_META[usage.leaveType].label}</Badge>
                    </TableCell>
                    <TableCell className="text-right">{formatDays(usage.minutes)}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{formatHours(usage.minutes)}</TableCell>
                    <TableCell className="text-center">
                      {usage.cancelledAt ? (
                        <Badge variant="secondary">취소</Badge>
                      ) : (
                        <Badge className="bg-emerald-50 text-emerald-700 hover:bg-emerald-50">정상</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>닫기</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
function EmployeeLeavePanel({
  row,
  year,
  onMasterSet,
  onUsageRegister,
  onToast,
}: {
  row: LeaveStatusRow;
  year: number;
  onMasterSet: (r: LeaveStatusRow) => void;
  onUsageRegister: (r: LeaveStatusRow, usage: LeaveUsageDisplay | null) => void;
  onToast: (msg: string, type: 'success' | 'error') => void;
}) {
  const [usages, setUsages] = useState<LeaveUsageDisplay[] | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  async function fetchUsages() {
    if (!row.masterId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/leave/masters/${row.masterId}`);
      const data = await res.json() as { usages?: LeaveUsageDisplay[] };
      setUsages(data.usages ?? []);
    } finally {
      setLoading(false);
    }
  }

  async function handleCancel(usageId: string) {
    if (!confirm('이 연차 사용내역을 취소하시겠습니까?')) return;
    const res = await fetch(`/api/leave/usages/${usageId}`, { method: 'DELETE' });
    const data = await res.json() as { error?: string };
    if (!res.ok) {
      onToast(data.error ?? '취소 실패', 'error');
    } else {
      onToast('연차 사용내역이 취소되었습니다.', 'success');
      await fetchUsages();
    }
  }

  const totalMinutes = row.grantedMinutes + row.carriedMinutes;
  const remainMinutes = totalMinutes - row.usedMinutes;

  return (
    <div className="rounded-2xl border bg-white shadow-sm">
      <button
        onClick={() => { setOpen((p) => !p); if (!open) fetchUsages(); }}
        className="flex w-full items-center justify-between p-4 text-left"
      >
        <div className="flex min-w-0 items-center gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-2 font-semibold">
              {row.fullName}
              {statusBadge(row.employmentStatus)}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">{row.employeeNumber} · {row.department}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-4">
          <div className="hidden text-right sm:block">
            <p className="text-sm font-semibold">{fmtDays(totalMinutes)}일</p>
            <p className="text-xs text-muted-foreground">잔여 {fmtDays(remainMinutes)}일</p>
          </div>
          <ChevronDown className={`size-4 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {open && (
        <div className="border-t px-4 pb-4">
          {/* 요약 카드 (모바일) */}
          <div className="mt-3 grid grid-cols-3 gap-2 sm:hidden">
            {[
              { label: '기본', val: fmtDays(row.grantedMinutes) + '일' },
              { label: '이월', val: fmtDays(row.carriedMinutes) + '일' },
              { label: '잔여', val: fmtDays(remainMinutes) + '일' },
            ].map(({ label, val }) => (
              <div key={label} className="rounded-xl bg-slate-50 p-3 text-center">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="mt-1 font-semibold">{val}</p>
              </div>
            ))}
          </div>

          {/* 요약 (데스크톱) */}
          <div className="mt-3 hidden gap-4 sm:flex">
            {[
              { label: '기본 부여', val: fmtDays(row.grantedMinutes), sub: formatHours(row.grantedMinutes) },
              { label: '이월', val: fmtDays(row.carriedMinutes), sub: formatHours(row.carriedMinutes) },
              { label: '총 연차', val: fmtDays(totalMinutes), sub: formatHours(totalMinutes) },
              { label: '사용', val: fmtDays(row.usedMinutes), sub: formatHours(row.usedMinutes) },
              { label: '잔여', val: fmtDays(remainMinutes), sub: formatHours(remainMinutes), accent: remainMinutes < 0 },
            ].map(({ label, val, sub, accent }) => (
              <div key={label} className={`rounded-xl px-4 py-2 ${accent ? 'bg-rose-50' : 'bg-slate-50'}`}>
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className={`mt-0.5 font-semibold ${accent ? 'text-rose-700' : ''}`}>{val}일</p>
                <p className="text-xs text-muted-foreground">{sub}</p>
              </div>
            ))}
          </div>

          {/* 버튼 */}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => onMasterSet(row)}>
              <CalendarDays className="size-4" />
              {row.masterId ? '연차 설정 수정' : '연차 마스터 설정'}
            </Button>
            {row.masterId && (
              <Button size="sm" onClick={() => onUsageRegister(row, null)}>
                <Plus className="size-4" />
                연차 사용 등록
              </Button>
            )}
          </div>

          {/* 사용내역 */}
          {row.masterId && (
            <div className="mt-3">
              {loading ? (
                <p className="text-sm text-muted-foreground">불러오는 중...</p>
              ) : usages === null ? null : usages.length === 0 ? (
                <p className="text-sm text-muted-foreground">사용내역이 없습니다.</p>
              ) : (
                <div className="space-y-1">
                  {usages.map((u) => (
                    <div key={u.id} className={`flex items-center justify-between rounded-xl px-3 py-2 text-sm ${u.cancelledAt ? 'bg-slate-50 opacity-50' : 'bg-white border'}`}>
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-xs text-muted-foreground">{u.leaveDate}</span>
                        <Badge variant="outline">{LEAVE_TYPE_META[u.leaveType].label}</Badge>
                        <span>{formatDays(u.minutes)}</span>
                        {u.cancelledAt && <Badge variant="secondary" className="text-xs">취소됨</Badge>}
                      </div>
                      {!u.cancelledAt && (
                        <div className="flex gap-1">
                          <button
                            onClick={() => onUsageRegister(row, u)}
                            className="rounded p-1 text-muted-foreground hover:text-foreground"
                          >
                            <Pencil className="size-3.5" />
                          </button>
                          <button
                            onClick={() => handleCancel(u.id)}
                            className="rounded p-1 text-muted-foreground hover:text-rose-600"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── 메인 컴포넌트 ────────────────────────────────────────────────────────────

export default function AdminLeaveManager() {
  const currentYear = new Date().getFullYear();
  const yearOptions = [currentYear - 1, currentYear, currentYear + 1, currentYear + 2];

  const [year, setYear] = useState(currentYear);
  const [rows, setRows] = useState<LeaveStatusRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ACTIVE');
  const [includeResigned, setIncludeResigned] = useState(false);

  // 다이얼로그 상태
  const [masterDialogRow, setMasterDialogRow] = useState<LeaveStatusRow | null>(null);
  const [usageDialogInfo, setUsageDialogInfo] = useState<{
    row: LeaveStatusRow; editUsage: LeaveUsageDisplay | null;
  } | null>(null);
  const [usageHistoryRow, setUsageHistoryRow] = useState<LeaveStatusRow | null>(null);


  // Toast
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/leave/masters?year=${year}&includeResigned=${includeResigned}`,
      );
      const data = await res.json() as { rows?: LeaveStatusRow[] };
      setRows(data.rows ?? []);
    } finally {
      setLoading(false);
    }
  }, [year, includeResigned]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const departments = Array.from(new Set(rows.map((r) => r.department))).sort();

  const filtered = rows.filter((r) => {
    const q = search.toLowerCase();
    const matchSearch = !q || r.fullName.includes(q) || r.employeeNumber.toLowerCase().includes(q);
    const matchDept = deptFilter === 'ALL' || r.department === deptFilter;
    const matchStatus = statusFilter === 'ALL' || r.employmentStatus === statusFilter;
    return matchSearch && matchDept && matchStatus;
  });

  function handleToast(msg: string, type: 'success' | 'error') {
    setToast({ msg, type });
  }

  async function handleMasterSuccess(msg: string) {
    handleToast(msg, 'success');
    await fetchData();
  }

  async function handleUsageSuccess(msg: string) {
    handleToast(msg, 'success');
    await fetchData();
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">연차관리</h1>
        <p className="mt-1 text-sm text-muted-foreground">연도별 연차 마스터 및 승인 완료된 연차 사용내역을 관리합니다.</p>
      </div>

      {/* 연도 선택 + 필터 */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-end gap-3">
            {/* 연도 탭 */}
            <div className="flex gap-1 rounded-xl bg-muted p-1">
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

            <div className="flex-1" />

            {/* 검색 */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="사번·성명 검색"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-48 pl-9"
              />
            </div>

            {/* 부서 필터 */}
            <Select value={deptFilter} onValueChange={(v) => setDeptFilter(v ?? 'ALL')}>
              <SelectTrigger className="w-36">
                <SelectValue placeholder="부서" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">전체 부서</SelectItem>
                {departments.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
              </SelectContent>
            </Select>

            {/* 재직상태 필터 */}
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v ?? 'ALL')}>
              <SelectTrigger className="w-32">
                <SelectValue placeholder="상태" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">전체 상태</SelectItem>
                <SelectItem value="ACTIVE">재직</SelectItem>
                <SelectItem value="LEAVE">휴직</SelectItem>
                {includeResigned && <SelectItem value="RESIGNED">퇴사</SelectItem>}
              </SelectContent>
            </Select>

            {/* 퇴사자 포함 */}
            <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={includeResigned}
                onChange={(e) => { setIncludeResigned(e.target.checked); if (!e.target.checked && statusFilter === 'RESIGNED') setStatusFilter('ALL'); }}
                className="rounded"
              />
              퇴사자 포함
            </label>
          </div>
        </CardContent>
      </Card>

      {/* Desktop Table */}
      <Card className="hidden border-0 shadow-sm lg:block">
        <CardHeader className="pb-0">
          <CardTitle className="text-base">
            {year}년 연차 현황
            <Badge variant="secondary" className="ml-2">{filtered.length}명</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-3">
          {loading ? (
            <p className="py-10 text-center text-sm text-muted-foreground">불러오는 중...</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>사번</TableHead>
                  <TableHead>성명</TableHead>
                  <TableHead>부서</TableHead>
                  <TableHead className="text-right">기본 부여</TableHead>
                  <TableHead className="text-right">이월</TableHead>
                  <TableHead className="text-right">총 연차</TableHead>
                  <TableHead className="text-right">사용</TableHead>
                  <TableHead className="text-right">잔여</TableHead>
                  <TableHead>상태</TableHead>
                  <TableHead className="text-right">관리</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="py-10 text-center text-muted-foreground">
                      조건에 맞는 직원이 없습니다.
                    </TableCell>
                  </TableRow>
                ) : filtered.map((row) => {
                  const total = row.grantedMinutes + row.carriedMinutes;
                  const remain = total - row.usedMinutes;
                  const noMaster = !row.masterId;
                  return (
                    <TableRow key={row.employeeId} className={noMaster ? 'bg-slate-50/50' : ''}>
                      <TableCell className="font-mono text-xs">{row.employeeNumber}</TableCell>
                      <TableCell className="font-medium">{row.fullName}</TableCell>
                      <TableCell className="text-muted-foreground">{row.department}</TableCell>
                      <TableCell className="text-right">
                        {noMaster ? <span className="text-muted-foreground">—</span> : `${fmtDays(row.grantedMinutes)}일`}
                      </TableCell>
                      <TableCell className="text-right">
                        {noMaster ? <span className="text-muted-foreground">—</span> : `${fmtDays(row.carriedMinutes)}일`}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {noMaster ? <span className="text-muted-foreground">미설정</span> : `${fmtDays(total)}일`}
                      </TableCell>
                      <TableCell className="text-right">
                        {noMaster ? <span className="text-muted-foreground">—</span> : `${fmtDays(row.usedMinutes)}일`}
                      </TableCell>
                      <TableCell className={`text-right font-semibold ${remain < 0 ? 'text-rose-600' : ''}`}>
                        {noMaster ? <span className="text-muted-foreground">—</span> : `${fmtDays(remain)}일`}
                      </TableCell>
                      <TableCell>{statusBadge(row.employmentStatus)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 text-xs"
                            onClick={() => setMasterDialogRow(row)}
                          >
                            {noMaster ? '연차설정' : '설정수정'}
                          </Button>
                          {row.masterId && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 px-2 text-xs"
                                onClick={() => setUsageHistoryRow(row)}
                              >
                                <CalendarDays className="size-3" />
                                사용내역
                              </Button>
                              <Button
                              size="sm"
                              className="h-7 px-2 text-xs"
                              onClick={() => setUsageDialogInfo({ row, editUsage: null })}
                            >
                              <Plus className="size-3" />
                              등록
                            </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Mobile / Tablet Card List */}
      <div className="space-y-3 lg:hidden">
        {loading ? (
          <p className="py-10 text-center text-sm text-muted-foreground">불러오는 중...</p>
        ) : filtered.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">조건에 맞는 직원이 없습니다.</p>
        ) : filtered.map((row) => (
          <EmployeeLeavePanel
            key={row.employeeId}
            row={row}
            year={year}
            onMasterSet={setMasterDialogRow}
            onUsageRegister={(r, u) => setUsageDialogInfo({ row: r, editUsage: u })}
            onToast={handleToast}
          />
        ))}
      </div>

      {/* Dialogs */}
      <MasterDialog
        open={!!masterDialogRow}
        onClose={() => setMasterDialogRow(null)}
        row={masterDialogRow}
        year={year}
        onSuccess={handleMasterSuccess}
      />
      <LeaveUsageHistoryDialog
        open={!!usageHistoryRow}
        onClose={() => setUsageHistoryRow(null)}
        row={usageHistoryRow}
        year={year}
      />
      <UsageDialog
        open={!!usageDialogInfo}
        onClose={() => setUsageDialogInfo(null)}
        employeeId={usageDialogInfo?.row.employeeId ?? ''}
        employeeName={`${usageDialogInfo?.row.fullName ?? ''} (${usageDialogInfo?.row.employeeNumber ?? ''})`}
        year={year}
        editUsage={usageDialogInfo?.editUsage ?? null}
        onSuccess={handleUsageSuccess}
      />

      {/* Toast */}
      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
