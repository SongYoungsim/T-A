/**
 * lib/leave.ts — 연차관리 서비스 레이어 (Phase 3)
 *
 * 모든 연차 계산의 Source of Truth는 분(minutes) 단위 정수입니다.
 * 1일 = 480분, 반차 = 240분, 반반차 = 120분, 시차 = 60분
 */

import { env } from 'cloudflare:workers';
import type {
  AnnualLeaveMaster,
  LeaveStatusRow,
  LeaveSummary,
  LeaveType,
  LeaveUsageDisplay,
} from '@/lib/hr-types';
import { LEAVE_TYPE_META } from '@/lib/hr-types';

// ─── 내부 헬퍼 ────────────────────────────────────────────────────────────────

/** Korea/Seoul 기준 오늘 날짜 문자열 YYYY-MM-DD */
export function todaySeoul(): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date());
}

/** 입력 날짜 문자열이 YYYY-MM-DD 형식인지 확인 */
function isValidDate(d: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d));
}

/** 연차 날짜에서 연도를 추출 */
function yearFromDate(d: string): number {
  return parseInt(d.slice(0, 4), 10);
}

// ─── 연차 마스터 ──────────────────────────────────────────────────────────────

/** 직원 + 연도 기준 연차 마스터 조회 */
export async function getLeaveMaster(
  employeeId: string,
  year: number,
): Promise<AnnualLeaveMaster | null> {
  return await env.DB.prepare(
    `SELECT
       id, employee_id AS employeeId, year,
       granted_minutes AS grantedMinutes,
       carried_minutes AS carriedMinutes,
       created_at AS createdAt, updated_at AS updatedAt
     FROM annual_leave_masters
     WHERE employee_id = ? AND year = ?
     LIMIT 1`,
  )
    .bind(employeeId, year)
    .first<AnnualLeaveMaster>();
}

/** 연차 마스터 ID로 직접 조회 */
export async function getLeaveMasterById(
  masterId: string,
): Promise<AnnualLeaveMaster | null> {
  return await env.DB.prepare(
    `SELECT
       id, employee_id AS employeeId, year,
       granted_minutes AS grantedMinutes,
       carried_minutes AS carriedMinutes,
       created_at AS createdAt, updated_at AS updatedAt
     FROM annual_leave_masters
     WHERE id = ?
     LIMIT 1`,
  )
    .bind(masterId)
    .first<AnnualLeaveMaster>();
}

/** 해당 연차 마스터의 실제 사용 분수(유효한 leave_usages 합계) */
export async function getUsedMinutes(masterId: string): Promise<number> {
  const row = await env.DB.prepare(
    `SELECT COALESCE(SUM(minutes), 0) AS total
     FROM leave_usages
     WHERE leave_master_id = ? AND cancelled_at IS NULL`,
  )
    .bind(masterId)
    .first<{ total: number }>();
  return row?.total ?? 0;
}

/** 연차 마스터 생성 (ADMIN 전용) */
export async function createLeaveMaster(
  employeeId: string,
  year: number,
  grantedMinutes: number,
  carriedMinutes: number,
  actorId: string,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  if (grantedMinutes < 0 || carriedMinutes < 0) {
    return { ok: false, error: '음수 값은 허용되지 않습니다.' };
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  const afterJson = JSON.stringify({ employeeId, year, grantedMinutes, carriedMinutes });

  try {
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO annual_leave_masters
         (id, employee_id, year, granted_hours, carried_hours, granted_minutes, carried_minutes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        id,
        employeeId,
        year,
        Math.floor(grantedMinutes / 60),
        Math.floor(carriedMinutes / 60),
        grantedMinutes,
        carriedMinutes,
        now,
        now,
      ),
      env.DB.prepare(
        `INSERT INTO audit_logs
         (id, actor_employee_id, target_employee_id, entity_type, entity_id, action, target_date, before_json, after_json, reason, created_at)
         VALUES (?, ?, ?, 'LEAVE_MASTER', ?, 'CREATE', ?, NULL, ?, '연차 마스터 생성', ?)`,
      ).bind(
        crypto.randomUUID(),
        actorId,
        employeeId,
        id,
        String(year),
        afterJson,
        now,
      ),
    ]);
    return { ok: true, id };
  } catch (e) {
    if (String(e).toLowerCase().includes('unique')) {
      return { ok: false, error: `${year}년도 연차 마스터가 이미 존재합니다.` };
    }
    throw e;
  }
}

/** 연차 마스터 수정 (ADMIN 전용) */
export async function updateLeaveMaster(
  masterId: string,
  grantedMinutes: number,
  carriedMinutes: number,
  actorId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (grantedMinutes < 0 || carriedMinutes < 0) {
    return { ok: false, error: '음수 값은 허용되지 않습니다.' };
  }

  const before = await getLeaveMasterById(masterId);
  if (!before) return { ok: false, error: '연차 마스터를 찾을 수 없습니다.' };

  const now = new Date().toISOString();
  const beforeJson = JSON.stringify({
    grantedMinutes: before.grantedMinutes,
    carriedMinutes: before.carriedMinutes,
  });
  const afterJson = JSON.stringify({ grantedMinutes, carriedMinutes });

  await env.DB.batch([
    env.DB.prepare(
      `UPDATE annual_leave_masters
       SET granted_hours = ?, carried_hours = ?,
           granted_minutes = ?, carried_minutes = ?,
           updated_at = ?
       WHERE id = ?`,
    ).bind(
      Math.floor(grantedMinutes / 60),
      Math.floor(carriedMinutes / 60),
      grantedMinutes,
      carriedMinutes,
      now,
      masterId,
    ),
    env.DB.prepare(
      `INSERT INTO audit_logs
       (id, actor_employee_id, target_employee_id, entity_type, entity_id, action, target_date, before_json, after_json, reason, created_at)
       VALUES (?, ?, ?, 'LEAVE_MASTER', ?, 'UPDATE', ?, ?, ?, '연차 마스터 수정', ?)`,
    ).bind(
      crypto.randomUUID(),
      actorId,
      before.employeeId,
      masterId,
      String(before.year),
      beforeJson,
      afterJson,
      now,
    ),
  ]);
  return { ok: true };
}

// ─── 연차 사용 ────────────────────────────────────────────────────────────────

/** 연차 종류에서 분수를 가져옴 */
export function leaveTypeToMinutes(leaveType: LeaveType): number {
  return LEAVE_TYPE_META[leaveType].minutes;
}

/**
 * 연차 사용 등록 (ADMIN 전용)
 * 중복날짜, 마스터 없음, 잔여연차 초과를 서버에서 검증
 */
export async function registerLeaveUsage(
  employeeId: string,
  leaveDate: string,
  leaveType: LeaveType,
  actorId: string,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  if (!isValidDate(leaveDate)) {
    return { ok: false, error: '날짜 형식이 올바르지 않습니다. (YYYY-MM-DD)' };
  }

  const year = yearFromDate(leaveDate);
  const minutes = leaveTypeToMinutes(leaveType);

  // 연차 마스터 확인
  const master = await getLeaveMaster(employeeId, year);
  if (!master) {
    return { ok: false, error: `${year}년도 연차 마스터가 설정되지 않았습니다.` };
  }

  // 잔여 연차 확인
  const usedMinutes = await getUsedMinutes(master.id);
  const totalMinutes = master.grantedMinutes + master.carriedMinutes;
  const remainingMinutes = totalMinutes - usedMinutes;
  if (minutes > remainingMinutes) {
    return { ok: false, error: '잔여 연차가 부족합니다.' };
  }

  // Phase 7: 동일 일자 대체휴무 사용 여부 확인 (상호 충돌 방지)
  const existingCompUsage = await env.DB.prepare(
    `SELECT id FROM compensatory_leave_usages WHERE employee_id = ? AND used_on = ? LIMIT 1`
  )
    .bind(employeeId, leaveDate)
    .first();

  if (existingCompUsage) {
    return { ok: false, error: '해당 일자에 이미 대체휴무가 등록되어 있어 연차를 사용할 수 없습니다.' };
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const afterJson = JSON.stringify({ employeeId, leaveDate, leaveType, minutes });

  try {
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO leave_usages
         (id, employee_id, leave_master_id, leave_date, leave_type, hours, minutes, registered_by, cancelled_at, cancelled_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?)`,
      ).bind(
        id,
        employeeId,
        master.id,
        leaveDate,
        leaveType,
        Math.floor(minutes / 60),
        minutes,
        actorId,
        now,
        now,
      ),
      env.DB.prepare(
        `INSERT INTO audit_logs
         (id, actor_employee_id, target_employee_id, entity_type, entity_id, action, target_date, before_json, after_json, reason, created_at)
         VALUES (?, ?, ?, 'LEAVE_USAGE', ?, 'CREATE', ?, NULL, ?, '연차 사용 등록', ?)`,
      ).bind(
        crypto.randomUUID(),
        actorId,
        employeeId,
        id,
        leaveDate,
        afterJson,
        now,
      ),
    ]);
    return { ok: true, id };
  } catch (e) {
    if (String(e).toLowerCase().includes('unique')) {
      return { ok: false, error: '해당 날짜에 이미 연차가 등록되어 있습니다.' };
    }
    throw e;
  }
}

/**
 * 연차 사용 수정 (ADMIN 전용)
 * 수정 후 중복날짜, 잔여연차를 다시 검증
 */
export async function updateLeaveUsage(
  usageId: string,
  leaveDate: string,
  leaveType: LeaveType,
  actorId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isValidDate(leaveDate)) {
    return { ok: false, error: '날짜 형식이 올바르지 않습니다. (YYYY-MM-DD)' };
  }

  // 현재 레코드 조회
  const current = await env.DB.prepare(
    `SELECT id, employee_id AS employeeId, leave_master_id AS leaveMasterId,
            leave_date AS leaveDate, leave_type AS leaveType, minutes, cancelled_at AS cancelledAt
     FROM leave_usages WHERE id = ? LIMIT 1`,
  ).bind(usageId).first<{
    id: string; employeeId: string; leaveMasterId: string;
    leaveDate: string; leaveType: LeaveType; minutes: number; cancelledAt: string | null;
  }>();

  if (!current) return { ok: false, error: '연차 사용내역을 찾을 수 없습니다.' };
  if (current.cancelledAt) return { ok: false, error: '취소된 연차는 수정할 수 없습니다.' };

  const newYear = yearFromDate(leaveDate);
  const newMinutes = leaveTypeToMinutes(leaveType);

  // 날짜가 변경되어 연도가 달라지는 경우 마스터 재확인
  const currentYear = yearFromDate(current.leaveDate);
  let masterId = current.leaveMasterId;
  if (newYear !== currentYear) {
    const newMaster = await getLeaveMaster(current.employeeId, newYear);
    if (!newMaster) {
      return { ok: false, error: `${newYear}년도 연차 마스터가 설정되지 않았습니다.` };
    }
    masterId = newMaster.id;
  }

  // 잔여 연차 확인 (현재 레코드 제외 후 계산)
  const master = await getLeaveMasterById(masterId);
  if (!master) return { ok: false, error: '연차 마스터를 찾을 수 없습니다.' };

  const usedMinutes = await getUsedMinutes(masterId);
  // 현재 레코드가 같은 마스터에 속하면, 현재 사용량을 제외하고 계산
  const adjustedUsed =
    masterId === current.leaveMasterId ? usedMinutes - current.minutes : usedMinutes;
  const totalMinutes = master.grantedMinutes + master.carriedMinutes;
  const remainingMinutes = totalMinutes - adjustedUsed;

  if (newMinutes > remainingMinutes) {
    return { ok: false, error: '잔여 연차가 부족합니다.' };
  }

  // Phase 7: 동일 일자 대체휴무 사용 여부 확인 (상호 충돌 방지)
  const existingCompUsage = await env.DB.prepare(
    `SELECT id FROM compensatory_leave_usages WHERE employee_id = ? AND used_on = ? LIMIT 1`
  )
    .bind(current.employeeId, leaveDate)
    .first();

  if (existingCompUsage) {
    return { ok: false, error: '해당 일자에 이미 대체휴무가 등록되어 있어 연차를 사용할 수 없습니다.' };
  }

  const now = new Date().toISOString();
  const beforeJson = JSON.stringify({
    leaveDate: current.leaveDate,
    leaveType: current.leaveType,
    minutes: current.minutes,
  });
  const afterJson = JSON.stringify({ leaveDate, leaveType, minutes: newMinutes });

  try {
    await env.DB.batch([
      env.DB.prepare(
        `UPDATE leave_usages
         SET leave_master_id = ?, leave_date = ?, leave_type = ?,
             hours = ?, minutes = ?, updated_at = ?
         WHERE id = ? AND cancelled_at IS NULL`,
      ).bind(
        masterId,
        leaveDate,
        leaveType,
        Math.floor(newMinutes / 60),
        newMinutes,
        now,
        usageId,
      ),
      env.DB.prepare(
        `INSERT INTO audit_logs
         (id, actor_employee_id, target_employee_id, entity_type, entity_id, action, target_date, before_json, after_json, reason, created_at)
         VALUES (?, ?, ?, 'LEAVE_USAGE', ?, 'UPDATE', ?, ?, ?, '연차 사용 수정', ?)`,
      ).bind(
        crypto.randomUUID(),
        actorId,
        current.employeeId,
        usageId,
        leaveDate,
        beforeJson,
        afterJson,
        now,
      ),
    ]);
    return { ok: true };
  } catch (e) {
    if (String(e).toLowerCase().includes('unique')) {
      return { ok: false, error: '해당 날짜에 이미 연차가 등록되어 있습니다.' };
    }
    throw e;
  }
}

/**
 * 연차 사용 취소 (Soft Delete, ADMIN 전용)
 * 물리적 삭제 대신 cancelled_at/cancelled_by를 설정하여 Audit 추적 유지
 */
export async function cancelLeaveUsage(
  usageId: string,
  actorId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const current = await env.DB.prepare(
    `SELECT id, employee_id AS employeeId, leave_date AS leaveDate,
            leave_type AS leaveType, minutes, cancelled_at AS cancelledAt
     FROM leave_usages WHERE id = ? LIMIT 1`,
  ).bind(usageId).first<{
    id: string; employeeId: string; leaveDate: string;
    leaveType: string; minutes: number; cancelledAt: string | null;
  }>();

  if (!current) return { ok: false, error: '연차 사용내역을 찾을 수 없습니다.' };
  if (current.cancelledAt) return { ok: false, error: '이미 취소된 연차입니다.' };

  const now = new Date().toISOString();
  const beforeJson = JSON.stringify({
    leaveDate: current.leaveDate,
    leaveType: current.leaveType,
    minutes: current.minutes,
    cancelledAt: null,
  });
  const afterJson = JSON.stringify({
    leaveDate: current.leaveDate,
    leaveType: current.leaveType,
    minutes: current.minutes,
    cancelledAt: now,
  });

  await env.DB.batch([
    env.DB.prepare(
      `UPDATE leave_usages
       SET cancelled_at = ?, cancelled_by = ?, updated_at = ?
       WHERE id = ?`,
    ).bind(now, actorId, now, usageId),
    env.DB.prepare(
      `INSERT INTO audit_logs
       (id, actor_employee_id, target_employee_id, entity_type, entity_id, action, target_date, before_json, after_json, reason, created_at)
       VALUES (?, ?, ?, 'LEAVE_USAGE', ?, 'DELETE', ?, ?, ?, '연차 사용 취소', ?)`,
    ).bind(
      crypto.randomUUID(),
      actorId,
      current.employeeId,
      usageId,
      current.leaveDate,
      beforeJson,
      afterJson,
      now,
    ),
  ]);
  return { ok: true };
}

// ─── 조회 함수 ────────────────────────────────────────────────────────────────

/** ADMIN: 연도별 전직원 연차 현황 조회 */
export async function listLeaveStatus(
  year: number,
  includeResigned = false,
): Promise<LeaveStatusRow[]> {
  const statusFilter = includeResigned ? '' : `AND e.employment_status <> 'RESIGNED'`;
  const rows = await env.DB.prepare(
    `SELECT
       e.id AS employeeId,
       e.employee_number AS employeeNumber,
       e.full_name AS fullName,
       e.department,
       e.job_title AS jobTitle,
       e.employment_status AS employmentStatus,
       alm.id AS masterId,
       COALESCE(alm.granted_minutes, 0) AS grantedMinutes,
       COALESCE(alm.carried_minutes, 0) AS carriedMinutes,
       COALESCE((
         SELECT SUM(lu.minutes)
         FROM leave_usages lu
         WHERE lu.leave_master_id = alm.id
           AND lu.cancelled_at IS NULL
       ), 0) AS usedMinutes
     FROM employees e
     LEFT JOIN annual_leave_masters alm
       ON alm.employee_id = e.id AND alm.year = ?
     WHERE 1=1 ${statusFilter}
     ORDER BY
       CASE e.employment_status WHEN 'ACTIVE' THEN 0 WHEN 'LEAVE' THEN 1 ELSE 2 END,
       e.employee_number`,
  ).bind(year).all<LeaveStatusRow>();

  return rows.results;
}

/** USER: 본인의 연도별 연차 요약 조회 (세션의 employeeId로만 조회) */
export async function getUserLeaveSummary(
  employeeId: string,
  year: number,
): Promise<LeaveSummary> {
  const master = await getLeaveMaster(employeeId, year);
  if (!master) {
    return { year, masterId: null, grantedMinutes: 0, carriedMinutes: 0, usedMinutes: 0 };
  }
  const usedMinutes = await getUsedMinutes(master.id);
  return {
    year,
    masterId: master.id,
    grantedMinutes: master.grantedMinutes,
    carriedMinutes: master.carriedMinutes,
    usedMinutes,
  };
}

/** USER: 본인의 연도별 연차 사용내역 (최신 날짜순, 취소 포함) */
export async function getUserLeaveUsages(
  employeeId: string,
  year: number,
): Promise<LeaveUsageDisplay[]> {
  const rows = await env.DB.prepare(
    `SELECT
       lu.id, lu.leave_date AS leaveDate, lu.leave_type AS leaveType,
       lu.minutes, lu.cancelled_at AS cancelledAt
     FROM leave_usages lu
     JOIN annual_leave_masters alm ON alm.id = lu.leave_master_id
     WHERE lu.employee_id = ? AND alm.year = ?
     ORDER BY lu.leave_date DESC, lu.created_at DESC`,
  )
    .bind(employeeId, year)
    .all<LeaveUsageDisplay>();

  return rows.results;
}

/** ADMIN: 특정 직원의 연도별 연차 사용내역 */
export async function getEmployeeLeaveUsages(
  employeeId: string,
  year: number,
): Promise<LeaveUsageDisplay[]> {
  const rows = await env.DB.prepare(
    `SELECT
       lu.id, lu.leave_date AS leaveDate, lu.leave_type AS leaveType,
       lu.minutes, lu.cancelled_at AS cancelledAt
     FROM leave_usages lu
     JOIN annual_leave_masters alm ON alm.id = lu.leave_master_id
     WHERE lu.employee_id = ? AND alm.year = ?
     ORDER BY lu.leave_date DESC, lu.created_at DESC`,
  )
    .bind(employeeId, year)
    .all<LeaveUsageDisplay>();

  return rows.results;
}

/** ADMIN Dashboard: 오늘 연차인원 수 */
export async function countTodayLeave(): Promise<{ total: number; byType: Record<string, number> }> {
  const today = todaySeoul();
  const rows = await env.DB.prepare(
    `SELECT leave_type AS leaveType, COUNT(*) AS cnt
     FROM leave_usages
     WHERE leave_date = ? AND cancelled_at IS NULL
     GROUP BY leave_type`,
  )
    .bind(today)
    .all<{ leaveType: string; cnt: number }>();

  let total = 0;
  const byType: Record<string, number> = {};
  for (const row of rows.results) {
    total += row.cnt;
    byType[row.leaveType] = row.cnt;
  }
  return { total, byType };
}
