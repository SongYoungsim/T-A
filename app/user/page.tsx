import { Bell, CalendarDays, Clock3, LogIn, LogOut, TimerReset } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getCurrentUser } from '@/lib/auth';

export default async function UserDashboard() {
  const currentUser = await getCurrentUser();
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div><p className="text-sm font-medium text-primary">오늘도 좋은 하루 보내세요</p><h1 className="mt-1 text-2xl font-bold tracking-tight">{currentUser?.fullName ?? '직원'}님의 근태</h1></div>
      <Card className="overflow-hidden border-0 bg-[#1e3353] text-white shadow-lg">
        <CardContent className="p-5 sm:p-7">
          <div className="flex items-start justify-between"><div><p className="text-sm text-blue-100">2026년 9월 26일 토요일</p><h2 className="mt-2 text-2xl font-bold">오늘은 휴일입니다</h2></div><Badge className="bg-white/12 text-white hover:bg-white/12">휴일</Badge></div>
          <div className="mt-7 grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-white/8 p-4"><p className="text-xs text-slate-300">출근시간</p><p className="mt-1 text-xl font-bold">--:--</p></div>
            <div className="rounded-2xl bg-white/8 p-4"><p className="text-xs text-slate-300">퇴근시간</p><p className="mt-1 text-xl font-bold">--:--</p></div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <Button disabled className="h-16 bg-blue-500 text-base text-white disabled:opacity-45"><LogIn className="size-5" />출근</Button>
            <Button disabled variant="secondary" className="h-16 text-base disabled:opacity-45"><LogOut className="size-5" />퇴근</Button>
          </div>
          <p className="mt-3 text-center text-xs text-slate-400">휴일에는 출퇴근 버튼을 사용할 수 없습니다.</p>
        </CardContent>
      </Card>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {[
          { label: '잔여 연차', value: '10.125일', sub: '81시간', icon: CalendarDays },
          { label: '대체휴무', value: '2일', sub: '사용 가능', icon: Clock3 },
          { label: '이번 달 연장', value: '6시간 30분', sub: '3건', icon: TimerReset },
        ].map(({ label, value, sub, icon: Icon }) => (
          <Card key={label} className="border-0 shadow-sm last:col-span-2 sm:last:col-span-1"><CardContent className="p-4 sm:p-5"><Icon className="size-5 text-primary" /><p className="mt-5 text-sm text-muted-foreground">{label}</p><p className="mt-1 text-xl font-bold">{value}</p><p className="mt-1 text-xs text-muted-foreground">{sub}</p></CardContent></Card>
        ))}
      </section>

      <Alert className="border-amber-200 bg-amber-50">
        <Bell className="size-4 text-amber-700" /><AlertTitle className="text-amber-950">대체휴무 만료 예정</AlertTitle><AlertDescription className="text-amber-900">대체휴무 1일이 2026-10-18에 만료될 예정입니다.</AlertDescription>
      </Alert>

      <Card className="border-0 shadow-sm"><CardHeader><CardTitle className="text-base">최근 근태</CardTitle></CardHeader><CardContent className="space-y-1">{[['09.25', '정상', '08:54 · 18:12'], ['09.24', '연장', '08:57 · 20:05'], ['09.23', '반차', '13:02 · 18:04']].map(([date,status,time]) => <div key={date} className="flex items-center justify-between border-b py-3 last:border-0"><div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-muted text-sm font-semibold">{date}</span><Badge variant="outline">{status}</Badge></div><span className="text-sm text-muted-foreground">{time}</span></div>)}</CardContent></Card>
    </div>
  );
}