'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface MonthSelectorProps {
  currentYear: number;
  currentMonth: number;
}

export function AttendanceMonthSelector({ currentYear, currentMonth }: MonthSelectorProps) {
  const router = useRouter();

  const handlePrev = () => {
    let year = currentYear;
    let month = currentMonth - 1;
    if (month < 1) {
      year -= 1;
      month = 12;
    }
    router.push(`/user/attendance?year=${year}&month=${month}`);
  };

  const handleNext = () => {
    let year = currentYear;
    let month = currentMonth + 1;
    if (month > 12) {
      year += 1;
      month = 1;
    }
    router.push(`/user/attendance?year=${year}&month=${month}`);
  };

  const handleCurrent = () => {
    const now = new Date();
    const kstYear = parseInt(
      new Intl.DateTimeFormat('en', { year: 'numeric', timeZone: 'Asia/Seoul' }).format(now),
      10
    );
    const kstMonth = parseInt(
      new Intl.DateTimeFormat('en', { month: 'numeric', timeZone: 'Asia/Seoul' }).format(now),
      10
    );
    router.push(`/user/attendance?year=${kstYear}&month=${kstMonth}`);
  };

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center rounded-lg border bg-card p-1 shadow-sm">
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          onClick={handlePrev}
          aria-label="이전 달"
        >
          <ChevronLeft className="size-4" />
        </Button>
        <span className="min-w-[120px] text-center font-semibold text-sm">
          {currentYear}년 {String(currentMonth).padStart(2, '0')}월
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          onClick={handleNext}
          aria-label="다음 달"
        >
          <ChevronRight className="size-4" />
        </Button>
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={handleCurrent}
        className="h-10 text-xs font-medium"
      >
        <Calendar className="mr-1.5 size-3.5" />
        이번 달
      </Button>
    </div>
  );
}
