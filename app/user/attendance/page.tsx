import { PagePlaceholder } from '@/components/page-placeholder';

export default function AttendancePage() {
  return (
    <PagePlaceholder
      title="내 근태"
      description="나의 월간 출퇴근 상태와 상세 기록을 확인합니다."
      phase="Phase 8"
      bullets={["월간 달력 보기","날짜별 근태 상세","월간 요약과 누적시간"]}
    />
  );
}