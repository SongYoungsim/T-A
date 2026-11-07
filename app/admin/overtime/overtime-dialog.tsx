'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, Clock, Calendar, CheckCircle2, Trash2 } from 'lucide-react';
import type { EmployeeRecord, OvertimeRecord, WorkType } from '@/lib/hr-types';
import { WORK_TYPE_META, formatDuration, timeStringToMinutes } from '@/lib/hr-types';

interface OvertimeDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  record?: OvertimeRecord | null;
  employees: EmployeeRecord[];
  initialDate?: string;
}

export function OvertimeDialog({
  isOpen,
  onClose,
  onSuccess,
  record,
  employees,
  initialDate,
}: OvertimeDialogProps) {
  const isEdit = Boolean(record);

  const [employeeId, setEmployeeId] = useState('');
  const [workDate, setWorkDate] = useState('');
  const [startTime, setStartTime] = useState('18:00');
  const [endTime, setEndTime] = useState('20:00');
  const [workDescription, setWorkDescription] = useState('');
  const [grantCompLeave, setGrantCompLeave] = useState(false);

  // 자동 판정 상태
  const [workType, setWorkType] = useState<WorkType>('OVERTIME');
  const [dayName, setDayName] = useState<string | null>(null);
  const [isDetermining, setIsDetermining] = useState(false);
  const [empError, setEmpError] = useState<string | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [showCancelPrompt, setShowCancelPrompt] = useState(false);

  // 폼 초기화
  useEffect(() => {
    if (record) {
      setEmployeeId(record.employeeId);
      setWorkDate(record.workDate);
      setStartTime(record.startedAt ?? record.startTime ?? '18:00');
      setEndTime(record.endedAt ?? record.endTime ?? '20:00');
      setWorkDescription(record.description ?? record.workDescription ?? '');
      setGrantCompLeave(Boolean(record.grantCompLeave));
      setWorkType(record.workType);
      setShowCancelPrompt(false);
      setCancelReason('');
      setError(null);
    } else {
      const today = initialDate || new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date());
      setEmployeeId(employees[0]?.id || '');
      setWorkDate(today);
      setStartTime('18:00');
      setEndTime('20:00');
      setWorkDescription('');
      setGrantCompLeave(false);
      setShowCancelPrompt(false);
      setCancelReason('');
      setError(null);
    }
  }, [record, isOpen, initialDate, employees]);

  // 날짜 또는 직원 변경 시 근무구분 자동판정 (Requirement 4, 5, 6, 24)
  useEffect(() => {
    if (!isOpen || !workDate) return;

    let isMounted = true;
    setIsDetermining(true);
    setEmpError(null);

    const query = new URLSearchParams({
      action: 'determine',
      date: workDate,
      ...(employeeId ? { employeeId } : {}),
    });

    fetch(`/api/overtime?${query.toString()}`)
      .then((res) => res.json())
      .then((data: any) => {
        if (!isMounted) return;
        setIsDetermining(false);
        if (data.ok) {
          const newWorkType: WorkType = data.workType;
          setWorkType(newWorkType);
          setDayName(data.dayName);

          // 평일로 변경되면 대체휴무 부여 옵션 자동 해제 (Requirement 24)
          if (newWorkType === 'OVERTIME') {
            setGrantCompLeave(false);
          }

          if (data.employeeError) {
            setEmpError(data.employeeError);
          }
        }
      })
      .catch(() => {
        if (isMounted) setIsDetermining(false);
      });

    return () => {
      isMounted = false;
    };
  }, [workDate, employeeId, isOpen]);

  // 분 단위 근무시간 계산 (Requirement 7, 8, 41)
  const durationInfo = (() => {
    if (!startTime || !endTime) return { minutes: 0, text: '-', isValid: false, err: '시간을 입력해주세요.' };
    const startM = timeStringToMinutes(startTime);
    const endM = timeStringToMinutes(endTime);

    if (startM < 0 || endM < 0) return { minutes: 0, text: '-', isValid: false, err: '올바른 시간 형식이 아닙니다.' };
    if (endM <= startM) {
      return {
        minutes: 0,
        text: '-',
        isValid: false,
        err: '종료시간은 시작시간보다 이후여야 합니다.',
      };
    }
    const diff = endM - startM;
    return {
      minutes: diff,
      text: `${formatDuration(diff)} (${diff}분)`,
      isValid: true,
      err: null,
    };
  })();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!employeeId) {
      setError('직원을 선택해주세요.');
      return;
    }
    if (!workDate) {
      setError('근무일자를 입력해주세요.');
      return;
    }
    if (!durationInfo.isValid) {
      setError(durationInfo.err || '시작 및 종료시간을 확인해주세요.');
      return;
    }
    if (!workDescription.trim()) {
      setError('업무내용을 입력해주세요.');
      return;
    }
    if (workDescription.trim().length < 2) {
      setError('업무내용을 구체적으로 입력해주세요.');
      return;
    }

    setIsSubmitting(true);
    try {
      const url = '/api/overtime';
      const method = isEdit ? 'PUT' : 'POST';
      const payload = isEdit
        ? {
            id: record!.id,
            workDate,
            startTime,
            endTime,
            workDescription: workDescription.trim(),
            grantCompLeave: workType === 'HOLIDAY_WORK' ? grantCompLeave : false,
          }
        : {
            employeeId,
            workDate,
            startTime,
            endTime,
            workDescription: workDescription.trim(),
            grantCompLeave: workType === 'HOLIDAY_WORK' ? grantCompLeave : false,
          };

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = (await res.json()) as any;
      if (!res.ok || !data.ok) {
        throw new Error(data.error || '저장 중 오류가 발생했습니다.');
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || '요청 처리 실패');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancelRecord = async () => {
    if (!record) return;
    if (!cancelReason.trim()) {
      setError('취소 사유를 입력해주세요.');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/overtime', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: record.id,
          reason: cancelReason.trim(),
        }),
      });
      const data = (await res.json()) as any;
      if (!res.ok || !data.ok) {
        throw new Error(data.error || '취소 처리 중 오류가 발생했습니다.');
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || '취소 실패');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold">
            {isEdit ? '연장근무 기록 수정' : '연장근무 등록'}
          </DialogTitle>
          <p className="text-xs text-muted-foreground">
            {isEdit
              ? '등록된 연장/휴일근무의 일시 및 내용을 수정합니다.'
              : '사내 승인이 완료된 연장근무 또는 휴일근무를 등록합니다.'}
          </p>
        </DialogHeader>

        {error && (
          <div className="flex items-start gap-2 rounded-lg bg-rose-50 p-3 text-xs text-rose-700 border border-rose-200">
            <AlertCircle className="size-4 shrink-0 mt-0.5" />
            <div className="flex-1 font-medium">{error}</div>
          </div>
        )}

        {empError && (
          <div className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-xs text-amber-800 border border-amber-200">
            <AlertCircle className="size-4 shrink-0 mt-0.5" />
            <div className="flex-1 font-medium">{empError}</div>
          </div>
        )}

        {showCancelPrompt ? (
          <div className="space-y-4 py-2">
            <div className="rounded-lg bg-rose-50 p-3 text-xs text-rose-800 border border-rose-200">
              <p className="font-semibold">⚠️ 연장근무 취소 안내</p>
              <p className="mt-1">
                이 기록은 즉시 취소 처리(Soft Delete)되며 통계에서 제외됩니다. 취소 내역은 감사 로그(Audit Log)에 영구 기록됩니다.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cancel-reason" className="text-xs font-semibold">
                취소 사유 (필수)
              </Label>
              <Input
                id="cancel-reason"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="예: 승인 취소, 오입력 등"
                className="text-xs"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowCancelPrompt(false)}
                disabled={isSubmitting}
              >
                돌아가기
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={handleCancelRecord}
                disabled={isSubmitting || !cancelReason.trim()}
              >
                {isSubmitting ? '처리 중...' : '확인 및 취소 실행'}
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 py-2">
            {/* 직원 선택 */}
            <div className="space-y-1.5">
              <Label htmlFor="employee" className="text-xs font-semibold">
                직원 <span className="text-rose-500">*</span>
              </Label>
              {isEdit ? (
                <div className="p-2.5 rounded-md bg-muted/50 text-xs font-medium border">
                  {record?.fullName} ({record?.employeeNumber}) · {record?.department}
                </div>
              ) : (
                <select
                  id="employee"
                  value={employeeId}
                  onChange={(e) => setEmployeeId(e.target.value)}
                  className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-xs shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  {employees
                    .filter((e) => e.employmentStatus === 'ACTIVE')
                    .map((emp) => (
                      <option key={emp.id} value={emp.id}>
                        {emp.fullName} ({emp.employeeNumber}) · {emp.department}
                      </option>
                    ))}
                </select>
              )}
            </div>

            {/* 근무일자 및 자동 근무구분 */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="work-date" className="text-xs font-semibold">
                  근무일자 <span className="text-rose-500">*</span>
                </Label>
                <Input
                  id="work-date"
                  type="date"
                  value={workDate}
                  onChange={(e) => setWorkDate(e.target.value)}
                  className="text-xs h-9"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold">근무구분</Label>
                  <span className="text-[10px] text-muted-foreground">자동 판정</span>
                </div>
                <div className="h-9 flex items-center px-2.5 rounded-md border bg-muted/40 text-xs">
                  {isDetermining ? (
                    <span className="text-xs text-muted-foreground animate-pulse">판정 중...</span>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <Badge
                        className={
                          workType === 'HOLIDAY_WORK'
                            ? 'bg-indigo-100 text-indigo-800 hover:bg-indigo-100 border-indigo-300 font-semibold'
                            : 'bg-blue-100 text-blue-800 hover:bg-blue-100 border-blue-300 font-semibold'
                        }
                      >
                        {WORK_TYPE_META[workType].label}
                      </Badge>
                      {dayName && (
                        <span className="text-[11px] text-muted-foreground truncate max-w-[100px]">
                          ({dayName})
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* 시작시간 및 종료시간 */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="start-time" className="text-xs font-semibold">
                  시작시간 <span className="text-rose-500">*</span>
                </Label>
                <Input
                  id="start-time"
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="text-xs h-9 font-mono"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="end-time" className="text-xs font-semibold">
                  종료시간 <span className="text-rose-500">*</span>
                </Label>
                <Input
                  id="end-time"
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="text-xs h-9 font-mono"
                  required
                />
              </div>
            </div>

            {/* 계산된 근무시간 표시 */}
            <div className="rounded-lg bg-blue-50/60 p-2.5 border border-blue-100 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 text-blue-900 font-medium">
                <Clock className="size-4 text-blue-600" />
                <span>계산된 실제 근무시간:</span>
              </div>
              <div className="font-mono font-bold text-blue-900">
                {durationInfo.isValid ? (
                  durationInfo.text
                ) : (
                  <span className="text-rose-600 text-[11px]">{durationInfo.err}</span>
                )}
              </div>
            </div>

            {/* 업무내용 */}
            <div className="space-y-1.5">
              <Label htmlFor="work-desc" className="text-xs font-semibold">
                업무내용 <span className="text-rose-500">*</span>
              </Label>
              <Input
                id="work-desc"
                value={workDescription}
                onChange={(e) => setWorkDescription(e.target.value)}
                placeholder="예: Demi Pro 양산 대응, 제품 출하 준비, 월말 재고조사"
                className="text-xs"
                required
              />
            </div>

            {/* 휴일근무인 경우에만 표시되는 대체휴무 옵션 (Requirement 16, 17, 42) */}
            {workType === 'HOLIDAY_WORK' && (
              <div className="rounded-lg border border-purple-200 bg-purple-50/50 p-3 text-xs text-purple-950 space-y-1.5">
                <label className="flex items-center gap-2 cursor-pointer font-semibold">
                  <input
                    type="checkbox"
                    checked={grantCompLeave}
                    onChange={(e) => setGrantCompLeave(e.target.checked)}
                    className="size-4 rounded text-purple-600 border-purple-300 focus:ring-purple-500"
                  />
                  <span>대체휴무 1일 부여 (Phase 7 연계)</span>
                </label>
                <p className="text-[11px] text-purple-700 pl-6">
                  휴일근무 시간에 상관없이 부여 시 1일이 부여됩니다. (실제 사용/차감은 Phase 7에서 처리)
                </p>
              </div>
            )}

            <DialogFooter className="flex items-center justify-between pt-2">
              {isEdit ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowCancelPrompt(true)}
                  className="text-rose-600 border-rose-200 hover:bg-rose-50 text-xs gap-1"
                >
                  <Trash2 className="size-3.5" />
                  기록 취소
                </Button>
              ) : (
                <div />
              )}
              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={isSubmitting}>
                  닫기
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={isSubmitting || !durationInfo.isValid}
                  className="bg-blue-600 hover:bg-blue-700 text-xs"
                >
                  {isSubmitting ? '저장 중...' : isEdit ? '수정 완료' : '등록'}
                </Button>
              </div>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
