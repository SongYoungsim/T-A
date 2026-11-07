import { requireAdmin } from '@/lib/auth';
import AdminLeaveManagerDefault from '@/components/admin-leave-manager';

export default async function LeavePage() {
  await requireAdmin();
  return <AdminLeaveManagerDefault />;
}