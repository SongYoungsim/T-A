'use client';

import { useState, useEffect, useCallback, useTransition } from 'react';
import { LogIn, LogOut, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatTimeKST, minuteToTimeString, ATTENDANCE_STATUS_LABEL } from '@/lib/hr-types';
import type { TodayAttendance, AttendanceStatus } from '@/lib/hr-types';

type Props = {
  employeeName: string;
  standardStartMinute: number;
  standardEndMinute: number;
};

type ToastState = { type: 'success' | 'error'; message: string } | null;

function Toast({ toast, onClose }: { toast: ToastState; onClose: () => void }) {
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(onClose, 4000);
    return () => clearTimeout(t);
  }, [toast, onClose]);

  if (!toast) return null;

  return (
    <div
      className={`flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium shadow-lg ${
        toast.type === 'success'
          ? 'bg-emerald-600 text-white'
          : 'bg-rose-600 text-white'
      }`}
    >
      {toast.type === 'success' ? (
        <CheckCircle2 className="size-4 shrink-0" />
      ) : (
        <AlertCircle className="size-4 shrink-0" />
      )}
      {toast.message}
    </div>
  );
}

function StatusBadge({ status, isLate, isEarlyLeave }: {
  status: AttendanceStatus | null;
  isLate: boolean;
  isEarlyLeave: boolean;
}) {
  if (!status) return <Badge className="bg-white/15 text-white hover:bg-white/15">미출근</Badge>;
  const label = ATTENDANCE_STATUS_LABEL[status] ?? status;
  const variant =
    status === 'LATE' ? 'bg-amber-400 text-amber-950'
    : status === 'EARLY_LEAVE' ? 'bg-orange-400 text-orange-950'
    : status === 'NORMAL' ? 'bg-emerald-400 text-emerald-950'
    : 'bg-white/20 text-white';

  return (
    <div className="flex items-center gap-1">
      <span className={`rounded-lg px-2.5 py-0.5 text-xs font-semibold ${variant}`}>{label}</span>
      {isLate && isEarlyLeave && status !== 'EARLY_LEAVE' && (
        <span className="rounded-lg bg-orange-400 px-2 py-0.5 text-xs font-semibold text-orange-950">조퇴</span>
      )}
    </div>
  );
}

/**
 * AttendanceCard — 출퇴근 버튼 및 오늘 근태 표시
 * - 출근 전: [출근] 활성, [퇴근] 비활성
 * - 출근 후: [출근] 비활성, [퇴근] 활성
 * - 퇴근 후: 두 버튼 비활성
 * - 클릭 시 Loading 상태, 중복 클릭 방지, 즉각 갱신
 */
export function AttendanceCard({ employeeName, standardStartMinute, standardEndMinute }: Props) {
  const [today, setToday] = useState<TodayAttendance | null | undefined>(undefined); // undefined = loading
  const [toast, setToast] = useState<ToastState>(null);
  const [isPending, startTransition] = useTransition();

  // 현재 KST 날짜/시각 표시용
  const [nowLabel, setNowLabel] = useState('');
  useEffect(() => {
    function update() {
      const d = new Date();
      const kst = new Intl.DateTimeFormat('ko-KR', {
        timeZone: 'Asia/Seoul',
        year: 'numeric', month: 'long', day: 'numeric', weekday: 'long',
      }).format(d);
      setNowLabel(kst);
    }
    update();
    const t = setInterval(update, 30_000);
    return () => clearInterval(t);
  }, []);

  // 오늘 근태 조회
  const fetchToday = useCallback(async () => {
    try {
      const res = await fetch('/api/attendance/today', { cache: 'no-store' });
      if (!res.ok) { setToday(null); return; }
      const data = await res.json() as { today: TodayAttendance | null };
      setToday(data.today);
    } catch {
      setToday(null);
    }
  }, []);

  useEffect(() => { fetchToday(); }, [fetchToday]);

  const showToast = useCallback((type: 'success' | 'error', message: string) => {
    setToast({ type, message });
  }, []);

  async function handleClockIn() {
    startTransition(async () => {
      try {
        const res = await fetch('/api/attendance/clock-in', { method: 'POST' });
        const data = await res.json() as { ok?: boolean; message?: string; error?: string };
        if (res.ok && data.ok) {
          showToast('success', data.message ?? '출근이 등록되었습니다.');
          await fetchToday();
        } else {
          showToast('error', data.error ?? '출근 등록에 실패했습니다.');
        }
      } catch {
        showToast('error', '네트워크 오류가 발생했습니다.');
      }
    });
  }

  async function handleClockOut() {
    startTransition(async () => {
      try {
        const res = await fetch('/api/attendance/clock-out', { method: 'POST' });
        const data = await res.json() as { ok?: boolean; message?: string; error?: string };
        if (res.ok && data.ok) {
          showToast('success', '퇴근이 등록되었습니다.');
          await fetchToday();
        } else {
          showToast('error', data.error ?? '퇴근 등록에 실패했습니다.');
        }
      } catch {
        showToast('error', '네트워크 오류가 발생했습니다.');
      }
    });
  }

  const hasClockIn = !!today?.checkInAt;
  const hasClockOut = !!today?.checkOutAt;
  const isLoading = today === undefined || isPending;

  const stdStart = minuteToTimeString(standardStartMinute);
  const stdEnd = minuteToTimeString(standardEndMinute);

  return (
    <div className="overflow-hidden rounded-2xl bg-[#1e3353] text-white shadow-lg">
      <div className="p-5 sm:p-7">
        {/* 날짜 & 상태 */}
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-blue-200">{nowLabel}</p>
            <h2 className="mt-1 text-xl font-bold">
              {employeeName}님
            </h2>
          </div>
          {today !== undefined && (
            <StatusBadge
              status={today?.representativeStatus ?? null}
              isLate={today?.isLate ?? false}
              isEarlyLeave={today?.isEarlyLeave ?? false}
            />
          )}
        </div>

        {/* 출퇴근 시간 표시 */}
        <div className="mt-5 grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-white/8 p-4">
            <p className="text-xs text-slate-300">기준출근 {stdStart}</p>
            <p className="mt-1 text-xl font-bold tabular-nums">
              {isLoading ? (
                <Loader2 className="size-5 animate-spin text-blue-300" />
              ) : today?.checkInAt ? (
                formatTimeKST(today.checkInAt)
              ) : '--:--'}
            </p>
          </div>
          <div className="rounded-2xl bg-white/8 p-4">
            <p className="text-xs text-slate-300">기준퇴근 {stdEnd}</p>
            <p className="mt-1 text-xl font-bold tabular-nums">
              {isLoading ? (
                <Loader2 className="size-5 animate-spin text-blue-300" />
              ) : today?.checkOutAt ? (
                formatTimeKST(today.checkOutAt)
              ) : '--:--'}
            </p>
          </div>
        </div>

        {/* 출근/퇴근 버튼 */}
        <div className="mt-4 grid grid-cols-2 gap-3">
          <Button
            id="btn-clock-in"
            onClick={handleClockIn}
            disabled={hasClockIn || isLoading}
            className="h-16 bg-blue-500 text-base font-semibold text-white hover:bg-blue-400 disabled:opacity-40"
          >
            {isPending && !hasClockIn ? (
              <Loader2 className="size-5 animate-spin" />
            ) : (
              <LogIn className="size-5" />
            )}
            출근
          </Button>
          <Button
            id="btn-clock-out"
            onClick={handleClockOut}
            disabled={!hasClockIn || hasClockOut || isLoading}
            variant="secondary"
            className="h-16 text-base font-semibold disabled:opacity-40"
          >
            {isPending && hasClockIn && !hasClockOut ? (
              <Loader2 className="size-5 animate-spin" />
            ) : (
              <LogOut className="size-5" />
            )}
            퇴근
          </Button>
        </div>

        {/* 안내 메시지 */}
        {toast && (
          <div className="mt-3">
            <Toast toast={toast} onClose={() => setToast(null)} />
          </div>
        )}
        {!toast && (
          <p className="mt-3 text-center text-xs text-slate-400">
            {!hasClockIn
              ? '출근 버튼을 눌러 오늘 근태를 기록하세요.'
              : !hasClockOut
              ? `출근 완료 · 퇴근 시 퇴근 버튼을 눌러주세요.`
              : '오늘 출퇴근이 모두 완료되었습니다.'}
          </p>
        )}
      </div>
    </div>
  );
}
