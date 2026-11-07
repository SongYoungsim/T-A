/**
 * lib/attendance.ts — 근태관리 서비스 레이어 (Phase 4)
 *
 * ── 설계 원칙 ──────────────────────────────────────────────────────────────────
 * 1. Asia/Seoul 기준 날짜 처리 (Cloudflare Workers UTC 환경)
 * 2. work_date는 출근 시점의 KST 날짜로 결정 (night shift 미지원)
 * 3. 분(minute of day) 기반 정수 연산으로 부동소수점 오차 방지
 * 4. Grace Period: 출근 +5분, 퇴근 -5분
 * 5. 지각+조퇴 동시 발생: 대표상태=LATE + isEarlyLeave=true 세부 플래그
 * 6. 연차 1순위: 연차가 있으면 연차 상태가 대표상태
 */

import { env } from 'cloudflare:workers';
import type {
  AttendanceJudgement,
  AttendanceListRow,
  AttendanceRecord,
  AttendanceStatus,
  CalendarDayType,
  DailyAttendanceJudgement,
  EffectiveWorkday,
  LeaveType,
  MonthlyAttendanceDay,
  MonthlyAttendanceSummary,
  TodayAttendance,
  WorkType,
} from '@/lib/hr-types';
import { getEffectiveWorkday, getEffectiveWorkdaysInRange } from '@/lib/calendar';

// ─── Grace Period ────────────────────────────────────────────────────────────
const GRACE_MINUTES = 5;

// ─── 날짜/시간 유틸리티 ───────────────────────────────────────────────────────

/** 현재 KST 날짜 YYYY-MM-DD */
export function todayKST(): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date());
}

/** 현재 시각 ISO 문자열 (UTC, DB 저장용) */
export function nowISO(): string {
  return new Date().toISOString();
}

/** ISO timestamp에서 KST 기준 분(minute of day) 추출 */
function isoToKSTMinuteOfDay(isoTimestamp: string): number {
  const d = new Date(isoTimestamp);
  const kstHour = parseInt(
    new Intl.DateTimeFormat('en', { hour: 'numeric', hour12: false, timeZone: 'Asia/Seoul' }).format(d),
    10,
  );
  const kstMinute = parseInt(
    new Intl.DateTimeFormat('en', { minute: 'numeric', timeZone: 'Asia/Seoul' }).format(d),
    10,
  );
  return kstHour * 60 + kstMinute;
}

/**
 * ISO timestamp에서 KST 기준 초 단위 minute-of-day 추출
 * (경계값 정밀 계산: 09:05:59 vs 09:06:00)
 */
function isoToKSTSecondOfDay(isoTimestamp: string): number {
  const d = new Date(isoTimestamp);
  // KST = UTC + 9시간
  const kstMs = d.getTime() + 9 * 3600 * 1000;
  const secondOfDay = Math.floor((kstMs % (24 * 3600 * 1000)) / 1000);
  return secondOfDay;
}

// ─── 핵심 근태 판정 함수 ──────────────────────────────────────────────────────

/**
 * calculateAttendanceStatus — 근태 대표상태 계산
 *
 * 우선순위:
 * 1. 연차(leaveType) → 연차 상태 반환
 * 2. 출퇴근 시간 기반 판정
 *
 * Grace Period:
 * - 출근: checkIn <= (standardStartMinute + 5분) × 60초 이면 정상
 * - 퇴근: checkOut >= (standardEndMinute - 5분) × 60초 이면 정상
 *
 * 지각+조퇴 동시: 대표=LATE, isEarlyLeave=true
 * 이유: 지각이 더 심각한 이탈이며, 조퇴는 세부 플래그로 추적.
 *       화면에서 "지각 · 조퇴" 복합 표시 가능.
 */
export function calculateAttendanceStatus(params: {
  standardStartMinute: number; // 기준출근 minute-of-day (예: 540 = 09:00)
  standardEndMinute: number;   // 기준퇴근 minute-of-day (예: 1080 = 18:00)
  checkInAt: string | null;    // ISO timestamp
  checkOutAt: string | null;   // ISO timestamp
  leaveType: LeaveType | null; // 연차 종류 (null이면 연차 없음)
}): AttendanceJudgement {
  const { standardStartMinute, standardEndMinute, checkInAt, checkOutAt, leaveType } = params;

  // 1순위: 연차 우선
  if (leaveType) {
    return {
      representativeStatus: leaveType as AttendanceStatus,
      isLate: false,
      isEarlyLeave: false,
    };
  }

  // 출근 기록 없음 → 미출근 상태 (결근 판정은 Phase 5)
  if (!checkInAt) {
    return {
      representativeStatus: null as unknown as AttendanceStatus,
      isLate: false,
      isEarlyLeave: false,
    };
  }

  // Grace Period 경계값 (초 단위)
  // 출근 정상 임계: standardStartMinute × 60 + GRACE_MINUTES × 60 + 59초
  // 예: 09:00 + 5분 = 09:05:59까지 정상, 09:06:00부터 지각
  const lateThresholdSec = (standardStartMinute + GRACE_MINUTES) * 60 + 59;
  const earlyLeaveThresholdSec = (standardEndMinute - GRACE_MINUTES) * 60;

  const checkInSec = isoToKSTSecondOfDay(checkInAt);
  const isLate = checkInSec > lateThresholdSec;

  // 퇴근 없으면 조퇴 판정하지 않음 (아직 근무 중)
  let isEarlyLeave = false;
  if (checkOutAt) {
    const checkOutSec = isoToKSTSecondOfDay(checkOutAt);
    isEarlyLeave = checkOutSec < earlyLeaveThresholdSec;
  }

  // 대표 상태 결정
  // 지각+조퇴 동시: LATE 우선 (isEarlyLeave 플래그로 조퇴 사실 보존)
  let representativeStatus: AttendanceStatus;
  if (isLate) {
    representativeStatus = 'LATE';
  } else if (isEarlyLeave) {
    representativeStatus = 'EARLY_LEAVE';
  } else {
    representativeStatus = 'NORMAL';
  }

  return { representativeStatus, isLate, isEarlyLeave };
}

// ─── Phase 5: 종합 일별 근태 판정 함수 ────────────────────────────────────────

/**
 * evaluateDailyAttendance — 단일 일자 종합 근태 판정
 *
 * 1. 직원 근무 대상 여부:
 *    - 입사일 이전 (date < hiredOn) -> 결근 아님
 *    - 퇴사일 이후 (resignationDate && date > resignationDate) -> 결근 아님
 *    - 휴직 기간 중 -> 결근 아님
 * 2. 근무일 여부 (isWorkday):
 *    - 주말, 공휴일, 회사 휴무일 -> 결근 아님 (휴일 출퇴근 기록 있으면 보존)
 * 3. 근무일인 경우:
 *    - 연차 있음 -> 연차 우선 (지각/조퇴 자동판정 안함)
 *    - 출퇴근 기록 있음 -> calculateAttendanceStatus() (NORMAL/LATE/EARLY_LEAVE)
 *    - 출퇴근 기록 없음:
 *       * 오늘 -> 미출근 (isNotClockedIn = true, isAbsent = false)
 *       * 미래 -> 예정일 (isAbsent = false)
 *       * 과거 -> 결근 (ABSENT, isAbsent = true)
 */
export function evaluateDailyAttendance(params: {
  date: string;
  today: string;
  hiredOn: string;
  resignationDate?: string | null;
  leavePeriods?: { startedOn: string; endedOn: string | null }[];
  effectiveWorkday: EffectiveWorkday;
  leaveType: LeaveType | null;
  overtimeType?: WorkType | null;
  overtimeMinutes?: number;
  checkInAt: string | null;
  checkOutAt: string | null;
  standardStartMinute: number;
  standardEndMinute: number;
  source?: string | null;
}): DailyAttendanceJudgement {
  const {
    date,
    today,
    hiredOn,
    resignationDate,
    leavePeriods = [],
    effectiveWorkday,
    leaveType,
    overtimeType = null,
    overtimeMinutes = 0,
    checkInAt,
    checkOutAt,
    standardStartMinute,
    standardEndMinute,
    source = null,
  } = params;

  const baseResult: DailyAttendanceJudgement = {
    date,
    representativeStatus: null,
    isWorkday: effectiveWorkday.isWorkday,
    dayType: effectiveWorkday.dayType,
    isLate: false,
    isEarlyLeave: false,
    isAbsent: false,
    isNotClockedIn: false,
    leaveType,
    overtimeType,
    overtimeMinutes,
    checkInAt,
    checkOutAt,
    dayName: effectiveWorkday.name,
    source,
  };

  // 1. 직원 근무 대상 여부 확인
  // 1-1. 입사일 이전
  if (date < hiredOn) {
    return {
      ...baseResult,
      isWorkday: false,
      reason: '입사 전',
    };
  }

  // 1-2. 퇴사일 이후 (퇴사일 익일부터 대상 제외)
  if (resignationDate && date > resignationDate) {
    return {
      ...baseResult,
      isWorkday: false,
      reason: '퇴사 후',
    };
  }

  // 1-3. 휴직 기간 중
  const inLeaveOfAbsence = leavePeriods.some(
    (p) => p.startedOn <= date && (!p.endedOn || date <= p.endedOn)
  );
  if (inLeaveOfAbsence) {
    return {
      ...baseResult,
      isWorkday: false,
      reason: '휴직 기간',
    };
  }

  // 2. 비근무일 (주말, 공휴일, 회사 지정 휴무일)
  if (!effectiveWorkday.isWorkday) {
    // 2-1. 휴일근무 등록 건이 있는 경우
    if (overtimeType === 'HOLIDAY_WORK') {
      return {
        ...baseResult,
        representativeStatus: 'HOLIDAY_WORK',
        dayName: effectiveWorkday.name || '휴일근무',
        reason: '휴일근무 승인 등록됨',
      };
    }

    // 2-2. 휴일에 출퇴근 기록이 있는 경우
    if (checkInAt || checkOutAt) {
      return {
        ...baseResult,
        reason: '휴일 출근 기록 있음',
      };
    }
    return baseResult;
  }

  // 3. 근무일인 경우
  // 3-1. 연차 우선 (연차가 등록되어 있으면 연장근무가 있어도 연차 상태 우선)
  if (leaveType) {
    return {
      ...baseResult,
      representativeStatus: leaveType as AttendanceStatus,
      isLate: false,
      isEarlyLeave: false,
      isAbsent: false,
    };
  }

  // 3-2. 평일 연장근무 등록 건이 있는 경우
  if (overtimeType === 'OVERTIME') {
    if (checkInAt) {
      const judgement = calculateAttendanceStatus({
        standardStartMinute,
        standardEndMinute,
        checkInAt,
        checkOutAt,
        leaveType: null,
      });
      return {
        ...baseResult,
        representativeStatus: 'OVERTIME',
        isLate: judgement.isLate,
        isEarlyLeave: judgement.isEarlyLeave,
        isAbsent: false,
      };
    }

    // 출퇴근 기록이 없는데 연장근무가 등록된 이상 데이터 상황
    const isPast = date < today;
    const isToday = date === today;
    return {
      ...baseResult,
      representativeStatus: 'OVERTIME',
      isAbsent: isPast,
      isNotClockedIn: isToday,
      reason: isPast
        ? '출퇴근 기록 없음 (연장근무 등록됨 / 결근 의심)'
        : isToday
          ? '출퇴근 기록 없음 (미출근)'
          : '예정 근무일 (연장근무 등록됨)',
    };
  }

  // 3-3. 일반 출퇴근 기록 있음
  if (checkInAt) {
    const judgement = calculateAttendanceStatus({
      standardStartMinute,
      standardEndMinute,
      checkInAt,
      checkOutAt,
      leaveType: null,
    });
    return {
      ...baseResult,
      representativeStatus: judgement.representativeStatus,
      isLate: judgement.isLate,
      isEarlyLeave: judgement.isEarlyLeave,
      isAbsent: false,
    };
  }

  // 3-4. 출근 기록 없음
  // 오늘인 경우 -> '미출근' (진행 중)
  if (date === today) {
    return {
      ...baseResult,
      isNotClockedIn: true,
      isAbsent: false,
      representativeStatus: null,
      reason: '미출근',
    };
  }

  // 미래 날짜인 경우 -> 결근 아님
  if (date > today) {
    return {
      ...baseResult,
      isAbsent: false,
      representativeStatus: null,
      reason: '예정 근무일',
    };
  }

  // 과거 날짜인 경우 -> '결근' 확정
  return {
    ...baseResult,
    isAbsent: true,
    representativeStatus: 'ABSENT',
    reason: '결근',
  };
}

// ─── DB 조회 / 저장 함수 ──────────────────────────────────────────────────────

/** 오늘(KST) 직원의 Attendance 레코드 조회 */
export async function getTodayAttendance(
  employeeId: string,
): Promise<AttendanceRecord | null> {
  const today = todayKST();
  return await getAttendanceByDate(employeeId, today);
}

/** 특정 날짜 Attendance 레코드 조회 */
export async function getAttendanceByDate(
  employeeId: string,
  workDate: string,
): Promise<AttendanceRecord | null> {
  const row = await env.DB.prepare(
    `SELECT
       id, employee_id AS employeeId, work_date AS workDate,
       check_in_at AS checkInAt, check_out_at AS checkOutAt,
       source,
       representative_status AS representativeStatus,
       COALESCE(is_late, 0) AS isLate,
       COALESCE(is_early_leave, 0) AS isEarlyLeave,
       original_check_in_at AS originalCheckInAt,
       original_check_out_at AS originalCheckOutAt,
       created_at AS createdAt, updated_at AS updatedAt
     FROM attendance
     WHERE employee_id = ? AND work_date = ?
     LIMIT 1`,
  ).bind(employeeId, workDate).first<{
    id: string;
    employeeId: string;
    workDate: string;
    checkInAt: string | null;
    checkOutAt: string | null;
    source: string;
    representativeStatus: string | null;
    isLate: number;
    isEarlyLeave: number;
    originalCheckInAt: string | null;
    originalCheckOutAt: string | null;
    createdAt: string;
    updatedAt: string;
  }>();

  if (!row) return null;

  return {
    ...row,
    source: row.source as AttendanceRecord['source'],
    representativeStatus: row.representativeStatus as AttendanceStatus | null,
    isLate: Boolean(row.isLate),
    isEarlyLeave: Boolean(row.isEarlyLeave),
  };
}

/**
 * 해당 날짜에 활성화된 연차 조회
 * (cancelled_at IS NULL 인 leave_usages)
 */
export async function getActiveLeaveForDate(
  employeeId: string,
  date: string,
): Promise<{ leaveType: LeaveType } | null> {
  return await env.DB.prepare(
    `SELECT leave_type AS leaveType
     FROM leave_usages
     WHERE employee_id = ? AND leave_date = ? AND cancelled_at IS NULL
     LIMIT 1`,
  ).bind(employeeId, date).first<{ leaveType: LeaveType }>();
}

/**
 * 직원의 표준 출퇴근 시간 조회
 */
async function getStandardTimes(
  employeeId: string,
): Promise<{ standardStartMinute: number; standardEndMinute: number } | null> {
  return await env.DB.prepare(
    `SELECT standard_start_minute AS standardStartMinute,
            standard_end_minute AS standardEndMinute
     FROM employees WHERE id = ? LIMIT 1`,
  ).bind(employeeId).first<{ standardStartMinute: number; standardEndMinute: number }>();
}

/**
 * 직원이 해당 날짜에 휴직 중인지 확인
 */
async function isOnLeaveOfAbsence(
  employeeId: string,
  date: string,
): Promise<boolean> {
  const row = await env.DB.prepare(
    `SELECT id FROM leave_of_absence_periods
     WHERE employee_id = ?
       AND started_on <= ?
       AND (ended_on IS NULL OR ended_on >= ?)
     LIMIT 1`,
  ).bind(employeeId, date, date).first<{ id: string }>();
  return !!row;
}

// ─── 출근 등록 ────────────────────────────────────────────────────────────────

export type ClockResult =
  | { ok: true; message: string }
  | { ok: false; error: string; code?: string };

/**
 * 출근 등록 (USER 전용, 서버 시간 사용)
 */
export async function clockIn(employeeId: string): Promise<ClockResult> {
  const now = new Date();
  const workDate = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(now);
  const nowIso = now.toISOString();

  // 직원 상태 확인
  const emp = await env.DB.prepare(
    `SELECT employment_status AS employmentStatus FROM employees WHERE id = ? LIMIT 1`,
  ).bind(employeeId).first<{ employmentStatus: string }>();

  if (!emp) return { ok: false, error: '직원 정보를 찾을 수 없습니다.' };
  if (emp.employmentStatus === 'RESIGNED') {
    return { ok: false, error: '퇴사한 직원은 출근할 수 없습니다.', code: 'RESIGNED' };
  }
  if (emp.employmentStatus === 'LEAVE') {
    const onLeave = await isOnLeaveOfAbsence(employeeId, workDate);
    if (onLeave) {
      return { ok: false, error: '현재 휴직기간에는 출퇴근을 등록할 수 없습니다.', code: 'ON_LEAVE' };
    }
  }

  // 기존 출근 기록 확인 (중복 방지)
  const existing = await getAttendanceByDate(employeeId, workDate);
  if (existing?.checkInAt) {
    return { ok: false, error: '오늘 출근은 이미 등록되었습니다.', code: 'ALREADY_CLOCKED_IN' };
  }

  // 연차 조회
  const leave = await getActiveLeaveForDate(employeeId, workDate);
  const standards = await getStandardTimes(employeeId);

  // 근태 판정
  const judgement = calculateAttendanceStatus({
    standardStartMinute: standards?.standardStartMinute ?? 540,
    standardEndMinute: standards?.standardEndMinute ?? 1080,
    checkInAt: nowIso,
    checkOutAt: null,
    leaveType: leave?.leaveType ?? null,
  });

  try {
    if (existing) {
      // 레코드가 있지만 checkInAt이 없는 경우 (이론상 없지만 방어적 처리)
      await env.DB.prepare(
        `UPDATE attendance
         SET check_in_at = ?, source = 'WEB',
             representative_status = ?,
             is_late = ?, is_early_leave = ?,
             updated_at = ?
         WHERE employee_id = ? AND work_date = ?`,
      ).bind(
        nowIso,
        judgement.representativeStatus,
        judgement.isLate ? 1 : 0,
        judgement.isEarlyLeave ? 1 : 0,
        nowIso,
        employeeId,
        workDate,
      ).run();
    } else {
      await env.DB.prepare(
        `INSERT INTO attendance
         (id, employee_id, work_date, check_in_at, check_out_at, source,
          representative_status, is_late, is_early_leave,
          original_check_in_at, original_check_out_at,
          created_at, updated_at)
         VALUES (?, ?, ?, ?, NULL, 'WEB', ?, ?, ?, NULL, NULL, ?, ?)`,
      ).bind(
        crypto.randomUUID(),
        employeeId,
        workDate,
        nowIso,
        judgement.representativeStatus,
        judgement.isLate ? 1 : 0,
        judgement.isEarlyLeave ? 1 : 0,
        nowIso,
        nowIso,
      ).run();
    }

    const label = judgement.isLate ? '(지각)' : '';
    return { ok: true, message: `출근이 등록되었습니다. ${label}`.trim() };
  } catch (e) {
    if (String(e).toLowerCase().includes('unique')) {
      return { ok: false, error: '오늘 출근은 이미 등록되었습니다.', code: 'ALREADY_CLOCKED_IN' };
    }
    throw e;
  }
}

// ─── 퇴근 등록 ────────────────────────────────────────────────────────────────

/**
 * 퇴근 등록 (USER 전용, 서버 시간 사용)
 */
export async function clockOut(employeeId: string): Promise<ClockResult> {
  const now = new Date();
  const workDate = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(now);
  const nowIso = now.toISOString();

  // 오늘 출근 기록 확인
  const existing = await getAttendanceByDate(employeeId, workDate);
  if (!existing || !existing.checkInAt) {
    return { ok: false, error: '출근 기록이 없습니다.', code: 'NO_CLOCK_IN' };
  }
  if (existing.checkOutAt) {
    return { ok: false, error: '오늘 퇴근은 이미 등록되었습니다.', code: 'ALREADY_CLOCKED_OUT' };
  }

  // 연차 조회
  const leave = await getActiveLeaveForDate(employeeId, workDate);
  const standards = await getStandardTimes(employeeId);

  // 근태 재판정 (출근+퇴근 모두 포함)
  const judgement = calculateAttendanceStatus({
    standardStartMinute: standards?.standardStartMinute ?? 540,
    standardEndMinute: standards?.standardEndMinute ?? 1080,
    checkInAt: existing.checkInAt,
    checkOutAt: nowIso,
    leaveType: leave?.leaveType ?? null,
  });

  await env.DB.prepare(
    `UPDATE attendance
     SET check_out_at = ?,
         representative_status = ?,
         is_late = ?, is_early_leave = ?,
         updated_at = ?
     WHERE employee_id = ? AND work_date = ?`,
  ).bind(
    nowIso,
    judgement.representativeStatus,
    judgement.isLate ? 1 : 0,
    judgement.isEarlyLeave ? 1 : 0,
    nowIso,
    employeeId,
    workDate,
  ).run();

  return { ok: true, message: '퇴근이 등록되었습니다.' };
}

// ─── ADMIN 보정 ────────────────────────────────────────────────────────────────

export type AdminEditParams = {
  attendanceId: string;
  checkInAt: string | null;  // ISO timestamp
  checkOutAt: string | null; // ISO timestamp
  reason: string;
  actorId: string;
};

/**
 * ADMIN 출퇴근 시간 보정
 * - 보정 후 근태 재판정
 * - 원본 시간 보존 (original_check_in_at / original_check_out_at)
 * - Audit Log 기록
 */
export async function adminEditAttendance(
  params: AdminEditParams,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { attendanceId, checkInAt, checkOutAt, reason, actorId } = params;

  // 현재 레코드 조회
  const current = await env.DB.prepare(
    `SELECT
       a.id, a.employee_id AS employeeId, a.work_date AS workDate,
       a.check_in_at AS checkInAt, a.check_out_at AS checkOutAt,
       a.representative_status AS representativeStatus,
       a.is_late AS isLate, a.is_early_leave AS isEarlyLeave,
       a.original_check_in_at AS originalCheckInAt,
       a.original_check_out_at AS originalCheckOutAt,
       e.standard_start_minute AS standardStartMinute,
       e.standard_end_minute AS standardEndMinute
     FROM attendance a
     JOIN employees e ON e.id = a.employee_id
     WHERE a.id = ? LIMIT 1`,
  ).bind(attendanceId).first<{
    id: string;
    employeeId: string;
    workDate: string;
    checkInAt: string | null;
    checkOutAt: string | null;
    representativeStatus: string | null;
    isLate: number;
    isEarlyLeave: number;
    originalCheckInAt: string | null;
    originalCheckOutAt: string | null;
    standardStartMinute: number;
    standardEndMinute: number;
  }>();

  if (!current) return { ok: false, error: '근태 기록을 찾을 수 없습니다.' };

  // 연차 확인
  const leave = await getActiveLeaveForDate(current.employeeId, current.workDate);

  // 보정 후 근태 재판정
  const judgement = calculateAttendanceStatus({
    standardStartMinute: current.standardStartMinute,
    standardEndMinute: current.standardEndMinute,
    checkInAt,
    checkOutAt,
    leaveType: leave?.leaveType ?? null,
  });

  // 최초 보정 시에만 원본 시간 저장
  const originalCheckInAt = current.originalCheckInAt ?? current.checkInAt;
  const originalCheckOutAt = current.originalCheckOutAt ?? current.checkOutAt;

  const now = nowISO();

  const beforeJson = JSON.stringify({
    checkInAt: current.checkInAt,
    checkOutAt: current.checkOutAt,
    representativeStatus: current.representativeStatus,
    isLate: Boolean(current.isLate),
    isEarlyLeave: Boolean(current.isEarlyLeave),
  });
  const afterJson = JSON.stringify({
    checkInAt,
    checkOutAt,
    representativeStatus: judgement.representativeStatus,
    isLate: judgement.isLate,
    isEarlyLeave: judgement.isEarlyLeave,
  });

  await env.DB.batch([
    env.DB.prepare(
      `UPDATE attendance
       SET check_in_at = ?, check_out_at = ?,
           source = 'ADMIN_EDIT',
           representative_status = ?,
           is_late = ?, is_early_leave = ?,
           original_check_in_at = ?, original_check_out_at = ?,
           updated_at = ?
       WHERE id = ?`,
    ).bind(
      checkInAt,
      checkOutAt,
      judgement.representativeStatus,
      judgement.isLate ? 1 : 0,
      judgement.isEarlyLeave ? 1 : 0,
      originalCheckInAt,
      originalCheckOutAt,
      now,
      attendanceId,
    ),
    env.DB.prepare(
      `INSERT INTO audit_logs
       (id, actor_employee_id, target_employee_id, entity_type, entity_id,
        action, target_date, before_json, after_json, reason, created_at)
       VALUES (?, ?, ?, 'ATTENDANCE', ?, 'UPDATE', ?, ?, ?, ?, ?)`,
    ).bind(
      crypto.randomUUID(),
      actorId,
      current.employeeId,
      attendanceId,
      current.workDate,
      beforeJson,
      afterJson,
      reason,
      now,
    ),
  ]);

  return { ok: true };
}

/**
 * ADMIN: 출근 레코드가 없는 날짜에 신규 생성 (보정용)
 */
export async function adminCreateAttendance(params: {
  employeeId: string;
  workDate: string;
  checkInAt: string | null;
  checkOutAt: string | null;
  reason: string;
  actorId: string;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const { employeeId, workDate, checkInAt, checkOutAt, reason, actorId } = params;

  const standards = await getStandardTimes(employeeId);
  const leave = await getActiveLeaveForDate(employeeId, workDate);

  const judgement = calculateAttendanceStatus({
    standardStartMinute: standards?.standardStartMinute ?? 540,
    standardEndMinute: standards?.standardEndMinute ?? 1080,
    checkInAt,
    checkOutAt,
    leaveType: leave?.leaveType ?? null,
  });

  const id = crypto.randomUUID();
  const now = nowISO();
  const afterJson = JSON.stringify({ checkInAt, checkOutAt, representativeStatus: judgement.representativeStatus });

  try {
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO attendance
         (id, employee_id, work_date, check_in_at, check_out_at,
          source, representative_status, is_late, is_early_leave,
          original_check_in_at, original_check_out_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'ADMIN_EDIT', ?, ?, ?, NULL, NULL, ?, ?)`,
      ).bind(
        id, employeeId, workDate, checkInAt, checkOutAt,
        judgement.representativeStatus,
        judgement.isLate ? 1 : 0,
        judgement.isEarlyLeave ? 1 : 0,
        now, now,
      ),
      env.DB.prepare(
        `INSERT INTO audit_logs
         (id, actor_employee_id, target_employee_id, entity_type, entity_id,
          action, target_date, before_json, after_json, reason, created_at)
         VALUES (?, ?, ?, 'ATTENDANCE', ?, 'CREATE', ?, NULL, ?, ?, ?)`,
      ).bind(
        crypto.randomUUID(), actorId, employeeId, id,
        workDate, afterJson, reason, now,
      ),
    ]);
    return { ok: true, id };
  } catch (e) {
    if (String(e).toLowerCase().includes('unique')) {
      return { ok: false, error: '해당 날짜에 이미 출근 기록이 있습니다.' };
    }
    throw e;
  }
}

// ─── 조회 함수 ─────────────────────────────────────────────────────────────────

/** USER 오늘 Attendance 요약 (Dashboard용) */
export async function getTodayAttendanceSummary(
  employeeId: string,
): Promise<TodayAttendance | null> {
  const today = todayKST();
  const row = await env.DB.prepare(
    `SELECT work_date AS workDate, check_in_at AS checkInAt, check_out_at AS checkOutAt,
            representative_status AS representativeStatus,
            COALESCE(is_late, 0) AS isLate, COALESCE(is_early_leave, 0) AS isEarlyLeave
     FROM attendance
     WHERE employee_id = ? AND work_date = ?
     LIMIT 1`,
  ).bind(employeeId, today).first<{
    workDate: string;
    checkInAt: string | null;
    checkOutAt: string | null;
    representativeStatus: string | null;
    isLate: number;
    isEarlyLeave: number;
  }>();

  if (!row) return null;
  return {
    ...row,
    representativeStatus: row.representativeStatus as AttendanceStatus | null,
    isLate: Boolean(row.isLate),
    isEarlyLeave: Boolean(row.isEarlyLeave),
  };
}

/** ADMIN: 월간 근태 목록 조회 (연도-월 기준) */
export async function listMonthlyAttendanceAdmin(params: {
  year: number;
  month: number;
  employeeId?: string;
  department?: string;
  status?: AttendanceStatus;
}): Promise<AttendanceListRow[]> {
  const { year, month, employeeId, department, status } = params;
  const from = `${year}-${String(month).padStart(2, '0')}-01`;
  const toMonth = month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, '0')}`;
  const to = `${toMonth}-01`;

  let sql = `
    SELECT
      a.id AS attendanceId,
      e.id AS employeeId,
      e.employee_number AS employeeNumber,
      e.full_name AS fullName,
      e.department,
      e.standard_start_minute AS standardStartMinute,
      e.standard_end_minute AS standardEndMinute,
      COALESCE(a.work_date, '') AS workDate,
      a.check_in_at AS checkInAt,
      a.check_out_at AS checkOutAt,
      a.source,
      a.representative_status AS representativeStatus,
      COALESCE(a.is_late, 0) AS isLate,
      COALESCE(a.is_early_leave, 0) AS isEarlyLeave,
      lu.leave_type AS leaveType,
      ow.work_type AS overtimeType,
      ow.duration_minutes AS overtimeMinutes
    FROM attendance a
    JOIN employees e ON e.id = a.employee_id
    LEFT JOIN leave_usages lu
      ON lu.employee_id = a.employee_id
      AND lu.leave_date = a.work_date
      AND lu.cancelled_at IS NULL
    LEFT JOIN overtime_works ow
      ON ow.employee_id = a.employee_id
      AND ow.work_date = a.work_date
      AND ow.cancelled_at IS NULL
    WHERE a.work_date >= ? AND a.work_date < ?
      AND e.employment_status <> 'RESIGNED'
  `;
  const binds: unknown[] = [from, to];

  if (employeeId) { sql += ` AND e.id = ?`; binds.push(employeeId); }
  if (department && department !== 'ALL') { sql += ` AND e.department = ?`; binds.push(department); }
  if (status) { sql += ` AND a.representative_status = ?`; binds.push(status); }
  sql += ` ORDER BY a.work_date DESC, e.employee_number`;

  const rows = await env.DB.prepare(sql).bind(...binds).all<{
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
    representativeStatus: string | null;
    isLate: number;
    isEarlyLeave: number;
    leaveType: string | null;
    overtimeType: string | null;
    overtimeMinutes: number | null;
  }>();

  return rows.results.map((r) => {
    let representativeStatus = r.representativeStatus as AttendanceStatus | null;
    if (!r.leaveType) {
      if (r.overtimeType === 'OVERTIME') {
        representativeStatus = 'OVERTIME';
      } else if (r.overtimeType === 'HOLIDAY_WORK') {
        representativeStatus = 'HOLIDAY_WORK';
      }
    }

    return {
      ...r,
      representativeStatus,
      isLate: Boolean(r.isLate),
      isEarlyLeave: Boolean(r.isEarlyLeave),
      leaveType: r.leaveType as LeaveType | null,
      overtimeType: r.overtimeType as WorkType | null,
      overtimeMinutes: r.overtimeMinutes ?? 0,
    };
  });
}

/** ADMIN: 특정 날짜 전직원 근태 조회 (Phase 5: 결근/미출근 및 캘린더 연동) */
export async function listDayAttendanceAdmin(date: string): Promise<AttendanceListRow[]> {
  const effectiveWorkday = await getEffectiveWorkday(date);
  const today = todayKST();

  const rows = await env.DB.prepare(`
    SELECT
      a.id AS attendanceId,
      e.id AS employeeId,
      e.employee_number AS employeeNumber,
      e.full_name AS fullName,
      e.department,
      e.hired_on AS hiredOn,
      COALESCE(e.resignation_date, e.terminated_on) AS resignationDate,
      e.standard_start_minute AS standardStartMinute,
      e.standard_end_minute AS standardEndMinute,
      COALESCE(a.work_date, ?) AS workDate,
      a.check_in_at AS checkInAt,
      a.check_out_at AS checkOutAt,
      a.source,
      a.representative_status AS representativeStatus,
      COALESCE(a.is_late, 0) AS isLate,
      COALESCE(a.is_early_leave, 0) AS isEarlyLeave,
      lu.leave_type AS leaveType,
      ow.work_type AS overtimeType,
      ow.duration_minutes AS overtimeMinutes
    FROM employees e
    LEFT JOIN attendance a
      ON a.employee_id = e.id AND a.work_date = ?
    LEFT JOIN leave_usages lu
      ON lu.employee_id = e.id
      AND lu.leave_date = ?
      AND lu.cancelled_at IS NULL
    LEFT JOIN overtime_works ow
      ON ow.employee_id = e.id
      AND ow.work_date = ?
      AND ow.cancelled_at IS NULL
    WHERE e.employment_status <> 'RESIGNED' OR (COALESCE(e.resignation_date, e.terminated_on) >= ?)
    ORDER BY e.employee_number
  `).bind(date, date, date, date, date).all<{
    attendanceId: string | null;
    employeeId: string;
    employeeNumber: string;
    fullName: string;
    department: string;
    hiredOn: string;
    resignationDate: string | null;
    standardStartMinute: number;
    standardEndMinute: number;
    workDate: string;
    checkInAt: string | null;
    checkOutAt: string | null;
    source: string | null;
    representativeStatus: string | null;
    isLate: number;
    isEarlyLeave: number;
    leaveType: string | null;
    overtimeType: string | null;
    overtimeMinutes: number | null;
  }>();

  // 휴직 기간 조회
  const leaveAbsenceRows = await env.DB.prepare(`
    SELECT employee_id AS employeeId, started_on AS startedOn, ended_on AS endedOn
    FROM leave_of_absence_periods
    WHERE started_on <= ? AND (ended_on IS NULL OR ended_on >= ?)
  `).bind(date, date).all<{ employeeId: string; startedOn: string; endedOn: string | null }>();

  const leaveAbsenceMap = new Map<string, { startedOn: string; endedOn: string | null }[]>();
  for (const l of leaveAbsenceRows.results) {
    if (!leaveAbsenceMap.has(l.employeeId)) leaveAbsenceMap.set(l.employeeId, []);
    leaveAbsenceMap.get(l.employeeId)!.push(l);
  }

  return rows.results.map((r) => {
    const leavePeriods = leaveAbsenceMap.get(r.employeeId) ?? [];
    const judgement = evaluateDailyAttendance({
      date,
      today,
      hiredOn: r.hiredOn,
      resignationDate: r.resignationDate,
      leavePeriods,
      effectiveWorkday,
      leaveType: r.leaveType as LeaveType | null,
      overtimeType: r.overtimeType as WorkType | null,
      overtimeMinutes: r.overtimeMinutes ?? 0,
      checkInAt: r.checkInAt,
      checkOutAt: r.checkOutAt,
      standardStartMinute: r.standardStartMinute,
      standardEndMinute: r.standardEndMinute,
      source: r.source,
    });

    return {
      attendanceId: r.attendanceId,
      employeeId: r.employeeId,
      employeeNumber: r.employeeNumber,
      fullName: r.fullName,
      department: r.department,
      standardStartMinute: r.standardStartMinute,
      standardEndMinute: r.standardEndMinute,
      workDate: date,
      checkInAt: r.checkInAt,
      checkOutAt: r.checkOutAt,
      source: r.source,
      representativeStatus: judgement.representativeStatus,
      isLate: judgement.isLate,
      isEarlyLeave: judgement.isEarlyLeave,
      isAbsent: judgement.isAbsent,
      isNotClockedIn: judgement.isNotClockedIn,
      isWorkday: judgement.isWorkday,
      dayType: judgement.dayType,
      dayName: judgement.dayName,
      leaveType: r.leaveType as LeaveType | null,
      overtimeType: judgement.overtimeType,
      overtimeMinutes: judgement.overtimeMinutes,
      reason: judgement.reason,
    };
  });
}

/** ADMIN: 기간별 전직원 근태 조회 (시작일/종료일 포함, 최대 31일) */
export async function listAttendanceRangeAdmin(from: string, to: string): Promise<AttendanceListRow[]> {
  if (from > to) {
    throw new Error('시작일은 종료일보다 늦을 수 없습니다.');
  }

  const dates: string[] = [];
  const cursor = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);

  while (cursor <= end && dates.length < 31) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  if (cursor <= end) {
    throw new Error('근태 조회 기간은 최대 31일까지 선택할 수 있습니다.');
  }

  const dailyRows = await Promise.all(dates.map((date) => listDayAttendanceAdmin(date)));
  return dailyRows.flat().sort((a, b) => {
    const dateOrder = b.workDate.localeCompare(a.workDate);
    return dateOrder || a.employeeNumber.localeCompare(b.employeeNumber);
  });
}

/** USER: 월간 달력 데이터 (Phase 5: 월간 전체 달력 일자 + 결근/미출근/공휴일/휴무일 반영) */
export async function getUserMonthlyAttendance(
  employeeId: string,
  year: number,
  month: number,
): Promise<{ days: MonthlyAttendanceDay[]; summary: MonthlyAttendanceSummary }> {
  const from = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDayNum = new Date(year, month, 0).getDate();
  const to = `${year}-${String(month).padStart(2, '0')}-${String(lastDayNum).padStart(2, '0')}`;
  const nextMonthFirst = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`;

  const today = todayKST();

  // 1. 직원 정보 및 기준시간 조회
  const emp = await env.DB.prepare(`
    SELECT hired_on AS hiredOn, COALESCE(resignation_date, terminated_on) AS resignationDate,
           standard_start_minute AS standardStartMinute, standard_end_minute AS standardEndMinute
    FROM employees WHERE id = ? LIMIT 1
  `).bind(employeeId).first<{
    hiredOn: string;
    resignationDate: string | null;
    standardStartMinute: number;
    standardEndMinute: number;
  }>();

  const hiredOn = emp?.hiredOn ?? '1970-01-01';
  const resignationDate = emp?.resignationDate ?? null;
  const standardStartMinute = emp?.standardStartMinute ?? 540;
  const standardEndMinute = emp?.standardEndMinute ?? 1080;

  // 휴직 기간 조회
  const leavePeriods = (await env.DB.prepare(`
    SELECT started_on AS startedOn, ended_on AS endedOn
    FROM leave_of_absence_periods
    WHERE employee_id = ?
  `).bind(employeeId).all<{ startedOn: string; endedOn: string | null }>()).results;

  // 2. 월간 전체 일자에 대한 EffectiveWorkday 맵 조회
  const workdayMap = await getEffectiveWorkdaysInRange(from, to);

  // 3. 해당 월 출퇴근 기록 조회
  const attRows = await env.DB.prepare(`
    SELECT work_date AS date, check_in_at AS checkInAt, check_out_at AS checkOutAt,
           representative_status AS representativeStatus,
           COALESCE(is_late, 0) AS isLate, COALESCE(is_early_leave, 0) AS isEarlyLeave,
           source
    FROM attendance
    WHERE employee_id = ? AND work_date >= ? AND work_date < ?
    ORDER BY work_date
  `).bind(employeeId, from, nextMonthFirst).all<{
    date: string;
    checkInAt: string | null;
    checkOutAt: string | null;
    representativeStatus: string | null;
    isLate: number;
    isEarlyLeave: number;
    source: string | null;
  }>();

  const attMap = new Map<string, (typeof attRows.results)[0]>();
  for (const r of attRows.results) {
    attMap.set(r.date, r);
  }

  // 4. 해당 월 연차 기록 조회
  const leaveRows = await env.DB.prepare(`
    SELECT lu.leave_date AS date, lu.leave_type AS leaveType
    FROM leave_usages lu
    WHERE lu.employee_id = ?
      AND lu.leave_date >= ? AND lu.leave_date < ?
      AND lu.cancelled_at IS NULL
  `).bind(employeeId, from, nextMonthFirst).all<{ date: string; leaveType: string }>();

  const leaveMap = new Map<string, LeaveType>();
  for (const l of leaveRows.results) {
    leaveMap.set(l.date, l.leaveType as LeaveType);
  }

  // 4-1. 해당 월 연장/휴일근무 기록 조회
  const overtimeRows = await env.DB.prepare(`
    SELECT work_date AS date, work_type AS workType, duration_minutes AS actualMinutes
    FROM overtime_works
    WHERE employee_id = ?
      AND work_date >= ? AND work_date < ?
      AND cancelled_at IS NULL
  `).bind(employeeId, from, nextMonthFirst).all<{ date: string; workType: string; actualMinutes: number }>();

  const overtimeMap = new Map<string, { workType: WorkType; actualMinutes: number }>();
  for (const ot of overtimeRows.results) {
    overtimeMap.set(ot.date, {
      workType: ot.workType as WorkType,
      actualMinutes: ot.actualMinutes,
    });
  }

  // 5. 1일부터 말일까지 매일 상태 산출
  const days: MonthlyAttendanceDay[] = [];
  const summary: MonthlyAttendanceSummary = {
    normal: 0,
    late: 0,
    earlyLeave: 0,
    absent: 0,
    leaveUsed: 0,
  };

  for (let d = 1; d <= lastDayNum; d++) {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const effective = workdayMap.get(dateStr) ?? {
      date: dateStr,
      dayType: 'NORMAL_WORKDAY' as CalendarDayType,
      isWorkday: true,
      name: null,
      memo: null,
      source: 'DEFAULT',
    };

    const att = attMap.get(dateStr);
    const leaveType = leaveMap.get(dateStr) ?? null;
    const ot = overtimeMap.get(dateStr);

    const judgement = evaluateDailyAttendance({
      date: dateStr,
      today,
      hiredOn,
      resignationDate,
      leavePeriods,
      effectiveWorkday: effective,
      leaveType,
      overtimeType: ot?.workType ?? null,
      overtimeMinutes: ot?.actualMinutes ?? 0,
      checkInAt: att?.checkInAt ?? null,
      checkOutAt: att?.checkOutAt ?? null,
      standardStartMinute,
      standardEndMinute,
      source: att?.source ?? null,
    });

    days.push({
      date: dateStr,
      checkInAt: judgement.checkInAt,
      checkOutAt: judgement.checkOutAt,
      representativeStatus: judgement.representativeStatus,
      isLate: judgement.isLate,
      isEarlyLeave: judgement.isEarlyLeave,
      isAbsent: judgement.isAbsent,
      isNotClockedIn: judgement.isNotClockedIn,
      isWorkday: judgement.isWorkday,
      dayType: judgement.dayType,
      dayName: judgement.dayName,
      leaveType: judgement.leaveType,
      overtimeType: judgement.overtimeType,
      overtimeMinutes: judgement.overtimeMinutes,
      source: judgement.source,
      reason: judgement.reason,
    });

    // 요약 집계
    if (judgement.leaveType) {
      summary.leaveUsed++;
    } else if (judgement.isAbsent) {
      summary.absent++;
    } else if (judgement.representativeStatus === 'NORMAL') {
      summary.normal++;
    } else if (judgement.isLate) {
      summary.late++;
      if (judgement.isEarlyLeave) summary.earlyLeave++;
    } else if (judgement.isEarlyLeave) {
      summary.earlyLeave++;
    }
  }

  return { days, summary };
}

/** ADMIN Dashboard: 오늘 근태 요약 (Phase 5: 오늘 휴일 여부 안내) */
export async function getTodayAttendanceDashboard(): Promise<{
  activeEmployees: number;
  clockedIn: number;
  notClockedIn: number;
  lateCount: number;
  leaveCount: number;
  isHoliday: boolean;
  holidayName: string | null;
  dayType: CalendarDayType;
  overtimeCount: number;
  holidayWorkCount: number;
  staffList: {
    fullName: string;
    department: string;
    standardStart: string;
    checkInAt: string | null;
    checkOutAt: string | null;
    status: string;
    overtimeType?: string | null;
  }[];
}> {
  const today = todayKST();
  const effectiveToday = await getEffectiveWorkday(today);

  // 재직 직원 수
  const empCount = await env.DB.prepare(
    `SELECT COUNT(*) AS cnt FROM employees WHERE employment_status = 'ACTIVE'`,
  ).first<{ cnt: number }>();

  // 오늘 출근 현황
  const rows = await env.DB.prepare(`
    SELECT
      e.full_name AS fullName,
      e.department,
      e.standard_start_minute AS standardStartMinute,
      a.check_in_at AS checkInAt,
      a.check_out_at AS checkOutAt,
      a.representative_status AS representativeStatus,
      COALESCE(a.is_late, 0) AS isLate,
      lu.leave_type AS leaveType,
      ow.work_type AS overtimeType
    FROM employees e
    LEFT JOIN attendance a ON a.employee_id = e.id AND a.work_date = ?
    LEFT JOIN leave_usages lu
      ON lu.employee_id = e.id AND lu.leave_date = ? AND lu.cancelled_at IS NULL
    LEFT JOIN overtime_works ow
      ON ow.employee_id = e.id AND ow.work_date = ? AND ow.cancelled_at IS NULL
    WHERE e.employment_status = 'ACTIVE'
    ORDER BY e.employee_number
  `).bind(today, today, today).all<{
    fullName: string;
    department: string;
    standardStartMinute: number;
    checkInAt: string | null;
    checkOutAt: string | null;
    representativeStatus: string | null;
    isLate: number;
    leaveType: string | null;
    overtimeType: string | null;
  }>();

  let clockedIn = 0;
  let lateCount = 0;
  let leaveCount = 0;
  let overtimeCount = 0;
  let holidayWorkCount = 0;

  const staffList = rows.results.map((r) => {
    const hasCheckIn = !!r.checkInAt;
    const isLate = Boolean(r.isLate);
    const isLeave = !!r.leaveType;

    if (r.overtimeType === 'OVERTIME') overtimeCount++;
    if (r.overtimeType === 'HOLIDAY_WORK') holidayWorkCount++;

    if (isLeave) leaveCount++;
    else if (hasCheckIn) {
      clockedIn++;
      if (isLate) lateCount++;
    }

    let status = '미출근';
    if (isLeave) {
      const meta = r.leaveType === 'FULL_DAY' ? '1일' : r.leaveType === 'HALF_DAY' ? '반차' : r.leaveType === 'QUARTER_DAY' ? '반반차' : '시차';
      status = meta;
    } else if (r.overtimeType === 'HOLIDAY_WORK') {
      status = '휴일근무';
    } else if (hasCheckIn) {
      if (r.overtimeType === 'OVERTIME') {
        status = r.checkOutAt ? '퇴근(연장)' : (isLate ? '지각(연장)' : '연장근무');
      } else {
        status = r.checkOutAt ? '퇴근' : (isLate ? '지각' : '근무중');
      }
    } else if (r.overtimeType === 'OVERTIME') {
      status = '연장(미출근)';
    } else if (!effectiveToday.isWorkday) {
      status = '휴일';
    }

    const h = Math.floor(r.standardStartMinute / 60);
    const m = r.standardStartMinute % 60;
    const standardStart = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;

    return {
      fullName: r.fullName,
      department: r.department,
      standardStart,
      checkInAt: r.checkInAt,
      checkOutAt: r.checkOutAt,
      status,
      overtimeType: r.overtimeType,
    };
  });

  const activeEmployees = empCount?.cnt ?? 0;
  // 공휴일·주말·회사 휴무일에는 출근 의무가 없으므로 미출근/지각으로 집계하지 않는다.
  const notClockedIn = effectiveToday.isWorkday
    ? Math.max(0, activeEmployees - clockedIn - leaveCount)
    : 0;
  const effectiveLateCount = effectiveToday.isWorkday ? lateCount : 0;

  return {
    activeEmployees,
    clockedIn,
    notClockedIn,
    lateCount: effectiveLateCount,
    leaveCount,
    isHoliday: !effectiveToday.isWorkday,
    holidayName: effectiveToday.name,
    dayType: effectiveToday.dayType,
    overtimeCount,
    holidayWorkCount,
    staffList,
  };
}

/** 최근 근태 기록 (USER Dashboard 최근 5일) */
export async function getRecentAttendance(
  employeeId: string,
  limit = 5,
): Promise<MonthlyAttendanceDay[]> {
  const rows = await env.DB.prepare(`
    SELECT a.work_date AS date, a.check_in_at AS checkInAt, a.check_out_at AS checkOutAt,
           a.representative_status AS representativeStatus,
           COALESCE(a.is_late, 0) AS isLate, COALESCE(a.is_early_leave, 0) AS isEarlyLeave,
           a.source, lu.leave_type AS leaveType
    FROM attendance a
    LEFT JOIN leave_usages lu
      ON lu.employee_id = a.employee_id AND lu.leave_date = a.work_date AND lu.cancelled_at IS NULL
    WHERE a.employee_id = ?
    ORDER BY a.work_date DESC
    LIMIT ?
  `).bind(employeeId, limit).all<{
    date: string;
    checkInAt: string | null;
    checkOutAt: string | null;
    representativeStatus: string | null;
    isLate: number;
    isEarlyLeave: number;
    source: string | null;
    leaveType: string | null;
  }>();

  return rows.results.map((r) => ({
    date: r.date,
    checkInAt: r.checkInAt,
    checkOutAt: r.checkOutAt,
    representativeStatus: r.representativeStatus as AttendanceStatus | null,
    isLate: Boolean(r.isLate),
    isEarlyLeave: Boolean(r.isEarlyLeave),
    isAbsent: r.representativeStatus === 'ABSENT',
    isNotClockedIn: !r.checkInAt && !r.leaveType,
    isWorkday: true,
    dayType: 'NORMAL_WORKDAY' as CalendarDayType,
    dayName: null,
    leaveType: r.leaveType as LeaveType | null,
    source: r.source,
  }));
}
