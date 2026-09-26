import { AppShell } from '@/components/app-shell';
export default function UserLayout({ children }: { children: React.ReactNode }) {
  return <AppShell role="USER">{children}</AppShell>;
}