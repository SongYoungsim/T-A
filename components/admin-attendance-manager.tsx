'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Search, ChevronDown, ChevronRight, Calendar, Pencil, X, Check,
  AlertCircle, ArrowLeft, ArrowRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  ATTENDANCE_STATUS_LABEL,
  formatTimeKST,
  minuteToTimeString,
} from '@/lib/hr-types';
import type { AttendanceListRow, AttendanceStatus } from '@/lib/hr-types';

// ─── Status Badge ─────────────────────────────────────────────────────────────

function StatusBadge({ row }: { row: AttendanceListRow }) {
  // 연차 우선
  if (row.leaveType) {
    const lbl = row.leaveType === 'FULL_DAY' ? '1일'
      : row.leaveType === 'HALF_DAY' ? '반차'
      : row.leaveType === 'QUARTER_DAY' ? '반반차' : '시차';
    return <Badge variant="secondary">{lbl}</Badge>;
  }
  if (!row.representativeStatus) {
    return <Badge variant="outline">미출근</Badge>;
  }
  const lbl = ATTENDANCE_STATUS_LABEL[row.representativeStatus] ?? row.representativeStatus;
  const variant =
    row.representativeStatus === 'LATE' ? 'destructive'
    : row.representativeStatus === 'EARLY_LEAVE' ? 'destructive'
    : row.representativeStatus === 'NORMAL' ? 'outline'
    : 'secondary';

  return (
    <div className="flex flex-wrap gap-1">
      <Badge variant={variant}>{lbl}</Badge>
      {row.isLate && row.isEarlyLeave && row.representativeStatus !== 'EARLY_LEAVE' && (
        <Badge variant="outline" className="text-orange-600">조퇴</Badge>
      )}
    </div>
  );
}

// ─── 보정 Dialog ──────────────────────────────────────────────────────────────

type EditDialogProps = {
  row: AttendanceListRow;
  onClose: () => void;
  onSaved: () => void;
};

function EditDialog({ row, onClose, onSaved }: EditDialogProps) {
  const [checkIn, setCheckIn] = useState(
    row.checkInAt ? formatTimeKST(row.checkInAt) : ''
  );
  const [checkOut, setCheckOut] = useState(
    row.checkOutAt ? formatTimeKST(row.checkOutAt) : ''
  );
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSave() {
    if (!reason.trim()) { setError('수정 사유를 입력해주세요.'); return; }
    setSaving(true);
    setError('');

    // HH:MM → ISO 변환 (해당 workDate KST 기준)
    function toISO(time: string): string | null {
      if (!time) return null;
      // workDate YYYY-MM-DD + time HH:MM → KST로 UTC 변환
      const dt = new Date(`${row.workDate}T${time}:00+09:00`);
      return isNaN(dt.getTime()) ? null : dt.toISOString();
    }

    const body = {
      checkInAt: toISO(checkIn),
      checkOutAt: toISO(checkOut),
      reason: reason.trim(),
    };

    try {
      let res: Response;
      if (row.attendanceId) {
        res = await fetch(`/api/attendance/${row.attendanceId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
      } else {
        res = await fetch(`/api/attendance/new`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            employeeId: row.employeeId,
            workDate: row.workDate,
            ...body,
          }),
        });
      }

      if (res.ok) {
        onSaved();
        onClose();
      } else {
        const data = await res.json() as { error?: string };
        setError(data.error ?? '저장에 실패했습니다.');
      }
    } catch {
      setError('네트워크 오류가 발생했습니다.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>출퇴근 보정</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <p className="text-sm font-medium">{row.fullName}</p>
            <p className="text-xs text-muted-foreground">{row.workDate} · {row.department}</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="edit-checkin">출근시간</Label>
              <Input id="edit-checkin" type="time" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} />
              <p className="text-xs text-muted-foreground">기준 {minuteToTimeString(row.standardStartMinute)}</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-checkout">퇴근시간</Label>
              <Input id="edit-checkout" type="time" value={checkOut} onChange={(e) => setCheckOut(e.target.value)} />
              <p className="text-xs text-muted-foreground">기준 {minuteToTimeString(row.standardEndMinute)}</p>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-reason">수정 사유 <span className="text-rose-500">*</span></Label>
            <Textarea
              id="edit-reason"
              placeholder="예: 출근 버튼 미등록 확인"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
            />
          </div>
          {error && (
            <div className="flex items-center gap-2 text-sm text-rose-600">
              <AlertCircle className="size-4" />{error}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>취소</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? '저장 중...' : '저장'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── 메인 컴포넌트 ────────────────────────────────────────────────────────────

type ViewMode = 'monthly' | 'daily';

export default function AdminAttendanceManager() {
  const now = new Date();
  const kstYear = parseInt(
    new Intl.DateTimeFormat('en', { year: 'numeric', timeZone: 'Asia/Seoul' }).format(now), 10
  );
  const kstMonth = parseInt(
    new Intl.DateTimeFormat('en', { month: 'numeric', timeZone: 'Asia/Seoul' }).format(now), 10
  );
  const kstDate = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(now);

  const [viewMode, setViewMode] = useState<ViewMode>('monthly');
  const [year, setYear] = useState(kstYear);
  const [month, setMonth] = useState(kstMonth);
  const [selectedDate, setSelectedDate] = useState(kstDate);
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState<AttendanceStatus | ''>('');
  const [rows, setRows] = useState<AttendanceListRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [editRow, setEditRow] = useState<AttendanceListRow | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      let url: string;
      if (viewMode === 'monthly') {
        url = `/api/attendance/admin-monthly?year=${year}&month=${month}`;
        if (statusFilter) url += `&status=${statusFilter}`;
      } else {
        url = `/api/attendance/admin-day?date=${selectedDate}`;
      }
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json() as { rows: AttendanceListRow[] };
      setRows(data.rows);
    } finally {
      setLoading(false);
    }
  }, [viewMode, year, month, selectedDate, statusFilter]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // 필터링 (클라이언트 사이드)
  const filtered = rows.filter((r) => {
    if (search && !r.fullName.includes(search) && !r.employeeNumber.includes(search)) return false;
    if (deptFilter !== 'ALL' && r.department !== deptFilter) return false;
    return true;
  });

  const departments = ['ALL', ...Array.from(new Set(rows.map((r) => r.department))).sort()];

  function prevMonth() {
    if (month === 1) { setYear(y => y - 1); setMonth(12); }
    else setMonth(m => m - 1);
  }
  function nextMonth() {
    if (month === 12) { setYear(y => y + 1); setMonth(1); }
    else setMonth(m => m + 1);
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">근태관리</h1>
        <p className="mt-1 text-sm text-muted-foreground">직원별 출퇴근 기록을 조회하고 보정합니다.</p>
      </div>

      {/* 뷰모드 탭 */}
      <div className="flex gap-1 rounded-xl bg-muted p-1 w-fit">
        {(['monthly', 'daily'] as ViewMode[]).map((m) => (
          <button
            key={m}
            onClick={() => setViewMode(m)}
            className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${
              m === viewMode ? 'bg-white text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {m === 'monthly' ? '월간' : '일별'}
          </button>
        ))}
      </div>

      {/* 기간 선택 */}
      {viewMode === 'monthly' ? (
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={prevMonth}><ArrowLeft className="size-4" /></Button>
          <span className="min-w-20 text-center text-sm font-semibold">{year}년 {month}월</span>
          <Button variant="ghost" size="icon" onClick={nextMonth}><ArrowRight className="size-4" /></Button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <Calendar className="size-4 text-muted-foreground" />
          <Input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="w-40"
          />
        </div>
      )}

      {/* 필터 */}
      <div className="flex flex-wrap gap-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="이름 또는 사번"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 w-44"
          />
        </div>
        <select
          value={deptFilter}
          onChange={(e) => setDeptFilter(e.target.value)}
          className="rounded-md border bg-background px-3 py-2 text-sm"
        >
          {departments.map((d) => (
            <option key={d} value={d}>{d === 'ALL' ? '전체 부서' : d}</option>
          ))}
        </select>
        {viewMode === 'monthly' && (
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as AttendanceStatus | '')}
            className="rounded-md border bg-background px-3 py-2 text-sm"
          >
            <option value="">전체 상태</option>
            {(Object.entries(ATTENDANCE_STATUS_LABEL) as [AttendanceStatus, string][]).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        )}
      </div>

      {/* 테이블 */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="flex-row items-center justify-between py-3">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            {loading ? '불러오는 중...' : `${filtered.length}건`}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {/* Desktop */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead className="border-b text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">일자</th>
                  <th className="px-4 py-3 text-left font-medium">성명</th>
                  <th className="px-4 py-3 text-left font-medium">부서</th>
                  <th className="px-4 py-3 text-center font-medium">기준출근</th>
                  <th className="px-4 py-3 text-center font-medium">실제출근</th>
                  <th className="px-4 py-3 text-center font-medium">기준퇴근</th>
                  <th className="px-4 py-3 text-center font-medium">실제퇴근</th>
                  <th className="px-4 py-3 text-left font-medium">상태</th>
                  <th className="px-4 py-3 text-left font-medium">경로</th>
                  <th className="px-4 py-3 text-center font-medium">관리</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="py-10 text-center text-sm text-muted-foreground">
                      {loading ? '불러오는 중...' : '데이터가 없습니다.'}
                    </td>
                  </tr>
                ) : filtered.map((row) => (
                  <tr key={`${row.employeeId}-${row.workDate}`} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-3 font-mono text-xs">{row.workDate}</td>
                    <td className="px-4 py-3 font-medium">{row.fullName}</td>
                    <td className="px-4 py-3 text-muted-foreground">{row.department}</td>
                    <td className="px-4 py-3 text-center font-mono text-xs">{minuteToTimeString(row.standardStartMinute)}</td>
                    <td className={`px-4 py-3 text-center font-mono text-xs ${row.isLate ? 'text-rose-600 font-semibold' : ''}`}>
                      {row.checkInAt ? formatTimeKST(row.checkInAt) : '—'}
                    </td>
                    <td className="px-4 py-3 text-center font-mono text-xs">{minuteToTimeString(row.standardEndMinute)}</td>
                    <td className={`px-4 py-3 text-center font-mono text-xs ${row.isEarlyLeave ? 'text-orange-600 font-semibold' : ''}`}>
                      {row.checkOutAt ? formatTimeKST(row.checkOutAt) : '—'}
                    </td>
                    <td className="px-4 py-3"><StatusBadge row={row} /></td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {row.source === 'ADMIN_EDIT' ? '보정' : row.source === 'WEB' ? 'WEB' : row.source ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditRow(row)}
                        className="h-7 px-2 text-xs"
                      >
                        <Pencil className="size-3" />보정
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards */}
          <div className="space-y-2 p-3 md:hidden">
            {filtered.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                {loading ? '불러오는 중...' : '데이터가 없습니다.'}
              </p>
            ) : filtered.map((row) => (
              <div key={`${row.employeeId}-${row.workDate}`} className="rounded-xl border p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-semibold">{row.fullName}</p>
                      <StatusBadge row={row} />
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">{row.department} · {row.workDate}</p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setEditRow(row)} className="h-7 px-2">
                    <Pencil className="size-3" />
                  </Button>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  <span className="text-muted-foreground">기준출근</span>
                  <span className="font-mono">{minuteToTimeString(row.standardStartMinute)}</span>
                  <span className="text-muted-foreground">실제출근</span>
                  <span className={`font-mono ${row.isLate ? 'text-rose-600 font-semibold' : ''}`}>
                    {row.checkInAt ? formatTimeKST(row.checkInAt) : '—'}
                  </span>
                  <span className="text-muted-foreground">기준퇴근</span>
                  <span className="font-mono">{minuteToTimeString(row.standardEndMinute)}</span>
                  <span className="text-muted-foreground">실제퇴근</span>
                  <span className={`font-mono ${row.isEarlyLeave ? 'text-orange-600 font-semibold' : ''}`}>
                    {row.checkOutAt ? formatTimeKST(row.checkOutAt) : '—'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* 보정 Dialog */}
      {editRow && (
        <EditDialog
          row={editRow}
          onClose={() => setEditRow(null)}
          onSaved={fetchData}
        />
      )}
    </div>
  );
}
