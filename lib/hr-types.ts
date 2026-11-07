export type EmployeeRole = 'ADMIN' | 'USER';
export type EmploymentStatus = 'ACTIVE' | 'LEAVE' | 'RESIGNED';

export type LeavePeriod = {
  id: string;
  startedOn: string;
  endedOn: string | null;
  reason: string | null;
};

export type EmployeeRecord = {
  id: string;
  employeeNumber: string;
  fullName: string;
  department: string;
  jobTitle: string;
  hiredOn: string;
  employmentStatus: EmploymentStatus;
  role: EmployeeRole;
  standardStartMinute: number;
  standardEndMinute: number;
  terminatedOn: string | null;
  accountEnabled: boolean;
  lastLoginAt: string | null;
  leavePeriods?: LeavePeriod[];
};

export type CurrentUser = {
  employeeId: string;
  accountId: string;
  employeeNumber: string;
  fullName: string;
  department: string;
  jobTitle: string;
  employmentStatus: EmploymentStatus;
  role: EmployeeRole;
  standardStartMinute: number;
  standardEndMinute: number;
};

// ─── 연차 관련 타입 (Phase 3) ───────────────────────────────────────────────

/** 연차 종류 */
export type LeaveType = 'FULL_DAY' | 'HALF_DAY' | 'QUARTER_DAY' | 'HOURLY';

/** 연차 종류별 메타데이터 */
export const LEAVE_TYPE_META: Record<LeaveType, { label: string; minutes: number }> = {
  FULL_DAY:    { label: '1일',   minutes: 480 },
  HALF_DAY:    { label: '반차',  minutes: 240 },
  QUARTER_DAY: { label: '반반차', minutes: 120 },
  HOURLY:      { label: '시차',  minutes: 60  },
};

/** 분(minutes) → 일 단위 변환 (1일 = 480분) */
export function minutesToDays(minutes: number): number {
  return minutes / 480;
}

/** 일 단위 → 분(minutes) 변환 */
export function daysToMinutes(days: number): number {
  return Math.round(days * 480);
}

/** 분 → 표시용 "X.XXX일" 문자열 */
export function formatDays(minutes: number): string {
  const days = minutesToDays(minutes);
  // 정수이면 소수점 제거, 아니면 3자리까지
  return Number.isInteger(days) ? `${days}일` : `${days.toFixed(3).replace(/\.?0+$/, '')}일`;
}

/** 분 → 표시용 "X시간" 문자열 */
export function formatHours(minutes: number): string {
  if (minutes % 60 === 0) return `${minutes / 60}시간`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}시간 ${m}분` : `${m}분`;
}

/** 연차 마스터 레코드 */
export type AnnualLeaveMaster = {
  id: string;
  employeeId: string;
  year: number;
  grantedMinutes: number;
  carriedMinutes: number;
  createdAt: string;
  updatedAt: string;
};

/** 연차 사용 레코드 */
export type LeaveUsage = {
  id: string;
  employeeId: string;
  leaveMasterId: string;
  leaveDate: string;
  leaveType: LeaveType;
  minutes: number;
  registeredBy: string;
  cancelledAt: string | null;
  cancelledBy: string | null;
  createdAt: string;
  updatedAt: string;
};

/** ADMIN 연차현황 목록용 Row */
export type LeaveStatusRow = {
  employeeId: string;
  employeeNumber: string;
  fullName: string;
  department: string;
  jobTitle: string;
  employmentStatus: EmploymentStatus;
  masterId: string | null;
  grantedMinutes: number;
  carriedMinutes: number;
  usedMinutes: number;
};

/** USER 연차 요약 */
export type LeaveSummary = {
  year: number;
  masterId: string | null;
  grantedMinutes: number;
  carriedMinutes: number;
  usedMinutes: number;
};

/** 연차 사용내역 (표시용) */
export type LeaveUsageDisplay = {
  id: string;
  leaveDate: string;
  leaveType: LeaveType;
  minutes: number;
  cancelledAt: string | null;
};

// ─── 근태 관련 타입 (Phase 4) ───────────────────────────────────────────────

/**
 * 하루 대표 근태상태
 * - NORMAL: 정상
 * - LATE: 지각
 * - EARLY_LEAVE: 조퇴
 * - ABSENT: 결근 (Phase 5에서 자동판정 예정)
 * - FULL_DAY / HALF_DAY / QUARTER_DAY / HOURLY: 연차 종류
 */
export type AttendanceStatus =
  | 'NORMAL'
  | 'LATE'
  | 'EARLY_LEAVE'
  | 'ABSENT'
  | 'OVERTIME'
  | 'HOLIDAY_WORK'
  | 'COMPENSATORY_LEAVE'
  | 'FULL_DAY'
  | 'HALF_DAY'
  | 'QUARTER_DAY'
  | 'HOURLY';

/** 근태상태 한국어 라벨 */
export const ATTENDANCE_STATUS_LABEL: Record<AttendanceStatus, string> = {
  NORMAL: '정상',
  LATE: '지각',
  EARLY_LEAVE: '조퇴',
  ABSENT: '결근',
  OVERTIME: '연장',
  HOLIDAY_WORK: '휴일근무',
  COMPENSATORY_LEAVE: '대체휴무',
  FULL_DAY: '1일',
  HALF_DAY: '반차',
  QUARTER_DAY: '반반차',
  HOURLY: '시차',
};

/** 근태 판정 결과 */
export type AttendanceJudgement = {
  /** 대표 근태상태 */
  representativeStatus: AttendanceStatus;
  /** 지각 세부 플래그 */
  isLate: boolean;
  /** 조퇴 세부 플래그 */
  isEarlyLeave: boolean;
};

/** Attendance DB 레코드 */
export type AttendanceRecord = {
  id: string;
  employeeId: string;
  workDate: string;
  checkInAt: string | null;
  checkOutAt: string | null;
  source: 'WEB' | 'EXCEL' | 'ADMIN_EDIT';
  representativeStatus: AttendanceStatus | null;
  isLate: boolean;
  isEarlyLeave: boolean;
  originalCheckInAt: string | null;
  originalCheckOutAt: string | null;
  createdAt: string;
  updatedAt: string;
};

/** USER 오늘 Attendance 요약 (Dashboard용) */
export type TodayAttendance = {
  workDate: string;
  checkInAt: string | null;
  checkOutAt: string | null;
  representativeStatus: AttendanceStatus | null;
  isLate: boolean;
  isEarlyLeave: boolean;
};

/** ADMIN 근태 목록 Row */
export type AttendanceListRow = {
  attendanceId: string | null;
  employeeId: string;
  employeeNumber: string;
  fullName: string;
  department: string;
  standardStartMinute: number;
  standardEndMinute: number;
  workDate: string;
  checkInAt: string | null;
  checkOutAt: string | null;
  source: string | null;
  representativeStatus: AttendanceStatus | null;
  isLate: boolean;
  isEarlyLeave: boolean;
  isAbsent?: boolean;
  isNotClockedIn?: boolean;
  isWorkday?: boolean;
  dayType?: CalendarDayType;
  dayName?: string | null;
  leaveType: LeaveType | null;
  overtimeType?: WorkType | null;
  overtimeMinutes?: number;
  reason?: string;
};

/** USER 월간 달력용 일별 근태 */
export type MonthlyAttendanceDay = {
  date: string;
  checkInAt: string | null;
  checkOutAt: string | null;
  representativeStatus: AttendanceStatus | null;
  isLate: boolean;
  isEarlyLeave: boolean;
  isAbsent: boolean;
  isNotClockedIn: boolean;
  isWorkday: boolean;
  dayType: CalendarDayType;
  dayName: string | null;
  leaveType: LeaveType | null;
  overtimeType?: WorkType | null;
  overtimeMinutes?: number;
  source: string | null;
  reason?: string;
};

/** USER 월간 요약 */
export type MonthlyAttendanceSummary = {
  normal: number;
  late: number;
  earlyLeave: number;
  absent: number;
  leaveUsed: number;
};

// ─── 근무일 캘린더 관련 타입 (Phase 5) ──────────────────────────────────────────

/** 캘린더 일자 구분 */
export type CalendarDayType =
  | 'NORMAL_WORKDAY'
  | 'WEEKEND'
  | 'PUBLIC_HOLIDAY'
  | 'COMPANY_HOLIDAY'
  | 'SUBSTITUTE_WORKDAY';

/** 캘린더 일자 메타데이터 */
export const CALENDAR_DAY_TYPE_META: Record<
  CalendarDayType,
  { label: string; badge: string; defaultIsWorkday: boolean; color: string }
> = {
  NORMAL_WORKDAY: {
    label: '일반 근무일',
    badge: '일반',
    defaultIsWorkday: true,
    color: 'text-slate-700 bg-slate-50 border-slate-200',
  },
  WEEKEND: {
    label: '주말',
    badge: '주말',
    defaultIsWorkday: false,
    color: 'text-blue-700 bg-blue-50 border-blue-200',
  },
  PUBLIC_HOLIDAY: {
    label: '공휴일',
    badge: '공휴일',
    defaultIsWorkday: false,
    color: 'text-rose-700 bg-rose-50 border-rose-200',
  },
  COMPANY_HOLIDAY: {
    label: '회사 휴무일',
    badge: '회사휴무',
    defaultIsWorkday: false,
    color: 'text-amber-700 bg-amber-50 border-amber-200',
  },
  SUBSTITUTE_WORKDAY: {
    label: '대체근무일',
    badge: '대체근무',
    defaultIsWorkday: true,
    color: 'text-emerald-700 bg-emerald-50 border-emerald-200',
  },
};

/** 최종 유효 근무일 판정 결과 */
export type EffectiveWorkday = {
  date: string;
  dayType: CalendarDayType;
  isWorkday: boolean;
  name: string | null;
  memo: string | null;
  source: string | null;
};

/** 일별 종합 근태 판정 결과 */
export type DailyAttendanceJudgement = {
  date: string;
  representativeStatus: AttendanceStatus | null;
  isWorkday: boolean;
  dayType: CalendarDayType;
  isLate: boolean;
  isEarlyLeave: boolean;
  isAbsent: boolean;
  isNotClockedIn: boolean;
  leaveType: LeaveType | null;
  overtimeType?: WorkType | null;
  overtimeMinutes?: number;
  checkInAt: string | null;
  checkOutAt: string | null;
  dayName: string | null;
  source: string | null;
  reason?: string;
};

/** D1 work_calendar 레코드 */
export type WorkCalendarRow = {
  calendarDate: string;
  dayType: CalendarDayType;
  name: string | null;
  isWorkday: boolean;
  memo: string | null;
  source: string | null;
  createdBy?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

/**
 * ISO timestamp → KST "HH:MM" 표시 문자열
 * 예: "2026-09-26T00:02:00.000Z" → "09:02"
 */
export function formatTimeKST(isoTimestamp: string): string {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Seoul',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(isoTimestamp));
}

/**
 * 분(minute of day) → "HH:MM" 표시 문자열
 * 예: 540 → "09:00"
 */
export function minuteToTimeString(minuteOfDay: number): string {
  const h = Math.floor(minuteOfDay / 60);
  const m = minuteOfDay % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// ─── 연장근무 관련 타입 (Phase 6) ──────────────────────────────────────────

/** 연장/휴일근무 구분 */
export type WorkType = 'OVERTIME' | 'HOLIDAY_WORK';

/** 연장/휴일근무 메타데이터 */
export const WORK_TYPE_META: Record<WorkType, { label: string; badge: string; color: string }> = {
  OVERTIME: {
    label: '평일연장',
    badge: '평일연장',
    color: 'bg-blue-100 text-blue-800 border-blue-200',
  },
  HOLIDAY_WORK: {
    label: '휴일근무',
    badge: '휴일근무',
    color: 'bg-purple-100 text-purple-800 border-purple-200',
  },
};

/** 연장근무 레코드 (D1 overtime_works) */
export type OvertimeRecord = {
  id: string;
  employeeId: string;
  employeeNumber?: string;
  fullName?: string;
  department?: string;
  workDate: string;
  startedAt: string;
  endedAt: string;
  durationMinutes: number;
  description: string;
  workType: WorkType;
  grantCompLeave: boolean;
  cancelledAt: string | null;
  cancelledBy: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  /** 연결된 실제 출퇴근 기록 (확인용) */
  attendanceCheckInAt?: string | null;
  attendanceCheckOutAt?: string | null;
  startTime?: string;
  endTime?: string;
  actualMinutes?: number;
  workDescription?: string;
};

/** 연장근무 월간 요약 통계 */
export type OvertimeSummary = {
  overtimeMinutes: number;
  holidayWorkMinutes: number;
  totalMinutes: number;
  overtimeCount: number;
  holidayWorkCount: number;
  compLeaveGrantedCount: number;
};

/** "HH:MM" -> 분(minute of day) 변환 */
export function timeStringToMinutes(timeStr: string): number {
  if (!timeStr) return 0;
  const [h, m] = timeStr.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

/**
 * 분(Minutes) → "X시간 Y분" 또는 "Y분" 표시 문자열
 * 예: 134 → "2시간 14분", 44 → "44분", 0 → "0분"
 */
export function formatDuration(minutes: number): string {
  if (!minutes || minutes <= 0) return '0분';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0 && m > 0) return `${h}시간 ${m}분`;
  if (h > 0) return `${h}시간`;
  return `${m}분`;
}

// ─── 대체휴무 관련 타입 (Phase 7) ───────────────────────────────────────────────

/** 대체휴무 실질 상태 (Effective Status) */
export type CompensatoryLeaveStatus = 'AVAILABLE' | 'USED' | 'EXPIRED' | 'CANCELLED';

/** 대체휴무 상태 라벨 */
export const COMP_LEAVE_STATUS_LABEL: Record<CompensatoryLeaveStatus, string> = {
  AVAILABLE: '사용가능',
  USED: '사용완료',
  EXPIRED: '만료',
  CANCELLED: '부여취소',
};

/** 대체휴무 상태 배지 스타일 */
export const COMP_LEAVE_STATUS_BADGE: Record<CompensatoryLeaveStatus, string> = {
  AVAILABLE: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  USED: 'bg-blue-100 text-blue-800 border-blue-200',
  EXPIRED: 'bg-zinc-100 text-zinc-600 border-zinc-200',
  CANCELLED: 'bg-rose-100 text-rose-700 border-rose-200 line-through',
};

/** 대체휴무 기본 레코드 */
export type CompensatoryLeaveRecord = {
  id: string;
  employeeId: string;
  sourceOvertimeId: string;
  issuedOn: string;      // grant_date (YYYY-MM-DD)
  expiresOn: string;     // expiry_date (YYYY-MM-DD)
  status: 'AVAILABLE' | 'USED' | 'EXPIRED';
  effectiveStatus: CompensatoryLeaveStatus;
  issuedBy: string;
  cancelledAt: string | null;
  cancelledBy: string | null;
  createdAt: string;
  updatedAt: string;
  // 사용 정보 (조인)
  usageId?: string | null;
  usedOn?: string | null;
  usageRegisteredBy?: string | null;
  usageCreatedAt?: string | null;
  // 만료 D-Day 계산
  daysUntilExpiry?: number;
};

/** ADMIN 대체휴무 목록 Row */
export type CompensatoryLeaveRow = {
  id: string;
  employeeId: string;
  employeeNumber: string;
  fullName: string;
  department: string;
  employmentStatus: EmploymentStatus;
  sourceOvertimeId: string;
  sourceWorkDate: string;
  sourceStartedAt: string;
  sourceEndedAt: string;
  sourceDurationMinutes: number;
  sourceDescription: string;
  issuedOn: string;      // 발행일
  expiresOn: string;     // 만료일
  dbStatus: 'AVAILABLE' | 'USED' | 'EXPIRED';
  status: CompensatoryLeaveStatus; // Effective Status
  usedOn: string | null; // 사용일
  usageId: string | null;
  cancelledAt: string | null;
  daysUntilExpiry: number;
};

/** USER 본인 대체휴무 Row */
export type UserCompensatoryLeaveRow = {
  id: string;
  sourceWorkDate: string;
  sourceDurationMinutes: number;
  issuedOn: string;
  expiresOn: string;
  status: CompensatoryLeaveStatus;
  usedOn: string | null;
  daysUntilExpiry: number;
};

/** ADMIN 상단 통계 요약 */
export type CompensatoryLeaveSummary = {
  totalAvailableDays: number;     // 전체 사용가능 (일)
  usedThisMonthDays: number;      // 이번 달 사용 (일)
  expiringWithin30Days: number;   // 30일 이내 만료예정 (일)
  expiredDays: number;            // 만료 (일)
};

/** USER 상단 통계 요약 */
export type UserCompensatoryLeaveSummary = {
  availableDays: number;          // 사용가능 (일)
  usedDays: number;               // 사용완료 (일)
  expiringSoonDays: number;       // 30일 이내 만료예정 (일)
};

/** 30일 이내 만료예정 아이템 (대시보드 표시용) */
export type ExpiringSoonCompLeave = {
  id: string;
  employeeId: string;
  employeeNumber: string;
  fullName: string;
  department: string;
  sourceWorkDate: string;
  issuedOn: string;
  expiresOn: string;
  daysUntilExpiry: number;        // 0이면 오늘 만료
};

// ─── Excel 근태 일괄 업로드 관련 타입 (Phase 8) ───────────────────────────────

/** Excel Row 검증 상태 */
export type ExcelAttendanceRowStatus = 'NEW' | 'SAME' | 'CONFLICT' | 'WARNING' | 'ERROR';

/** 충돌 시 관리자 선택 처리방식 */
export type ExcelConflictResolution = 'KEEP_EXISTING' | 'OVERWRITE_EXCEL';

/** Excel 근태 미리보기 Row */
export interface ExcelAttendancePreviewRow {
  rowNumber: number;               // 엑셀 내 1-based Row 번호
  employeeNumber: string;          // 사번 (Source of Truth)
  employeeName: string | null;     // 엑셀 내 성명 (보조 정보)
  dbEmployeeId: string | null;     // DB 사원 식별자
  dbEmployeeName: string | null;   // DB 사원명
  department: string | null;       // DB 사원 부서
  workDate: string;                // YYYY-MM-DD
  checkInTime: string | null;      // HH:MM
  checkOutTime: string | null;     // HH:MM
  status: ExcelAttendanceRowStatus;
  resolution: ExcelConflictResolution;
  existingSource?: 'WEB' | 'ADMIN_EDIT' | 'EXCEL' | null;
  existingCheckIn?: string | null; // 기존 출근 (HH:MM)
  existingCheckOut?: string | null;// 기존 퇴근 (HH:MM)
  errors: string[];                // 오류 메시지 목록
  warnings: string[];              // 경고 메시지 목록
  canCommit: boolean;              // DB 반영 가능 여부
}

/** Excel 근태 미리보기 요약 통계 */
export interface ExcelAttendancePreviewSummary {
  totalRows: number;
  newCount: number;
  sameCount: number;
  conflictCount: number;
  warningCount: number;
  errorCount: number;
  canCommitCount: number;
}

/** Excel 근태 Commit 최종 결과 */
export interface ExcelAttendanceCommitResult {
  batchId: string;
  fileName: string;
  totalRows: number;
  newCount: number;
  updatedCount: number;
  keptExistingCount: number;
  sameCount: number;
  errorCount: number;
}

/** Excel Import Batch 이력 */
export interface AttendanceImportBatchRecord {
  id: string;
  actorEmployeeId: string;
  actorName?: string;
  fileName: string;
  fileSizeBytes: number;
  totalRows: number;
  newCount: number;
  updatedCount: number;
  sameCount: number;
  warningCount: number;
  errorCount: number;
  status: 'COMMITTED' | 'FAILED';
  createdAt: string;
}

// ─── 관리자 통합 근태 리포트 및 이상데이터/감사로그 타입 (Phase 9) ─────────

/** 월간 핵심 KPI 카드 데이터 */
export interface MonthlyReportKPI {
  activeEmployees: number;         // 근무대상 인원
  totalTargetWorkdays: number;     // 정상 근무일수 (해당 월 기준 근무일)
  normalDaysCount: number;         // 정상 출근 일수 총합
  lateCount: number;               // 지각 건수 총합
  earlyLeaveCount: number;         // 조퇴 건수 총합
  absentCount: number;             // 결근 건수 총합
  leaveMinutes: number;            // 연차 사용 분 총합
  leaveDays: number;               // 연차 사용 일수 총합 (leaveMinutes / 480)
  overtimeMinutes: number;         // 평일 연장근무시간 (분)
  holidayWorkMinutes: number;      // 휴일근무시간 (분)
  compLeaveUsedDays: number;       // 대체휴무 사용량 (일)
}

/** 직원별 월간 근태 요약 */
export interface EmployeeMonthlySummary {
  employeeId: string;
  employeeNumber: string;
  fullName: string;
  department: string;
  jobTitle: string;
  targetWorkdays: number;          // 해당 직원의 실질 근무대상일수
  normalDays: number;              // 정상 출근일수
  lateCount: number;               // 지각 횟수
  earlyLeaveCount: number;         // 조퇴 횟수
  absentDays: number;              // 결근 일수
  leaveMinutes: number;            // 연차 분
  leaveDays: number;               // 연차 일수
  compLeaveUsedDays: number;       // 대체휴무 사용 일수
  overtimeMinutes: number;         // 평일 연장근무 (분)
  holidayWorkMinutes: number;      // 휴일근무 (분)
}

/** 부서별 월간 근태 요약 */
export interface DepartmentMonthlySummary {
  department: string;
  employeeCount: number;
  targetWorkdays: number;
  normalDays: number;
  lateCount: number;
  earlyLeaveCount: number;
  absentDays: number;
  leaveDays: number;
  compLeaveUsedDays: number;
  overtimeMinutes: number;
  holidayWorkMinutes: number;
}

/** 직원 월간 일별 Drill-down 상세 */
export interface EmployeeDailyDrilldown {
  date: string;                    // YYYY-MM-DD
  dayOfWeek: string;               // 월, 화, 수...
  isWorkday: boolean;              // 근무일 여부
  dayTypeName: string;             // 일반근무일, 주말, 공휴일, 회사휴무일, 대체근무일
  standardStart: string;           // 09:00
  standardEnd: string;             // 18:00
  checkInAt: string | null;        // HH:MM
  checkOutAt: string | null;       // HH:MM
  representativeStatus: AttendanceStatus | null;
  isLate: boolean;
  isEarlyLeave: boolean;
  leaveType: LeaveType | null;
  isCompLeaveUsed: boolean;
  overtimeMinutes: number;
  holidayWorkMinutes: number;
  source: string | null;           // WEB, EXCEL, ADMIN_EDIT
}

/** 이상데이터 항목 */
export interface AttendanceAnomaly {
  id: string;
  severity: 'INFO' | 'WARNING' | 'ERROR';
  employeeId: string;
  employeeNumber: string;
  fullName: string;
  department: string;
  date: string;
  category:
    | 'CHECK_OUT_MISSING'
    | 'CHECK_IN_MISSING'
    | 'ATTENDANCE_ON_LEAVE'
    | 'ATTENDANCE_ON_COMP_LEAVE'
    | 'OVERTIME_WITHOUT_ATTENDANCE'
    | 'HOLIDAY_ATTENDANCE_WITHOUT_WORK'
    | 'EXPIRING_COMP_LEAVE'
    | 'DATE_OUT_OF_BOUNDS';
  message: string;
  linkUrl: string;
}

/** 감사로그 항목 (조회 및 표시용) */
export interface AuditLogQueryItem {
  id: string;
  createdAt: string;
  actorName: string;
  actorEmployeeNumber: string | null;
  feature: string;                 // 근태관리, 연차관리 등
  action: string;                  // CREATE, UPDATE, DELETE, LOGIN
  actionLabel: string;             // 등록, 수정, 취소, 로그인
  targetEmployeeName: string | null;
  targetEmployeeNumber: string | null;
  targetDate: string | null;
  beforeSummary: string | null;
  afterSummary: string | null;
  beforeJson: string | null;       // 마스킹 처리된 JSON
  afterJson: string | null;        // 마스킹 처리된 JSON
  reason: string | null;
}

/** 감사로그 페이지네이션 결과 */
export interface AuditLogPaginatedResult {
  logs: AuditLogQueryItem[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}