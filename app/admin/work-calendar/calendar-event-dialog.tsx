'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Calendar, Trash2, AlertCircle } from 'lucide-react';
import type { CalendarDayType, EffectiveWorkday, WorkCalendarRow } from '@/lib/hr-types';
import { CALENDAR_DAY_TYPE_META } from '@/lib/hr-types';

interface CalendarEventDialogProps {
  isOpen: boolean;
  selectedDate: string;
  effectiveDay?: EffectiveWorkday | null;
  dbRecord?: WorkCalendarRow | null;
  onClose: () => void;
  onSuccess: () => void;
}

export function CalendarEventDialog({
  isOpen,
  selectedDate,
  effectiveDay,
  dbRecord,
  onClose,
  onSuccess,
}: CalendarEventDialogProps) {
  const [dayType, setDayType] = useState<CalendarDayType>('COMPANY_HOLIDAY');
  const [name, setName] = useState('');
  const [memo, setMemo] = useState('');
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      if (dbRecord) {
        setDayType(dbRecord.dayType);
        setName(dbRecord.name || '');
        setMemo(dbRecord.memo || '');
      } else if (effectiveDay) {
        setDayType(
          effectiveDay.dayType === 'WEEKEND' || effectiveDay.dayType === 'NORMAL_WORKDAY'
            ? 'COMPANY_HOLIDAY'
            : effectiveDay.dayType
        );
        setName(effectiveDay.name || '');
        setMemo(effectiveDay.memo || '');
      } else {
        setDayType('COMPANY_HOLIDAY');
        setName('');
        setMemo('');
      }
      setReason('');
      setError(null);
    }
  }, [isOpen, dbRecord, effectiveDay]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('명칭을 입력해주세요 (예: 회사 창립기념일, 대체근무 등).');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch('/api/calendar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: selectedDate,
          dayType,
          name: name.trim(),
          memo: memo.trim() || undefined,
          reason: reason.trim() || undefined,
        }),
      });

      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error || '저장에 실패했습니다.');
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

  const handleDelete = async () => {
    if (!confirm(`${selectedDate}의 예외 일정을 삭제하고 기본 달력으로 복구하시겠습니까?`)) {
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/calendar?date=${selectedDate}&reason=${encodeURIComponent('관리자 예외 삭제')}`,
        { method: 'DELETE' }
      );

      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error || '삭제에 실패했습니다.');
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
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Calendar className="size-5 text-primary" />
            근무일정 예외 설정
          </DialogTitle>
          <DialogDescription>
            {selectedDate} 일자의 근무일 판정 규칙을 등록하거나 수정합니다.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          {error && (
            <div className="flex items-center gap-2 rounded-lg bg-destructive/10 p-3 text-xs text-destructive">
              <AlertCircle className="size-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="dayType" className="text-xs font-semibold">
              캘린더 유형
            </Label>
            <select
              id="dayType"
              value={dayType}
              onChange={(e) => setDayType(e.target.value as CalendarDayType)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="COMPANY_HOLIDAY">회사 지정 휴무일 (휴일)</option>
              <option value="SUBSTITUTE_WORKDAY">대체근무일 (근무일)</option>
              <option value="PUBLIC_HOLIDAY">법정공휴일 (휴일)</option>
            </select>
            <p className="text-[11px] text-muted-foreground">
              {dayType === 'SUBSTITUTE_WORKDAY'
                ? '원래 주말/휴일이어도 출근 의무가 있는 근무일로 판정됩니다.'
                : '출근 의무가 없으며, 출퇴근 기록이 없어도 결근으로 판정되지 않습니다.'}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="name" className="text-xs font-semibold">
              일정 명칭 (필수)
            </Label>
            <Input
              id="name"
              placeholder="예: 회사 창립기념일, 설 연휴 대체근무 등"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="text-sm"
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="memo" className="text-xs font-semibold">
              메모 및 비고 (선택)
            </Label>
            <Input
              id="memo"
              placeholder="직원 안내용 메모 또는 관련 사내 공지 번호"
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              className="text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="reason" className="text-xs font-semibold">
              변경 사유 (Audit Log 기록)
            </Label>
            <Textarea
              id="reason"
              placeholder="예: 사내 취업규칙 개정에 따른 특별 휴무 지정"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              className="text-sm resize-none"
            />
          </div>

          <DialogFooter className="pt-2 sm:justify-between">
            {dbRecord ? (
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={handleDelete}
                disabled={isSubmitting}
                className="gap-1 text-xs"
              >
                <Trash2 className="size-3.5" />
                예외 삭제
              </Button>
            ) : (
              <div />
            )}
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={isSubmitting}>
                취소
              </Button>
              <Button type="submit" size="sm" disabled={isSubmitting}>
                {isSubmitting ? '저장 중...' : '저장'}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
