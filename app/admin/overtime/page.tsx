import { PagePlaceholder } from '@/components/page-placeholder';

export default function OvertimePage() {
  return (
    <PagePlaceholder
      title="연장근무"
      description="평일 연장근무와 휴일근무를 하나의 화면에서 관리합니다."
      phase="Phase 6"
      bullets={["근무일 캘린더 기반 자동 분류","분 단위 실제 근무시간 계산","대체휴무 1일 선택 부여"]}
    />
  );
}