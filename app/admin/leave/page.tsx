import { PagePlaceholder } from '@/components/page-placeholder';

export default function LeavePage() {
  return (
    <PagePlaceholder
      title="연차관리"
      description="연도별 연차 마스터와 승인 완료된 연차 사용 내역을 관리합니다."
      phase="Phase 3"
      bullets={["연도별 부여·이월 시간 설정","연차 유형별 사용 등록","동일 직원·날짜 중복 방지"]}
    />
  );
}