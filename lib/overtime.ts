/**
 * lib/overtime.ts — 연장근무 및 휴일근무 서비스 레이어 (Phase 6)
 *
 * ── 운영 원칙 ────────────────────────────────────────────────────────────
 * 1. 직원이 신청하지 않고 ADMIN이 직접 등록/수정/취소
 * 2. 근무구분(OVERTIME vs HOLIDAY_WORK)은 Phase 5 Work Calendar를 통해 자동 결정
 * 3. 근무시간은 반올림 없이 분(Minutes) 단위 정밀 정수 계산
 * 4. 휴일근무 시에만 대체휴무 1일 부여 옵션 지원 (Phase 7 연계)
 * 5. 동일 직원 + 동일 날짜 중복 등록 기본 차단
 * 6. 모든 변경 작업은 Audit Log에 기록
 * ─────────────────────────────────────────────────────────────────────────
 */

import { env } from 'cloudflare:workers';
import { getEffectiveWorkday } from '@/lib/calendar';
import { todayKST } from '@/lib/attendance';
import { ensureCompensatoryLeaveForOvertime } from '@/lib/compensatory-leave';
import type { CalendarDayType, OvertimeRecord, OvertimeSummary, WorkType } from '@/lib/hr-types';

/** "HH:MM" 문자열을 분 단위(minute of day)로 변환 */
export function timeStringToMinutes(timeStr: string): number {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

/**
 * 시작시간과 종료시간으로 근무시간(분) 계산
 * - 반올림 없이 정확한 정수 분(Minutes) 계산
 * - 당일 근무: end > start 필수
 * - 자정 초과 근무 지원: end < start인 경우 익일로 간주하여 (1440 - start) + end 계산
 */
export function calculateOvertimeDuration(
  startedAt: string,
  endedAt: string,
  allowOvernight = false
): { durationMinutes: number; isOvernight: boolean } {
  const startMin = timeStringToMinutes(startedAt);
  const endMin = timeStringToMinutes(endedAt);

  if (endMin > startMin) {
    return {
      durationMinutes: endMin - startMin,
      isOvernight: false,
    };
  }

  if (allowOvernight && endMin < startMin) {
    // 22:00 ~ 02:00 -> 240분
    return {
      durationMinutes: 1440 - startMin + endMin,
      isOvernight: true,
    };
  }

  return {
    durationMinutes: 0,
    isOvernight: false,
  };
}

/**
 * 근무일 캘린더를 통한 근무구분 자동판정
 * - 정상 근무일 -> OVERTIME (평일연장)
 * - 휴일 (주말, 공휴일, 회사지정휴무일) -> HOLIDAY_WORK (휴일근무)
 */
export async function determineWorkType(workDate: string): Promise<WorkType> {
  const effective = await getEffectiveWorkday(workDate);
  return effective.isWorkday ? 'OVERTIME' : 'HOLIDAY_WORK';
}

/**
 * 근무구분 상세 판정 (캘린더 상세 정보 포함)
 */
export async function determineWorkTypeDetail(workDate: string): Promise<{
  workType: WorkType;
  isWorkday: boolean;
  dayType: CalendarDayType;
  dayName: string | null;
}> {
  const effective = await getEffectiveWorkday(workDate);
  return {
    workType: effective.isWorkday ? 'OVERTIME' : 'HOLIDAY_WORK',
    isWorkday: effective.isWorkday,
    dayType: effective.dayType,
    dayName: effective.name,
  };
}

/**
 * 연장근무 대상 직원 상태 검증
 * - 입사일 이전 등록 불가
 * - 퇴사일 이후 등록 불가
 * - 휴직 기간 중 등록 불가
 */
export async function validateEmployeeForOvertime(
  employeeId: string,
  workDate: string
): Promise<{ ok: true; employeeName: string } | { ok: false; error: string }> {
  const emp = await env.DB.prepare(
    `SELECT full_name AS fullName, hired_on AS hiredOn,
            COALESCE(resignation_date, terminated_on) AS resignationDate,
            employment_status AS employmentStatus
     FROM employees WHERE id = ? LIMIT 1`
  )
    .bind(employeeId)
    .first<{
      fullName: string;
      hiredOn: string;
      resignationDate: string | null;
      employmentStatus: string;
    }>();

  if (!emp) {
    return { ok: false, error: '존재하지 않는 직원입니다.' };
  }

  if (workDate < emp.hiredOn) {
    return {
      ok: false,
      error: `입사일(${emp.hiredOn}) 이전 날짜에는 연장근무를 등록할 수 없습니다.`,
    };
  }

  if (emp.resignationDate && workDate > emp.resignationDate) {
    return {
      ok: false,
      error: `퇴사일(${emp.resignationDate}) 이후 날짜에는 연장근무를 등록할 수 없습니다.`,
    };
  }

  // 휴직 기간 확인
  const leaveAbsence = await env.DB.prepare(
    `SELECT started_on AS startedOn, ended_on AS endedOn
     FROM leave_of_absence_periods
     WHERE employee_id = ?
       AND started_on <= ?
       AND (ended_on IS NULL OR ended_on >= ?)
     LIMIT 1`
  )
    .bind(employeeId, workDate, workDate)
    .first();

  if (leaveAbsence) {
    return {
      ok: false,
      error: '해당 일자는 휴직 기간에 포함되어 연장근무를 등록할 수 없습니다.',
    };
  }

  return { ok: true, employeeName: emp.fullName };
}

/**
 * ADMIN: 연장근무 신규 등록
 */
export async function createOvertimeWork(params: {
  employeeId: string;
  workDate: string;
  startedAt?: string;
  startTime?: string;
  endedAt?: string;
  endTime?: string;
  description?: string;
  workDescription?: string;
  grantCompLeave?: boolean;
  actorId: string;
}): Promise<
  | { ok: true; id: string; workType: WorkType; durationMinutes: number; actualMinutes: number }
  | { ok: false; error: string }
> {
  const {
    employeeId,
    workDate,
    startedAt = params.startTime ?? '',
    endedAt = params.endTime ?? '',
    description = params.workDescription ?? '',
    grantCompLeave = false,
    actorId,
  } = params;

  if (!description?.trim()) {
    return { ok: false, error: '업무내용을 입력해주세요.' };
  }

  // 시간 검증
  const { durationMinutes } = calculateOvertimeDuration(startedAt, endedAt);
  if (durationMinutes <= 0) {
    return { ok: false, error: '종료시간은 시작시간보다 이후여야 합니다.' };
  }

  // 직원 상태 검증
  const empVal = await validateEmployeeForOvertime(employeeId, workDate);
  if (!empVal.ok) {
    return empVal;
  }

  // 동일 직원 + 동일 날짜 중복 등록 확인 (취소되지 않은 건)
  const existing = await env.DB.prepare(
    `SELECT id FROM overtime_works
     WHERE employee_id = ? AND work_date = ? AND cancelled_at IS NULL
     LIMIT 1`
  )
    .bind(employeeId, workDate)
    .first();

  if (existing) {
    return { ok: false, error: '해당 일자에 이미 등록된 연장/휴일근무 기록이 있습니다.' };
  }

  // 근무구분 자동 판정
  const workType = await determineWorkType(workDate);

  // 평일연장인 경우 대체휴무 부여 불가 강제
  const finalGrantCompLeave = workType === 'HOLIDAY_WORK' ? Boolean(grantCompLeave) : false;

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await env.DB.prepare(
    `INSERT INTO overtime_works
       (id, employee_id, work_date, started_at, ended_at, duration_minutes, description,
        work_type, grant_comp_leave, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      id,
      employeeId,
      workDate,
      startedAt,
      endedAt,
      durationMinutes,
      description.trim(),
      workType,
      finalGrantCompLeave ? 1 : 0,
      actorId,
      now,
      now
    )
    .run();

  // Audit Log 저장
  const auditId = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO audit_logs
       (id, actor_employee_id, target_employee_id, entity_type, entity_id, action, target_date, after_json, reason, created_at)
     VALUES (?, ?, ?, 'OVERTIME_WORK', ?, 'CREATE', ?, ?, ?, ?)`
  )
    .bind(
      auditId,
      actorId,
      employeeId,
      id,
      workDate,
      JSON.stringify({
        id,
        employeeId,
        workDate,
        startedAt,
        endedAt,
        durationMinutes,
        description: description.trim(),
        workType,
        grantCompLeave: finalGrantCompLeave,
      }),
      `${workType === 'OVERTIME' ? '평일연장' : '휴일근무'} 신규 등록 (${durationMinutes}분)`,
      now
    )
    .run();

  if (finalGrantCompLeave) {
    await ensureCompensatoryLeaveForOvertime({
      employeeId,
      sourceOvertimeId: id,
      grantDate: workDate,
      actorId,
      now,
    });
  }
  return { ok: true, id, workType, durationMinutes, actualMinutes: durationMinutes };
}

/**
 * ADMIN: 연장근무 수정
 */
export async function updateOvertimeWork(params: {
  id: string;
  workDate: string;
  startedAt?: string;
  startTime?: string;
  endedAt?: string;
  endTime?: string;
  description?: string;
  workDescription?: string;
  grantCompLeave?: boolean;
  actorId: string;
  reason?: string;
}): Promise<
  | { ok: true; workType: WorkType; durationMinutes: number; actualMinutes: number }
  | { ok: false; error: string }
> {
  const {
    id,
    workDate,
    startedAt = params.startTime ?? '',
    endedAt = params.endTime ?? '',
    description = params.workDescription ?? '',
    grantCompLeave = false,
    actorId,
    reason = '',
  } = params;

  if (!description?.trim()) {
    return { ok: false, error: '업무내용을 입력해주세요.' };
  }

  const { durationMinutes } = calculateOvertimeDuration(startedAt, endedAt);
  if (durationMinutes <= 0) {
    return { ok: false, error: '종료시간은 시작시간보다 이후여야 합니다.' };
  }

  // 기존 레코드 조회
  const current = await env.DB.prepare(
    `SELECT id, employee_id AS employeeId, work_date AS workDate, started_at AS startedAt,
            ended_at AS endedAt, duration_minutes AS durationMinutes, description,
            work_type AS workType, grant_comp_leave AS grantCompLeave, cancelled_at AS cancelledAt
     FROM overtime_works WHERE id = ? LIMIT 1`
  )
    .bind(id)
    .first<any>();

  if (!current || current.cancelledAt) {
    return { ok: false, error: '유효한 연장근무 기록을 찾을 수 없습니다.' };
  }

  // 날짜가 변경되었을 경우 직원 상태 및 중복 검증
  if (current.workDate !== workDate) {
    const empVal = await validateEmployeeForOvertime(current.employeeId, workDate);
    if (!empVal.ok) return empVal;

    const dup = await env.DB.prepare(
      `SELECT id FROM overtime_works
       WHERE employee_id = ? AND work_date = ? AND id <> ? AND cancelled_at IS NULL
       LIMIT 1`
    )
      .bind(current.employeeId, workDate, id)
      .first();

    if (dup) {
      return { ok: false, error: '해당 일자에 이미 등록된 연장/휴일근무 기록이 있습니다.' };
    }
  }

  // 근무구분 재판정
  const workType = await determineWorkType(workDate);
  const finalGrantCompLeave = workType === 'HOLIDAY_WORK' ? Boolean(grantCompLeave) : false;
  const now = new Date().toISOString();

  await env.DB.prepare(
    `UPDATE overtime_works SET
       work_date = ?,
       started_at = ?,
       ended_at = ?,
       duration_minutes = ?,
       description = ?,
       work_type = ?,
       grant_comp_leave = ?,
       updated_at = ?
     WHERE id = ?`
  )
    .bind(
      workDate,
      startedAt,
      endedAt,
      durationMinutes,
      description.trim(),
      workType,
      finalGrantCompLeave ? 1 : 0,
      now,
      id
    )
    .run();

  // Audit Log
  const auditId = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO audit_logs
       (id, actor_employee_id, target_employee_id, entity_type, entity_id, action, target_date, before_json, after_json, reason, created_at)
     VALUES (?, ?, ?, 'OVERTIME_WORK', ?, 'UPDATE', ?, ?, ?, ?, ?)`
  )
    .bind(
      auditId,
      actorId,
      current.employeeId,
      id,
      workDate,
      JSON.stringify(current),
      JSON.stringify({
        id,
        employeeId: current.employeeId,
        workDate,
        startedAt,
        endedAt,
        durationMinutes,
        description: description.trim(),
        workType,
        grantCompLeave: finalGrantCompLeave,
      }),
      reason || `연장근무 정보 수정 (${durationMinutes}분)`,
      now
    )
    .run();

  if (finalGrantCompLeave) {
    await ensureCompensatoryLeaveForOvertime({
      employeeId: current.employeeId,
      sourceOvertimeId: id,
      grantDate: workDate,
      actorId,
      now,
    });
  }
  return { ok: true, workType, durationMinutes, actualMinutes: durationMinutes };
}

/**
 * ADMIN: 연장근무 취소 (Soft Delete)
 */
export async function cancelOvertimeWork(params: {
  id: string;
  actorId: string;
  reason?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { id, actorId, reason = '관리자 연장근무 취소' } = params;

  const current = await env.DB.prepare(
    `SELECT id, employee_id AS employeeId, work_date AS workDate, started_at AS startedAt,
            ended_at AS endedAt, duration_minutes AS durationMinutes, description,
            work_type AS workType, cancelled_at AS cancelledAt
     FROM overtime_works WHERE id = ? LIMIT 1`
  )
    .bind(id)
    .first<any>();

  if (!current || current.cancelledAt) {
    return { ok: false, error: '유효한 연장근무 기록을 찾을 수 없습니다.' };
  }

  const now = new Date().toISOString();

  await env.DB.prepare(
    `UPDATE overtime_works SET cancelled_at = ?, cancelled_by = ?, updated_at = ? WHERE id = ?`
  )
    .bind(now, actorId, now, id)
    .run();

  // Audit Log
  const auditId = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO audit_logs
       (id, actor_employee_id, target_employee_id, entity_type, entity_id, action, target_date, before_json, after_json, reason, created_at)
     VALUES (?, ?, ?, 'OVERTIME_WORK', ?, 'DELETE', ?, ?, null, ?, ?)`
  )
    .bind(
      auditId,
      actorId,
      current.employeeId,
      id,
      current.workDate,
      JSON.stringify(current),
      reason,
      now
    )
    .run();

  return { ok: true };
}

/**
 * ADMIN: 연장/휴일근무 월간 목록 조회 (필터 & 실제 출퇴근 결합)
 */
export async function listOvertimeAdmin(params: {
  year: number;
  month: number;
  employeeId?: string;
  department?: string;
  workType?: string; // 'ALL' | 'OVERTIME' | 'HOLIDAY_WORK'
  searchQuery?: string;
}): Promise<OvertimeRecord[]> {
  const { year, month, employeeId, department, workType, searchQuery } = params;
  const from = `${year}-${String(month).padStart(2, '0')}-01`;
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const to = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;

  let sql = `
    SELECT
      ow.id,
      ow.employee_id AS employeeId,
      e.employee_number AS employeeNumber,
      e.full_name AS fullName,
      e.department,
      ow.work_date AS workDate,
      ow.started_at AS startedAt,
      ow.ended_at AS endedAt,
      ow.duration_minutes AS durationMinutes,
      ow.description,
      ow.work_type AS workType,
      COALESCE(ow.grant_comp_leave, 0) AS grantCompLeave,
      ow.cancelled_at AS cancelledAt,
      ow.cancelled_by AS cancelledBy,
      ow.created_by AS createdBy,
      ow.created_at AS createdAt,
      ow.updated_at AS updatedAt,
      a.check_in_at AS attendanceCheckInAt,
      a.check_out_at AS attendanceCheckOutAt
    FROM overtime_works ow
    JOIN employees e ON e.id = ow.employee_id
    LEFT JOIN attendance a ON a.employee_id = ow.employee_id AND a.work_date = ow.work_date
    WHERE ow.work_date >= ? AND ow.work_date < ?
      AND ow.cancelled_at IS NULL
  `;

  const bindParams: any[] = [from, to];

  if (employeeId && employeeId !== 'ALL') {
    sql += ` AND ow.employee_id = ?`;
    bindParams.push(employeeId);
  }

  if (department && department !== 'ALL') {
    sql += ` AND e.department = ?`;
    bindParams.push(department);
  }

  if (workType && workType !== 'ALL') {
    sql += ` AND ow.work_type = ?`;
    bindParams.push(workType);
  }

  if (searchQuery?.trim()) {
    const q = `%${searchQuery.trim()}%`;
    sql += ` AND (e.full_name LIKE ? OR e.employee_number LIKE ? OR ow.description LIKE ?)`;
    bindParams.push(q, q, q);
  }

  sql += ` ORDER BY ow.work_date DESC, ow.started_at DESC`;

  const statement = env.DB.prepare(sql);
  const rows = await statement.bind(...bindParams).all<any>();

  return rows.results.map((r) => ({
    ...r,
    fullName: r.fullName || '',
    employeeNumber: r.employeeNumber || '',
    department: r.department || '',
    startTime: r.startedAt,
    endTime: r.endedAt,
    actualMinutes: r.durationMinutes,
    workDescription: r.description,
    grantCompLeave: Boolean(r.grantCompLeave),
  }));
}

/**
 * USER: 본인 연장/휴일근무 월간 목록 조회
 */
export async function listUserOvertime(
  employeeId: string,
  year: number,
  month: number
): Promise<OvertimeRecord[]> {
  const from = `${year}-${String(month).padStart(2, '0')}-01`;
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const to = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;

  const rows = await env.DB.prepare(
    `SELECT
       ow.id,
       ow.employee_id AS employeeId,
       ow.work_date AS workDate,
       ow.started_at AS startedAt,
       ow.ended_at AS endedAt,
       ow.duration_minutes AS durationMinutes,
       ow.description,
       ow.work_type AS workType,
       COALESCE(ow.grant_comp_leave, 0) AS grantCompLeave,
       ow.cancelled_at AS cancelledAt,
       ow.cancelled_by AS cancelledBy,
       ow.created_by AS createdBy,
       ow.created_at AS createdAt,
       ow.updated_at AS updatedAt
     FROM overtime_works ow
     WHERE ow.employee_id = ?
       AND ow.work_date >= ? AND ow.work_date < ?
       AND ow.cancelled_at IS NULL
     ORDER BY ow.work_date DESC, ow.started_at DESC`
  )
    .bind(employeeId, from, to)
    .all<any>();

  return rows.results.map((r) => ({
    ...r,
    startTime: r.startedAt,
    endTime: r.endedAt,
    actualMinutes: r.durationMinutes,
    workDescription: r.description,
    grantCompLeave: Boolean(r.grantCompLeave),
  }));
}

/**
 * 월간 연장근무 요약 통계 계산
 */
export function calculateOvertimeSummary(records: OvertimeRecord[]): OvertimeSummary {
  let overtimeMinutes = 0;
  let holidayWorkMinutes = 0;
  let overtimeCount = 0;
  let holidayWorkCount = 0;
  let compLeaveGrantedCount = 0;

  for (const r of records) {
    const mins = r.durationMinutes ?? r.actualMinutes ?? 0;
    if (r.workType === 'OVERTIME') {
      overtimeMinutes += mins;
      overtimeCount++;
    } else if (r.workType === 'HOLIDAY_WORK') {
      holidayWorkMinutes += mins;
      holidayWorkCount++;
      if (r.grantCompLeave) {
        compLeaveGrantedCount++;
      }
    }
  }

  return {
    overtimeMinutes,
    holidayWorkMinutes,
    totalMinutes: overtimeMinutes + holidayWorkMinutes,
    overtimeCount,
    holidayWorkCount,
    compLeaveGrantedCount,
  };
}

/**
 * USER Dashboard: 이번 달 본인 추가근무 요약 조회
 */
export async function getUserCurrentMonthOvertimeMinutes(
  employeeId: string,
  year?: number,
  month?: number
): Promise<OvertimeSummary> {
  const today = todayKST();
  const [y, m] = today.split('-').map(Number);
  const targetYear = year ?? y;
  const targetMonth = month ?? m;
  const records = await listUserOvertime(employeeId, targetYear, targetMonth);
  return calculateOvertimeSummary(records);
}

/**
 * ADMIN Dashboard: 오늘 연장근무 / 휴일근무 등록 현황
 */
export async function getTodayOvertimeStats(): Promise<{
  todayOvertimeCount: number;
  todayHolidayWorkCount: number;
  totalDurationMinutes: number;
}> {
  const today = todayKST();
  const rows = await env.DB.prepare(
    `SELECT work_type AS workType, duration_minutes AS durationMinutes
     FROM overtime_works
     WHERE work_date = ? AND cancelled_at IS NULL`
  )
    .bind(today)
    .all<{ workType: string; durationMinutes: number }>();

  let todayOvertimeCount = 0;
  let todayHolidayWorkCount = 0;
  let totalDurationMinutes = 0;

  for (const r of rows.results) {
    if (r.workType === 'OVERTIME') todayOvertimeCount++;
    if (r.workType === 'HOLIDAY_WORK') todayHolidayWorkCount++;
    totalDurationMinutes += r.durationMinutes;
  }

  return { todayOvertimeCount, todayHolidayWorkCount, totalDurationMinutes };
}
