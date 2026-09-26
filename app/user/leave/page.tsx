import { PagePlaceholder } from '@/components/page-placeholder';

export default function LeavePage() {
  return (
    <PagePlaceholder
      title="내 연차"
      description="연도별 연차 잔여와 사용 내역을 확인합니다."
      phase="Phase 3"
      bullets={["잔여 일수·시간 표시","연차 유형별 사용 내역","과거 연도 조회"]}
    />
  );
}