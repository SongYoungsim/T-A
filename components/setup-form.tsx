'use client';

import { useState } from 'react';
import { LoaderCircle, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function SetupForm() {
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('');
    setPending(true);
    const form = new FormData(event.currentTarget);
    const response = await fetch('/api/setup/seed', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(Object.fromEntries(form)),
    });
    const result = (await response.json()) as { error?: string };
    setPending(false);
    if (!response.ok) {
      setMessage(result.error ?? '초기 설정에 실패했습니다.');
      return;
    }
    window.location.assign('/');
  }

  return (
    <form className="space-y-4" onSubmit={submit}>
      <div className="rounded-xl bg-blue-50 p-4 text-sm leading-6 text-blue-950">
        <ShieldCheck className="mb-2 size-5 text-primary" />
        이 화면은 사원 데이터가 없는 최초 1회에만 사용합니다. 입력한 비밀번호는 해시 처리되며 저장소에 남지 않습니다.
      </div>
      <div className="space-y-2">
        <Label htmlFor="setupSecret">초기 설정 키</Label>
        <Input id="setupSecret" name="setupSecret" type="password" required />
      </div>
      {[
        ['adminPassword', 'EMP001 관리자 임시 비밀번호'],
        ['user1Password', 'EMP002 직원 임시 비밀번호'],
        ['user2Password', 'EMP003 직원 임시 비밀번호'],
      ].map(([name, label]) => (
        <div className="space-y-2" key={name}>
          <Label htmlFor={name}>{label}</Label>
          <Input id={name} name={name} type="password" minLength={12} required />
        </div>
      ))}
      {message && <p role="alert" className="text-sm text-rose-700">{message}</p>}
      <Button className="h-11 w-full" disabled={pending}>
        {pending && <LoaderCircle className="size-4 animate-spin" />}
        초기 계정 생성
      </Button>
    </form>
  );
}