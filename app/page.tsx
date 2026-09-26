import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, Building2, LockKeyhole, ShieldCheck } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function LoginPage() {
  return (
    <main className="grid min-h-svh lg:grid-cols-[1.05fr_.95fr]">
      <section className="relative hidden overflow-hidden bg-[#17253d] p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute -right-24 -top-24 size-96 rounded-full border border-white/8" />
        <div className="absolute -right-5 -top-5 size-56 rounded-full border border-white/8" />
        <Image src="/logo.png" alt="T&A" width={126} height={48} className="h-auto w-28 brightness-0 invert" priority />
        <div className="relative max-w-xl">
          <div className="mb-6 grid size-14 place-items-center rounded-2xl bg-blue-400/15 text-blue-200"><Building2 className="size-7" /></div>
          <p className="mb-3 text-sm font-semibold tracking-[.18em] text-blue-200">HR WORKSPACE</p>
          <h1 className="text-4xl font-bold leading-tight tracking-tight">근태 업무를 더 정확하고,<br />더 간결하게.</h1>
          <p className="mt-5 max-w-md text-base leading-7 text-slate-300">연차, 출퇴근, 연장근무와 대체휴무를 하나의 기준으로 관리하는 사내 업무공간입니다.</p>
        </div>
        <div className="flex items-center gap-3 text-sm text-slate-400"><ShieldCheck className="size-4" />권한 기반 접근 · 변경 이력 보존 · Asia/Seoul 기준</div>
      </section>

      <section className="flex items-center justify-center bg-[#f7f9fc] px-5 py-10">
        <Card className="w-full max-w-[460px] border-0 bg-transparent shadow-none sm:border sm:bg-white sm:p-4 sm:shadow-xl sm:shadow-slate-200/40">
          <CardHeader className="space-y-3">
            <Image src="/logo_icon.png" alt="T&A" width={42} height={42} className="mb-3 lg:hidden" />
            <CardTitle className="text-2xl font-bold">근태관리 시스템</CardTitle>
            <CardDescription className="text-[15px]">사번과 비밀번호로 로그인해 주세요.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <form className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="employee-id">사번</Label>
                <Input id="employee-id" name="employeeId" placeholder="사번을 입력하세요" className="h-12 bg-white" autoComplete="username" />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between"><Label htmlFor="password">비밀번호</Label><span className="text-xs text-muted-foreground">8자 이상</span></div>
                <Input id="password" name="password" type="password" placeholder="비밀번호를 입력하세요" className="h-12 bg-white" autoComplete="current-password" />
              </div>
              <Button className="h-12 w-full text-[15px]" disabled>
                <LockKeyhole className="size-4" />로그인
              </Button>
            </form>
            <Alert className="bg-blue-50 text-blue-950">
              <AlertDescription className="text-xs leading-5">1차에서는 로그인 화면과 보안 구조를 구축했습니다. 계정 생성·비밀번호 검증 연결은 사원 마스터 단계에서 활성화됩니다.</AlertDescription>
            </Alert>
            <div className="grid gap-2 sm:grid-cols-2">
              <Button variant="outline" render={<Link href="/admin" />} className="h-11 justify-between">관리자 화면 <ArrowRight className="size-4" /></Button>
              <Button variant="outline" render={<Link href="/user" />} className="h-11 justify-between">직원 화면 <ArrowRight className="size-4" /></Button>
            </div>
            <p className="text-center text-xs text-muted-foreground">화면 미리보기 · 실제 계정 로그인은 다음 단계에서 연결</p>
          </CardContent>
        </Card>
      </section>
    </main>
  );
}