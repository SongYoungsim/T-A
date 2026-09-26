import Image from 'next/image';
import { redirect } from 'next/navigation';
import { Building2, ShieldCheck } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LoginForm } from '@/components/login-form';
import { getCurrentUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect(user.role === 'ADMIN' ? '/admin' : '/user');

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
            <LoginForm />
            <p className="text-center text-xs text-muted-foreground">인증된 계정만 사내 근태 데이터에 접근할 수 있습니다.</p>
          </CardContent>
        </Card>
      </section>
    </main>
  );
}