import { AlertTriangle, CalendarOff, Clock3, TimerReset, TrendingUp, UserCheck, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { getCurrentUser } from '@/lib/auth';

const kpis = [
  { label: '전체 재직인원', value: '30', unit: '명', note: '전월과 동일', icon: Users, tone: 'blue' },
  { label: '현재 출근인원', value: '24', unit: '명', note: '80% 출근', icon: UserCheck, tone: 'green' },
  { label: '미출근인원', value: '2', unit: '명', note: '확인 필요', icon: Clock3, tone: 'amber' },
  { label: '오늘 연차인원', value: '3', unit: '명', note: '연차 2 · 반차 1', icon: CalendarOff, tone: 'violet' },
  { label: '지각인원', value: '1', unit: '명', note: '전주 대비 -2', icon: AlertTriangle, tone: 'red' },
  { label: '연장근무 등록', value: '4', unit: '명', note: '총 9시간 30분', icon: TimerReset, tone: 'cyan' },
];

const staff = [
  ['박민준', '서비스개발팀', '09:00', '08:54', '-', '근무중'],
  ['이수빈', '경영지원팀', '09:00', '08:58', '-', '근무중'],
  ['정도윤', '영업팀', '09:00', '09:07', '-', '지각'],
  ['최유진', '디자인팀', '10:00', '-', '-', '연차'],
  ['한지우', '서비스개발팀', '09:00', '08:46', '18:12', '퇴근'],
];

const toneMap: Record<string, string> = {
  blue: 'bg-blue-50 text-blue-700', green: 'bg-emerald-50 text-emerald-700',
  amber: 'bg-amber-50 text-amber-700', violet: 'bg-violet-50 text-violet-700',
  red: 'bg-rose-50 text-rose-700', cyan: 'bg-cyan-50 text-cyan-700',
};

export default async function AdminDashboard() {
  const currentUser = await getCurrentUser();
  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div><p className="text-sm font-medium text-primary">오늘의 근태</p><h1 className="mt-1 text-2xl font-bold tracking-tight md:text-3xl">안녕하세요, {currentUser?.fullName ?? '관리자'}님</h1><p className="mt-2 text-sm text-muted-foreground">직원 30명의 오늘 근태 현황을 한눈에 확인하세요.</p></div>
        <div className="flex items-center gap-2 text-sm text-emerald-700"><span className="size-2 rounded-full bg-emerald-500" />데이터 기준 10:24</div>
      </div>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-3 2xl:grid-cols-6">
        {kpis.map(({ label, value, unit, note, icon: Icon, tone }) => (
          <Card key={label} className="border-0 shadow-sm">
            <CardContent className="p-4 md:p-5">
              <div className={`mb-4 grid size-9 place-items-center rounded-xl ${toneMap[tone]}`}><Icon className="size-4.5" /></div>
              <p className="text-sm text-muted-foreground">{label}</p>
              <p className="mt-1 text-2xl font-bold">{value}<span className="ml-1 text-sm font-medium text-muted-foreground">{unit}</span></p>
              <p className="mt-2 text-xs text-muted-foreground">{note}</p>
            </CardContent>
          </Card>
        ))}
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_330px]">
        <Card className="border-0 shadow-sm">
          <CardHeader className="flex-row items-center justify-between"><div><CardTitle className="text-lg">직원별 오늘 근태</CardTitle><p className="mt-1 text-sm text-muted-foreground">재직자 기준</p></div><Badge variant="secondary">30명</Badge></CardHeader>
          <CardContent>
            <div className="hidden md:block">
              <Table>
                <TableHeader><TableRow><TableHead>성명</TableHead><TableHead>부서</TableHead><TableHead>기준출근</TableHead><TableHead>실제출근</TableHead><TableHead>실제퇴근</TableHead><TableHead>오늘상태</TableHead></TableRow></TableHeader>
                <TableBody>{staff.map((row) => <TableRow key={row[0]}>{row.map((cell, i) => <TableCell key={i}>{i === 5 ? <Badge variant={cell === '지각' ? 'destructive' : cell === '연차' ? 'secondary' : 'outline'}>{cell}</Badge> : cell}</TableCell>)}</TableRow>)}</TableBody>
              </Table>
            </div>
            <div className="space-y-3 md:hidden">
              {staff.map((row) => <div key={row[0]} className="rounded-xl border p-4"><div className="flex items-center justify-between"><div><p className="font-semibold">{row[0]}</p><p className="text-xs text-muted-foreground">{row[1]}</p></div><Badge variant={row[5] === '지각' ? 'destructive' : 'outline'}>{row[5]}</Badge></div><div className="mt-3 grid grid-cols-3 text-xs"><span>기준 {row[2]}</span><span>출근 {row[3]}</span><span>퇴근 {row[4]}</span></div></div>)}
            </div>
          </CardContent>
        </Card>
        <div className="space-y-5">
          <Card className="border-0 shadow-sm"><CardHeader><CardTitle className="text-base">확인이 필요한 항목</CardTitle></CardHeader><CardContent className="space-y-3">{[['미출근', '2명'], ['퇴근 누락', '1명'], ['지각', '1명']].map(([a,b]) => <div key={a} className="flex items-center justify-between rounded-xl bg-muted/55 p-3 text-sm"><span>{a}</span><strong>{b}</strong></div>)}</CardContent></Card>
          <Card className="border-0 bg-[#1e3353] text-white shadow-sm"><CardContent className="p-5"><TrendingUp className="size-5 text-blue-200" /><p className="mt-6 text-sm text-blue-100">이번 달 연장근무</p><p className="mt-1 text-3xl font-bold">84시간 20분</p><p className="mt-3 text-xs text-slate-300">전월 대비 6시간 10분 감소</p></CardContent></Card>
        </div>
      </div>
    </div>
  );
}