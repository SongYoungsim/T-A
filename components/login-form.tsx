'use client';

import { useState } from 'react';
import { LockKeyhole, LoaderCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function LoginForm() {
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setPending(true);
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          employeeNumber: form.get('employeeNumber'),
          password: form.get('password'),
        }),
      });
      const result = (await response.json()) as {
        error?: string;
        redirect?: string;
      };
      if (!response.ok) {
        setError(result.error ?? '로그인에 실패했습니다.');
        return;
      }
      window.location.assign(result.redirect ?? '/');
    } catch {
      setError('로그인 요청을 처리할 수 없습니다. 잠시 후 다시 시도해주세요.');
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="space-y-4" onSubmit={onSubmit}>
      <div className="space-y-2">
        <Label htmlFor="employee-id">사번</Label>
        <Input
          id="employee-id"
          name="employeeNumber"
          placeholder="예: EMP001"
          className="h-12 bg-white"
          autoComplete="username"
          required
          autoCapitalize="characters"
        />
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="password">비밀번호</Label>
          <span className="text-xs text-muted-foreground">12자 이상</span>
        </div>
        <Input
          id="password"
          name="password"
          type="password"
          placeholder="비밀번호를 입력하세요"
          className="h-12 bg-white"
          autoComplete="current-password"
          required
        />
      </div>
      {error && (
        <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      )}
      <Button className="h-12 w-full text-[15px]" disabled={pending}>
        {pending ? <LoaderCircle className="size-4 animate-spin" /> : <LockKeyhole className="size-4" />}
        {pending ? '확인 중...' : '로그인'}
      </Button>
    </form>
  );
}