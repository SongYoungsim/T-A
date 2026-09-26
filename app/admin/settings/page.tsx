import { PagePlaceholder } from '@/components/page-placeholder';

export default function SettingsPage() {
  return (
    <PagePlaceholder
      title="설정"
      description="보안, 시스템 기준과 운영 정보를 관리합니다."
      phase="Phase 10"
      bullets={["비밀번호 정책","Audit Log 조회","운영 안정화 점검"]}
    />
  );
}