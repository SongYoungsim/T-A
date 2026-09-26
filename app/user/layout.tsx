import { AppShell } from '@/components/app-shell';
import { requireUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function UserLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return <AppShell role="USER" user={user}>{children}</AppShell>;
}