import { PagePlaceholder } from '@/components/page-placeholder';

export default function AttendancePage() {
  return (
    <PagePlaceholder
      title="근태관리"
      description="전체 직원의 출퇴근 기록을 조회하고 보정하는 관리자 화면입니다."
      phase="Phase 4"
      bullets={["출근·퇴근 서버 기록","5분 Grace Period 판정","보정 사유와 Audit Log 저장"]}
    />
  );
}