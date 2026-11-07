import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { getUserCompensatoryLeaves } from '@/lib/compensatory-leave';
import { UserCompLeaveView } from './user-comp-leave-view';

export default async function UserCompLeavePage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/login');
  }

  // 항상 세션에서 추출한 본인 ID만 사용 (보안 통제)
  const employeeId = user.employeeId;
  const { rows, summary, expiringSoonList } = await getUserCompensatoryLeaves(employeeId);

  return (
    <UserCompLeaveView
      rows={rows}
      summary={summary}
      expiringSoonList={expiringSoonList}
      employeeName={user.fullName}
    />
  );
}