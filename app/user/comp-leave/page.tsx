import { PagePlaceholder } from '@/components/page-placeholder';

export default function CompLeavePage() {
  return (
    <PagePlaceholder
      title="내 대체휴무"
      description="사용 가능한 대체휴무와 만료 예정 내역을 확인합니다."
      phase="Phase 7"
      bullets={["AVAILABLE·USED·EXPIRED 구분","발행 근거 휴일근무 확인","만료 30일 전 알림"]}
    />
  );
}