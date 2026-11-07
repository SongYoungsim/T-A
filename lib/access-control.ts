export type AppRole = 'ADMIN' | 'USER';

export type NavigationItem = {
  label: string;
  href: string;
  icon: string;
};

export const navigationByRole: Record<AppRole, NavigationItem[]> = {
  ADMIN: [
    { label: '대시보드', href: '/admin', icon: 'LayoutDashboard' },
    { label: '근태관리', href: '/admin/attendance', icon: 'Clock3' },
    { label: '연차관리', href: '/admin/leave', icon: 'CalendarDays' },
    { label: '연장근무', href: '/admin/overtime', icon: 'TimerReset' },
    { label: '대체휴무', href: '/admin/comp-leave', icon: 'CalendarCheck2' },
    { label: '사원관리', href: '/admin/employees', icon: 'Users' },
    { label: '근무일 캘린더', href: '/admin/work-calendar', icon: 'CalendarCog' },
    { label: '리포트', href: '/admin/reports', icon: 'FileBarChart2' },
    { label: '감사로그', href: '/admin/audit-logs', icon: 'ShieldCheck' },
    { label: '설정', href: '/admin/settings', icon: 'Settings2' },
  ],
  USER: [
    { label: '홈', href: '/user', icon: 'House' },
    { label: '내 근태', href: '/user/attendance', icon: 'CalendarClock' },
    { label: '내 연차', href: '/user/leave', icon: 'CalendarDays' },
    { label: '내 연장근무', href: '/user/overtime', icon: 'TimerReset' },
    { label: '내 대체휴무', href: '/user/comp-leave', icon: 'CalendarCheck2' },
  ],
};

export function canAccessRoute(role: AppRole, pathname: string) {
  const ownPrefix = role === 'ADMIN' ? '/admin' : '/user';
  return pathname === ownPrefix || pathname.startsWith(`${ownPrefix}/`);
}