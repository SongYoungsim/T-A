import { PagePlaceholder } from '@/components/page-placeholder';

export default function CompLeavePage() {
  return (
    <PagePlaceholder
      title="대체휴무"
      description="휴일근무에서 발생한 대체휴무의 부여·사용·만료를 추적합니다."
      phase="Phase 7"
      bullets={["원본 휴일근무 추적","3개월 만료 상태 관리","관리자 직접 사용 대상 선택"]}
    />
  );
}