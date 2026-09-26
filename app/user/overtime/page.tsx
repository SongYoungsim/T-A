import { PagePlaceholder } from '@/components/page-placeholder';

export default function OvertimePage() {
  return (
    <PagePlaceholder
      title="내 연장근무"
      description="나의 평일 연장근무와 휴일근무 기록을 확인합니다."
      phase="Phase 6"
      bullets={["근무구분별 조회","분 단위 실제 근무시간","월별 누적시간"]}
    />
  );
}