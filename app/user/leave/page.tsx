import { requireUser } from '@/lib/auth';
import UserLeaveView from '@/components/user-leave-view';

export default async function UserLeavePage() {
  await requireUser();
  return <UserLeaveView />;
}