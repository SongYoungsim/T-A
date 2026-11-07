'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Calendar, User, Clock, AlertTriangle } from 'lucide-react';
import type { EmployeeDailyDrilldown } from '@/lib/hr-types';
import { formatDuration } from '@/lib/hr-types';

interface EmployeeDrilldownDialogProps {
  employeeId: string | null;
  employeeName: string | null;
  year: number;
  month: number;
  isOpen: boolean;
  onClose: () => void;
}

export function EmployeeDrilldownDialog({
  employeeId,
  employeeName,
  year,
  month,
  isOpen,
  onClose,
}: EmployeeDrilldownDialogProps) {
  const [days, setDays] = useState<EmployeeDailyDrilldown[]>([]);
  const [employeeInfo, setEmployeeInfo] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && employeeId) {
      loadDrilldown();
    } else {
      setDays([]);
      setEmployeeInfo(null);
      setError(null);
    }
  }, [isOpen, employeeId, year, month]);

  const loadDrilldown = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/reports/drilldown?employeeId=${employeeId}&year=${year}&month=${month}`);
      const data = (await res.json()) as any;
      if (!res.ok) {
        setError(data.error || '상세 데이터를 불러올 수 없습니다.');
        return;
      }
      setEmployeeInfo(data.employee);
      setDays(data.days);
    } catch (e) {
      setError('서버와 통신 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-hidden p-0 flex flex-col">
        <DialogHeader className="border-b px-6 py-4 bg-muted/20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <User className="size-5" />
              </div>
              <div>
                <DialogTitle className="text-base font-bold flex items-center gap-2">
                  <span>{employeeName || employeeInfo?.fullName}</span>
                  <span className="text-xs font-normal text-muted-foreground">
                    ({employeeInfo?.department} · {employeeInfo?.jobTitle})
                  </span>
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground">
                  {year}년 {month}월 일별 출퇴근 및 근태 내역 상세 (기준: {employeeInfo?.standardStartMinute ? `${Math.floor(employeeInfo.standardStartMinute / 60)}:00` : '09:00'} ~ {employeeInfo?.standardEndMinute ? `${Math.floor(employeeInfo.standardEndMinute / 60)}:00` : '18:00'})
                </DialogDescription>
              </div>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-16 text-xs text-muted-foreground">
              <Loader2 className="size-5 animate-spin mr-2" /> 상세 근태 데이터를 불러오는 중...
            </div>
          ) : error ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-700">
              {error}
            </div>
          ) : (
            <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
              <Table>
                <TableHeader className="bg-muted/40 sticky top-0 z-10">
                  <TableRow className="text-xs">
                    <TableHead className="w-24">일자</TableHead>
                    <TableHead className="w-14 text-center">요일</TableHead>
                    <TableHead className="w-24">근무구분</TableHead>
                    <TableHead className="w-20 text-center">출근</TableHead>
                    <TableHead className="w-20 text-center">퇴근</TableHead>
                    <TableHead className="w-24 text-center">근태상태</TableHead>
                    <TableHead className="w-20 text-center">연차</TableHead>
                    <TableHead className="w-20 text-center">대체휴무</TableHead>
                    <TableHead className="text-right">연장 / 휴일근무</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {days.map((d) => {
                    const isWeekend = d.dayOfWeek === '토' || d.dayOfWeek === '일';
                    const hasOt = d.overtimeMinutes > 0 || d.holidayWorkMinutes > 0;

                    return (
                      <TableRow
                        key={d.date}
                        className={`text-xs ${
                          isWeekend ? 'bg-muted/15' : !d.isWorkday ? 'bg-rose-50/20' : ''
                        }`}
                      >
                        <TableCell className="font-mono">{d.date.slice(5)}</TableCell>
                        <TableCell className={`text-center font-semibold ${
                          d.dayOfWeek === '일' ? 'text-rose-600' : d.dayOfWeek === '토' ? 'text-blue-600' : ''
                        }`}>
                          {d.dayOfWeek}
                        </TableCell>
                        <TableCell>
                          <span className={`text-[11px] ${!d.isWorkday ? 'text-rose-600 font-medium' : 'text-slate-600'}`}>
                            {d.dayTypeName}
                          </span>
                        </TableCell>
                        <TableCell className="text-center font-mono font-medium text-emerald-700">
                          {d.checkInAt || '-'}
                        </TableCell>
                        <TableCell className="text-center font-mono font-medium text-blue-700">
                          {d.checkOutAt || '-'}
                        </TableCell>
                        <TableCell className="text-center">
                          {d.isLate && d.isEarlyLeave ? (
                            <Badge variant="destructive" className="bg-rose-600 text-[10px]">지각·조퇴</Badge>
                          ) : d.isLate ? (
                            <Badge variant="destructive" className="bg-rose-500 text-[10px]">지각</Badge>
                          ) : d.isEarlyLeave ? (
                            <Badge className="bg-amber-100 text-amber-800 border-amber-300 text-[10px]">조퇴</Badge>
                          ) : d.checkInAt ? (
                            <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 text-[10px]">정상</Badge>
                          ) : d.isWorkday && !d.leaveType && !d.isCompLeaveUsed ? (
                            <Badge variant="outline" className="text-muted-foreground text-[10px]">미출근</Badge>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          {d.leaveType ? (
                            <Badge className="bg-purple-100 text-purple-700 border-purple-200 text-[10px]">
                              {d.leaveType === 'FULL_DAY' ? '1일' : d.leaveType === 'HALF_DAY' ? '반차' : d.leaveType === 'QUARTER_DAY' ? '반반차' : '시차'}
                            </Badge>
                          ) : '-'}
                        </TableCell>
                        <TableCell className="text-center">
                          {d.isCompLeaveUsed ? (
                            <Badge className="bg-indigo-100 text-indigo-700 border-indigo-200 text-[10px]">대체휴무</Badge>
                          ) : '-'}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {d.overtimeMinutes > 0 ? (
                            <span className="text-blue-700 font-semibold">
                              연장 {formatDuration(d.overtimeMinutes)}
                            </span>
                          ) : d.holidayWorkMinutes > 0 ? (
                            <span className="text-indigo-700 font-semibold">
                              휴일 {formatDuration(d.holidayWorkMinutes)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
