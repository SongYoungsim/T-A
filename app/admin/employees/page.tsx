import { PagePlaceholder } from '@/components/page-placeholder';

export default function EmployeesPage() {
  return (
    <PagePlaceholder
      title="사원관리"
      description="직원 기본정보, 근무시간, 재직상태와 권한을 관리합니다."
      phase="Phase 2"
      bullets={["사원 마스터 CRUD","직원별 기준 근무시간","휴직·퇴사 계정 정책"]}
    />
  );
}