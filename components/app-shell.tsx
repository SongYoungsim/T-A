'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  CalendarCheck2, CalendarClock, CalendarCog, CalendarDays, Clock3,
  House, LayoutDashboard, LogOut, Settings2, TimerReset, Users,
} from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent,
  SidebarHeader, SidebarInset, SidebarMenu, SidebarMenuButton, SidebarMenuItem,
  SidebarProvider, SidebarTrigger,
} from '@/components/ui/sidebar';
import { navigationByRole, type AppRole } from '@/lib/access-control';

const icons = {
  CalendarCheck2, CalendarClock, CalendarCog, CalendarDays, Clock3,
  House, LayoutDashboard, Settings2, TimerReset, Users,
};

export function AppShell({
  role,
  children,
}: {
  role: AppRole;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const nav = navigationByRole[role];
  const person = role === 'ADMIN'
    ? { name: '김서현', meta: '인사팀 · 관리자', initials: '김서' }
    : { name: '박민준', meta: '서비스개발팀 · 선임', initials: '박민' };

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon" className="border-r-0">
        <SidebarHeader className="p-4">
          <Link href={role === 'ADMIN' ? '/admin' : '/user'} className="flex items-center gap-3 overflow-hidden">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-white">
              <Image src="/logo_icon.png" width={25} height={25} alt="T&A" />
            </span>
            <span className="min-w-0 group-data-[collapsible=icon]:hidden">
              <span className="block truncate text-sm font-bold tracking-tight text-white">T&A HR</span>
              <span className="block truncate text-xs text-white/55">근태관리 시스템</span>
            </span>
          </Link>
        </SidebarHeader>
        <SidebarContent className="px-2 pt-4">
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {nav.map((item) => {
                  const Icon = icons[item.icon as keyof typeof icons];
                  const active = pathname === item.href;
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        render={<Link href={item.href} />}
                        isActive={active}
                        tooltip={item.label}
                        className="h-11 rounded-xl px-3 data-active:bg-white/12 data-active:text-white"
                      >
                        <Icon />
                        <span>{item.label}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter className="p-3">
          <div className="flex items-center gap-3 rounded-xl bg-white/7 p-2 group-data-[collapsible=icon]:p-1">
            <Avatar className="size-9 border border-white/10">
              <AvatarFallback className="bg-blue-300 text-xs font-bold text-slate-900">{person.initials}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
              <p className="truncate text-sm font-semibold text-white">{person.name}</p>
              <p className="truncate text-xs text-white/55">{person.meta}</p>
            </div>
            <Link href="/" aria-label="로그아웃" className="text-white/45 hover:text-white group-data-[collapsible=icon]:hidden">
              <LogOut className="size-4" />
            </Link>
          </div>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset className="min-h-svh bg-[#f6f8fb]">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b bg-white/90 px-4 backdrop-blur md:px-7">
          <div className="flex items-center gap-3">
            <SidebarTrigger className="-ml-1" />
            <div>
              <p className="text-sm font-semibold">{role === 'ADMIN' ? '관리자 업무공간' : '나의 근태'}</p>
              <p className="hidden text-xs text-muted-foreground sm:block">2026년 9월 26일 토요일</p>
            </div>
          </div>
          <Badge variant="secondary" className="rounded-full px-3 py-1">
            {role === 'ADMIN' ? 'ADMIN' : 'USER'}
          </Badge>
        </header>

        <main className="mx-auto w-full max-w-[1500px] flex-1 px-4 pb-24 pt-6 md:px-7 md:pb-10">
          {children}
        </main>

        <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t bg-white px-1 pb-[env(safe-area-inset-bottom)] md:hidden">
          {nav.slice(0, 5).map((item) => {
            const Icon = icons[item.icon as keyof typeof icons];
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex min-h-16 flex-col items-center justify-center gap-1 text-[11px] ${active ? 'font-semibold text-primary' : 'text-muted-foreground'}`}
              >
                <Icon className="size-5" />
                <span className="max-w-full truncate">{item.label.replace('내 ', '')}</span>
              </Link>
            );
          })}
        </nav>
      </SidebarInset>
    </SidebarProvider>
  );
}