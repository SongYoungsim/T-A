import { PagePlaceholder } from '@/components/page-placeholder';

export default function WorkCalendarPage() {
  return (
    <PagePlaceholder
      title="근무일 캘린더"
      description="공휴일, 회사 지정 휴무일과 대체근무일을 관리합니다."
      phase="Phase 5"
      bullets={["대한민국 공휴일 기준","회사 휴무일 예외 설정","근태·휴일근무 공통 기준"]}
    />
  );
}