'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { AlertCircle, Clock, CheckCircle2, ShieldAlert } from 'lucide-react';
import type { AttendanceListRow } from '@/lib/hr-types';
import { formatTimeKST, minuteToTimeString } from '@/lib/hr-types';

interface AttendanceEditDialogProps {
  row: AttendanceListRow | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function AttendanceEditDialog({ row, isOpen, onClose, onSuccess }: AttendanceEditDialogProps) {
  const [checkInTime, setCheckInTime] = useState<string>('');
  const [checkOutTime, setCheckOutTime] = useState<string>('');
  const [reason, setReason] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 모달이 열릴 때 초기화
  const handleOpenChange = (open: boolean) => {
    if (open && row) {
      setCheckInTime(row.checkInAt ? formatTimeKST(row.checkInAt) : '');
      setCheckOutTime(row.checkOutAt ? formatTimeKST(row.checkOutAt) : '');
      setReason('');
      setError(null);
    } else {
      onClose();
    }
  };

  if (!row) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) {
      setError('보정 사유를 반드시 입력해주세요 (Audit Log에 영구 기록됩니다).');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      // KST HH:MM -> ISO string 변환
      let checkInIso: string | null = null;
      let checkOutIso: string | null = null;

      if (checkInTime) {
        checkInIso = new Date(`${row.workDate}T${checkInTime}:00+09:00`).toISOString();
      }
      if (checkOutTime) {
        checkOutIso = new Date(`${row.workDate}T${checkOutTime}:00+09:00`).toISOString();
      }

      let res: Response;
      if (row.attendanceId) {
        // 기존 레코드 보정 PUT
        res = await fetch(`/api/attendance/${row.attendanceId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            checkInAt: checkInIso,
            checkOutAt: checkOutIso,
            reason: reason.trim(),
          }),
        });
      } else {
        // 새 출퇴근 등록 POST
        res = await fetch('/api/attendance/new', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            employeeId: row.employeeId,
            workDate: row.workDate,
            checkInAt: checkInIso,
            checkOutAt: checkOutIso,
            reason: reason.trim(),
          }),
        });
      }

      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error || '보정 처리에 실패했습니다.');
        return;
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err?.message || '네트워크 오류가 발생했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Clock className="size-5 text-primary" />
            근태 시간 보정
          </DialogTitle>
          <DialogDescription>
            {row.fullName} ({row.department}) · {row.workDate}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          {/* 기준시간 안내 */}
          <div className="rounded-lg bg-muted/60 p-3 text-xs space-y-1">
            <div className="flex justify-between">
              <span className="text-muted-foreground">개인 기준 출퇴근 시간:</span>
              <span className="font-semibold text-foreground">
                {minuteToTimeString(row.standardStartMinute)} ~ {minuteToTimeString(row.standardEndMinute)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">현재 상태:</span>
              <span className="font-semibold">
                {row.leaveType
                  ? `연차 (${row.leaveType})`
                  : row.representativeStatus ?? '미등록'}
              </span>
            </div>
          </div>

          {/* 에러 알림 */}
          {error && (
            <div className="flex items-center gap-2 rounded-lg bg-destructive/10 p-3 text-xs text-destructive">
              <AlertCircle className="size-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="checkInTime" className="text-xs font-semibold">
                출근 시간 (KST)
              </Label>
              <Input
                id="checkInTime"
                type="time"
                value={checkInTime}
                onChange={(e) => setCheckInTime(e.target.value)}
                className="font-mono text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="checkOutTime" className="text-xs font-semibold">
                퇴근 시간 (KST)
              </Label>
              <Input
                id="checkOutTime"
                type="time"
                value={checkOutTime}
                onChange={(e) => setCheckOutTime(e.target.value)}
                className="font-mono text-sm"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="reason" className="text-xs font-semibold flex items-center justify-between">
              <span>보정 사유 (필수)</span>
              <span className="text-[11px] text-muted-foreground font-normal">Audit Log에 기록됩니다</span>
            </Label>
            <Textarea
              id="reason"
              placeholder="예: 카드 단말기 태그 누락, 외근 후 직퇴 소명 확인 등"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              className="text-sm resize-none"
              required
            />
          </div>

          <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-3 text-xs text-amber-800 flex items-start gap-2">
            <ShieldAlert className="size-4 shrink-0 mt-0.5 text-amber-600" />
            <div>
              <p className="font-semibold">안내 사항</p>
              <p className="mt-0.5 text-amber-700">
                수정 시 원본 시간은 보존되며, 수정 관리자 정보와 사유가 감사 로그(Audit Log)에 영구 기록됩니다.
                5분 Grace Period 기준에 따라 상태가 자동 재판정됩니다.
              </p>
            </div>
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
              취소
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? '저장 중...' : '보정 저장'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
