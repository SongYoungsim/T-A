'use client';

import { useState } from 'react';
import { LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function LogoutButton({ compact = false }: { compact?: boolean }) {
  const [pending, setPending] = useState(false);

  async function logout() {
    setPending(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } finally {
      window.location.assign('/');
    }
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size={compact ? 'icon-sm' : 'sm'}
      onClick={logout}
      disabled={pending}
      aria-label="로그아웃"
      className={compact ? 'text-white/55 hover:bg-white/10 hover:text-white' : ''}
    >
      <LogOut className="size-4" />
      {!compact && <span className="hidden sm:inline">로그아웃</span>}
    </Button>
  );
}