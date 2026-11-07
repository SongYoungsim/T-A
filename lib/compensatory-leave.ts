/**
 * lib/compensatory-leave.ts — 대체휴무(Compensatory Leave) 서비스 레이어 (Phase 7)
 *
 * ── 운영 원칙 ────────────────────────────────────────────────────────────
 * 1. 대체휴무는 휴일근무(HOLIDAY_WORK)에서 ADMIN이 [대체휴무 1일 부여]를 선택한 경우에만 발생.
 * 2. 평일연장(OVERTIME)에서는 대체휴무가 발생하지 않음.
 * 3. 부여 단위: 항상 1일 (시간 비례 불가, 분할 부여 불가).
 * 4. 사용 단위: 항상 1일 (반차, 반반차, 시간단위 분할 불가).
 * 5. 원본 휴일근무와 1:1 관계 (source_overtime_id UNIQUE). 중복 발생 절대 금지.
 * 6. 유효기간: 발행일(grant_date) 기준 Calendar Month 3개월.
 *    월말 날짜는 대상 월의 마지막 유효일로 안전 처리 (예: 11-30 -> 02-28).
 * 7. 상태 관리: AVAILABLE(사용가능), USED(사용완료), EXPIRED(만료).
 *    만료일 당일까지 사용 가능, 익일부터 EXPIRED. Effective Status 실시간 판정.
 * 8. FIFO/FEFO 자동 차감 엄격 금지! ADMIN이 대상 대체휴무 원본을 직접 선택.
 * 9. 대체휴무 사용일은 출근의무가 있는 근무일(일반 근무일 또는 대체근무일)이어야 함.
 * 10. 연차와 대체휴무는 동일 날짜 상호 충돌 차단 및 잔액 완전 분리.
 * 11. 사용 취소 지원 (USED -> AVAILABLE 복원, 이미 만료된 경우 실질 상태 EXPIRED).
 * 12. 모든 변경 작업은 Audit Log 기록.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { env } from 'cloudflare:workers';
import { todayKST, nowISO } from '@/lib/attendance';
import { getEffectiveWorkday } from '@/lib/calendar';
import type {
  CompensatoryLeaveRecord,
  CompensatoryLeaveRow,
  CompensatoryLeaveStatus,
  CompensatoryLeaveSummary,
  ExpiringSoonCompLeave,
  UserCompensatoryLeaveRow,
  UserCompensatoryLeaveSummary,
} from '@/lib/hr-types';

// ─── 날짜 유틸리티 ────────────────────────────────────────────────────────────

/**
 * Calendar Month 기준 3개월 후 만료일 계산
 * - 순수 년-월-일 산술 연산 (UTC/오프셋 버그 원천 차단)
 * - 월말 날짜 안전 처리: 해당 월에 해당 날짜가 없으면 월말 유효일로 클램핑
 *
 * 예:
 * 2026-10-03 -> 2027-01-03
 * 2026-11-30 -> 2027-02-28 (평년) / 2027-02-29 (윤년)
 * 2026-08-31 -> 2026-11-30
 * 2026-05-31 -> 2026-08-31
 * 2026-01-31 -> 2026-04-30
 */
export function calculateCompLeaveExpiryDate(grantDate: string): string {
  const parts = grantDate.split('-').map(Number);
  const year = parts[0];
  const month = parts[1]; // 1 ~ 12
  const day = parts[2];   // 1 ~ 31

  let targetYear = year;
  let targetMonth = month + 3;

  if (targetMonth > 12) {
    targetYear += Math.floor((targetMonth - 1) / 12);
    targetMonth = ((targetMonth - 1) % 12) + 1;
  }

  // targetYear, targetMonth의 말일 계산 (targetMonth는 1-based, 0번째 날은 이전달 말일이므로 targetMonth 인덱스 전달)
  const daysInMonth = new Date(Date.UTC(targetYear, targetMonth, 0)).getUTCDate();
  const targetDay = Math.min(day, daysInMonth);

  return `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(targetDay).padStart(2, '0')}`;
}

/**
 * 두 날짜 사이의 일수 차이 계산 (toDate - fromDate)
 * Date-only 기준 정수 일수 반환 (0이면 당일, 양수면 미래, 음수면 과거)
 */
export function daysBetweenDates(fromDate: string, toDate: string): number {
  const d1 = new Date(`${fromDate}T00:00:00Z`).getTime();
  const d2 = new Date(`${toDate}T00:00:00Z`).getTime();
  return Math.round((d2 - d1) / (24 * 60 * 60 * 1000));
}

/**
 * 실시간 Effective Status 계산
 * - 취소됨: CANCELLED
 * - 사용됨: USED
 * - 미사용 시:
 *   - today <= expiresOn: AVAILABLE (만료일 당일까지 사용 가능)
 *   - today > expiresOn: EXPIRED (만료일 익일부터 만료)
 */
export function getCompLeaveEffectiveStatus(
  leave: {
    status?: string;
    dbStatus?: string;
    expiresOn: string;
    cancelledAt?: string | null;
    usedOn?: string | null;
  },
  today = todayKST(),
): CompensatoryLeaveStatus {
  if (leave.cancelledAt) {
    return 'CANCELLED';
  }
  const currentStatus = leave.status || leave.dbStatus;
  if (currentStatus === 'USED' || Boolean(leave.usedOn)) {
    return 'USED';
  }
  if (today > leave.expiresOn) {
    return 'EXPIRED';
  }
  return 'AVAILABLE';
}

// ─── 대체휴무 발생 (Grant) ─────────────────────────────────────────────────────

/**
 * 휴일근무 등록 시 대체휴무 1일 생성 D1 Statement 준비
 * (동일 batch 내 원자적 실행용)
 */
export function buildGrantCompLeaveStatement(params: {
  id: string;
  employeeId: string;
  sourceOvertimeId: string;
  grantDate: string;
  actorId: string;
  now: string;
}) {
  const { id, employeeId, sourceOvertimeId, grantDate, actorId, now } = params;
  const expiresOn = calculateCompLeaveExpiryDate(grantDate);

  return env.DB.prepare(
    `INSERT INTO compensatory_leaves
       (id, employee_id, source_overtime_id, issued_on, expires_on, status, issued_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'AVAILABLE', ?, ?, ?)`
  ).bind(id, employeeId, sourceOvertimeId, grantDate, expiresOn, actorId, now, now);
}

/**
 * 대체휴무 발생 Audit Log Statement 준비
 */
export function buildGrantCompLeaveAuditStatement(params: {
  id: string;
  employeeId: string;
  compLeaveId: string;
  sourceOvertimeId: string;
  grantDate: string;
  actorId: string;
  now: string;
}) {
  const { id, employeeId, compLeaveId, sourceOvertimeId, grantDate, actorId, now } = params;
  const expiresOn = calculateCompLeaveExpiryDate(grantDate);

  return env.DB.prepare(
    `INSERT INTO audit_logs
       (id, actor_employee_id, target_employee_id, entity_type, entity_id, action, target_date, after_json, reason, created_at)
     VALUES (?, ?, ?, 'COMPENSATORY_LEAVE', ?, 'CREATE', ?, ?, '휴일근무 대체휴무 1일 부여', ?)`
  ).bind(
    id,
    actorId,
    employeeId,
    compLeaveId,
    grantDate,
    JSON.stringify({
      compLeaveId,
      employeeId,
      sourceOvertimeId,
      issuedOn: grantDate,
      expiresOn,
      status: 'AVAILABLE',
    }),
    now
  );
}

/**
 * 휴일근무에 대체휴무 부여가 선택된 경우 실제 대체휴무 원본을 보장한다.
 * 같은 휴일근무에 대해 여러 번 호출해도 중복 생성하지 않는다.
 */
export async function ensureCompensatoryLeaveForOvertime(params: {
  employeeId: string;
  sourceOvertimeId: string;
  grantDate: string;
  actorId: string;
  now?: string;
}): Promise<{ id: string; created: boolean }> {
  const { employeeId, sourceOvertimeId, grantDate, actorId } = params;
  const existing = await env.DB.prepare(
    `SELECT id FROM compensatory_leaves WHERE source_overtime_id = ? LIMIT 1`
  )
    .bind(sourceOvertimeId)
    .first<{ id: string }>();

  if (existing) {
    return { id: existing.id, created: false };
  }

  const now = params.now ?? nowISO();
  const compLeaveId = crypto.randomUUID();

  await env.DB.batch([
    buildGrantCompLeaveStatement({
      id: compLeaveId,
      employeeId,
      sourceOvertimeId,
      grantDate,
      actorId,
      now,
    }),
    buildGrantCompLeaveAuditStatement({
      id: crypto.randomUUID(),
      employeeId,
      compLeaveId,
      sourceOvertimeId,
      grantDate,
      actorId,
      now,
    }),
  ]);

  return { id: compLeaveId, created: true };
}
// ─── ADMIN: 대체휴무 사용 등록 ─────────────────────────────────────────────────

/**
 * ADMIN: 대체휴무 사용 등록
 *
 * 엄격한 원칙:
 * 1. FIFO/FEFO 자동 차감 절대 금지! ADMIN이 지정한 compensatoryLeaveId 원본을 사용.
 * 2. 근무일 검증 (일반 근무일 또는 대체근무일만 가능. 주말, 공휴일, 회사 휴무일 불가).
 * 3. 유효기간 검증 (issued_on <= usedOn <= expires_on).
 * 4. 연차 충돌 검증 (해당 일자에 이미 연차가 있으면 차단).
 * 5. 중복 사용 검증 (해당 일자에 이미 대체휴무 사용이 있으면 차단).
 * 6. 휴직 기간 및 퇴사일 검증.
 */
export async function useCompensatoryLeave(params: {
  employeeId: string;
  compensatoryLeaveId: string;
  usedOn: string;
  actorId: string;
}): Promise<{ ok: true; usageId: string } | { ok: false; error: string }> {
  const { employeeId, compensatoryLeaveId, usedOn, actorId } = params;
  const today = todayKST();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(usedOn)) {
    return { ok: false, error: '사용일 날짜 형식이 올바르지 않습니다. (YYYY-MM-DD)' };
  }

  // 1. 대체휴무 원본 조회
  const compLeave = await env.DB.prepare(
    `SELECT id, employee_id AS employeeId, source_overtime_id AS sourceOvertimeId,
            issued_on AS issuedOn, expires_on AS expiresOn, status, cancelled_at AS cancelledAt
     FROM compensatory_leaves
     WHERE id = ? LIMIT 1`
  )
    .bind(compensatoryLeaveId)
    .first<{
      id: string;
      employeeId: string;
      sourceOvertimeId: string;
      issuedOn: string;
      expiresOn: string;
      status: string;
      cancelledAt: string | null;
    }>();

  if (!compLeave) {
    return { ok: false, error: '대체휴무 기록을 찾을 수 없습니다.' };
  }

  if (compLeave.employeeId !== employeeId) {
    return { ok: false, error: '해당 직원의 대체휴무가 아닙니다.' };
  }

  // 2. 실질 상태 검증 (AVAILABLE 여부)
  const effectiveStatus = getCompLeaveEffectiveStatus(compLeave, today);
  if (effectiveStatus === 'CANCELLED') {
    return { ok: false, error: '취소된 대체휴무는 사용할 수 없습니다.' };
  }
  if (effectiveStatus === 'USED') {
    return { ok: false, error: '이미 사용 완료된 대체휴무입니다.' };
  }
  if (effectiveStatus === 'EXPIRED') {
    return { ok: false, error: '유효기간이 만료된 대체휴무는 사용할 수 없습니다.' };
  }

  // 3. 사용일 유효기간 범위 검증 (issuedOn <= usedOn <= expiresOn)
  if (usedOn < compLeave.issuedOn) {
    return {
      ok: false,
      error: `대체휴무는 발행일(${compLeave.issuedOn}) 이전 날짜에 사용할 수 없습니다.`,
    };
  }
  if (usedOn > compLeave.expiresOn) {
    return {
      ok: false,
      error: `대체휴무는 만료일(${compLeave.expiresOn}) 이후 날짜에 사용할 수 없습니다.`,
    };
  }

  // 4. 직원 상태 검증 (입사일, 퇴사일, 휴직)
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
    return { ok: false, error: '직원 정보를 찾을 수 없습니다.' };
  }

  if (usedOn < emp.hiredOn) {
    return { ok: false, error: '입사일 이전 날짜에는 대체휴무를 사용할 수 없습니다.' };
  }

  if (emp.resignationDate && usedOn > emp.resignationDate) {
    return { ok: false, error: '퇴사일 이후에는 대체휴무를 사용할 수 없습니다.' };
  }

  // 휴직 기간 검증
  const inLeaveOfAbsence = await env.DB.prepare(
    `SELECT id FROM leave_of_absence_periods
     WHERE employee_id = ? AND started_on <= ? AND (ended_on IS NULL OR ended_on >= ?)
     LIMIT 1`
  )
    .bind(employeeId, usedOn, usedOn)
    .first();

  if (inLeaveOfAbsence) {
    return { ok: false, error: '휴직 기간 중에는 대체휴무를 사용할 수 없습니다.' };
  }

  // 5. 근무일 검증 (Work Calendar 기반: 토/일, 공휴일, 회사 휴무일 사용 차단)
  const effectiveWorkday = await getEffectiveWorkday(usedOn);
  if (!effectiveWorkday.isWorkday) {
    return { ok: false, error: '대체휴무는 근무일에만 사용할 수 있습니다. (휴일/공휴일/휴무일 사용 불가)' };
  }

  // 6. 동일 날짜 연차 충돌 검증
  const existingLeave = await env.DB.prepare(
    `SELECT id, leave_type AS leaveType FROM leave_usages
     WHERE employee_id = ? AND leave_date = ? AND cancelled_at IS NULL
     LIMIT 1`
  )
    .bind(employeeId, usedOn)
    .first<{ id: string; leaveType: string }>();

  if (existingLeave) {
    return { ok: false, error: '해당 일자에 이미 연차가 등록되어 있어 대체휴무를 사용할 수 없습니다.' };
  }

  // 7. 동일 날짜 대체휴무 중복 사용 검증
  const existingCompUsage = await env.DB.prepare(
    `SELECT id FROM compensatory_leave_usages
     WHERE employee_id = ? AND used_on = ?
     LIMIT 1`
  )
    .bind(employeeId, usedOn)
    .first();

  if (existingCompUsage) {
    return { ok: false, error: '해당 일자에 이미 사용된 대체휴무가 있습니다.' };
  }

  // 8. DB 저장 및 원자적 실행
  const usageId = crypto.randomUUID();
  const auditId = crypto.randomUUID();
  const now = nowISO();

  const beforeJson = JSON.stringify({
    id: compLeave.id,
    status: compLeave.status,
    issuedOn: compLeave.issuedOn,
    expiresOn: compLeave.expiresOn,
  });

  const afterJson = JSON.stringify({
    id: compLeave.id,
    status: 'USED',
    usageId,
    usedOn,
    issuedOn: compLeave.issuedOn,
    expiresOn: compLeave.expiresOn,
  });

  try {
    await env.DB.batch([
      // 대체휴무 사용 테이블 등록
      env.DB.prepare(
        `INSERT INTO compensatory_leave_usages
           (id, compensatory_leave_id, employee_id, used_on, registered_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).bind(usageId, compensatoryLeaveId, employeeId, usedOn, actorId, now, now),

      // 대체휴무 원본 상태 USED로 갱신
      env.DB.prepare(
        `UPDATE compensatory_leaves
         SET status = 'USED', updated_at = ?
         WHERE id = ?`
      ).bind(now, compensatoryLeaveId),

      // Audit Log 기록
      env.DB.prepare(
        `INSERT INTO audit_logs
           (id, actor_employee_id, target_employee_id, entity_type, entity_id, action, target_date, before_json, after_json, reason, created_at)
         VALUES (?, ?, ?, 'COMPENSATORY_LEAVE_USAGE', ?, 'CREATE', ?, ?, ?, '대체휴무 1일 사용 등록', ?)`
      ).bind(
        auditId,
        actorId,
        employeeId,
        usageId,
        usedOn,
        beforeJson,
        afterJson,
        now
      ),
    ]);

    return { ok: true, usageId };
  } catch (e) {
    const errMsg = String(e);
    if (errMsg.toLowerCase().includes('unique')) {
      return { ok: false, error: '해당 대체휴무는 이미 사용되었거나 해당 날짜에 이미 사용 내역이 있습니다.' };
    }
    throw e;
  }
}

// ─── ADMIN: 대체휴무 사용 취소 ─────────────────────────────────────────────────

/**
 * ADMIN: 대체휴무 사용 취소
 * - USED 상태인 대체휴무를 사용 취소하여 AVAILABLE(만료일 경과 시 실질 상태 EXPIRED)로 복원
 * - compensatory_leave_usages 레코드 삭제
 * - Audit Log 기록 (취소 사유 및 이전 상태)
 */
export async function cancelCompensatoryLeaveUsage(params: {
  compensatoryLeaveId: string;
  actorId: string;
  reason?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { compensatoryLeaveId, actorId, reason = '관리자 대체휴무 사용 취소' } = params;

  // 대체휴무 및 사용 기록 조회
  const leave = await env.DB.prepare(
    `SELECT cl.id, cl.employee_id AS employeeId, cl.source_overtime_id AS sourceOvertimeId,
            cl.issued_on AS issuedOn, cl.expires_on AS expiresOn, cl.status,
            clu.id AS usageId, clu.used_on AS usedOn
     FROM compensatory_leaves cl
     LEFT JOIN compensatory_leave_usages clu ON clu.compensatory_leave_id = cl.id
     WHERE cl.id = ? LIMIT 1`
  )
    .bind(compensatoryLeaveId)
    .first<{
      id: string;
      employeeId: string;
      sourceOvertimeId: string;
      issuedOn: string;
      expiresOn: string;
      status: string;
      usageId: string | null;
      usedOn: string | null;
    }>();

  if (!leave) {
    return { ok: false, error: '대체휴무 기록을 찾을 수 없습니다.' };
  }

  if (leave.status !== 'USED' || !leave.usageId) {
    return { ok: false, error: '사용 완료된 대체휴무만 사용을 취소할 수 있습니다.' };
  }

  const now = nowISO();
  const auditId = crypto.randomUUID();

  const beforeJson = JSON.stringify({
    compensatoryLeaveId: leave.id,
    usageId: leave.usageId,
    usedOn: leave.usedOn,
    status: 'USED',
  });

  const afterJson = JSON.stringify({
    compensatoryLeaveId: leave.id,
    usageId: null,
    usedOn: null,
    status: 'AVAILABLE',
  });

  await env.DB.batch([
    // 사용 기록 삭제
    env.DB.prepare(
      `DELETE FROM compensatory_leave_usages WHERE id = ?`
    ).bind(leave.usageId),

    // 대체휴무 상태 AVAILABLE 복원
    env.DB.prepare(
      `UPDATE compensatory_leaves
       SET status = 'AVAILABLE', updated_at = ?
       WHERE id = ?`
    ).bind(now, leave.id),

    // Audit Log 기록
    env.DB.prepare(
      `INSERT INTO audit_logs
         (id, actor_employee_id, target_employee_id, entity_type, entity_id, action, target_date, before_json, after_json, reason, created_at)
       VALUES (?, ?, ?, 'COMPENSATORY_LEAVE_USAGE', ?, 'DELETE', ?, ?, ?, ?, ?)`
    ).bind(
      auditId,
      actorId,
      leave.employeeId,
      leave.usageId,
      leave.usedOn,
      beforeJson,
      afterJson,
      reason,
      now
    ),
  ]);

  return { ok: true };
}

/**
 * ADMIN: 대체휴무 부여 취소
 * - AVAILABLE 또는 EXPIRED 상태인 대체휴무를 Soft Delete (cancelled_at = now)
 * - 이미 사용 완료(USED)된 대체휴무는 먼저 사용 취소 후 부여 취소 가능
 * - Audit Log 기록
 */
export async function cancelCompensatoryLeaveGrant(params: {
  compensatoryLeaveId: string;
  actorId: string;
  reason?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { compensatoryLeaveId, actorId, reason = '관리자 대체휴무 부여 취소' } = params;

  const leave = await env.DB.prepare(
    `SELECT cl.id, cl.employee_id AS employeeId, cl.source_overtime_id AS sourceOvertimeId,
            cl.issued_on AS issuedOn, cl.expires_on AS expiresOn, cl.status, cl.cancelled_at AS cancelledAt
     FROM compensatory_leaves cl
     WHERE cl.id = ? LIMIT 1`
  )
    .bind(compensatoryLeaveId)
    .first<{
      id: string;
      employeeId: string;
      sourceOvertimeId: string;
      issuedOn: string;
      expiresOn: string;
      status: string;
      cancelledAt: string | null;
    }>();

  if (!leave) {
    return { ok: false, error: '대체휴무 기록을 찾을 수 없습니다.' };
  }

  if (leave.cancelledAt) {
    return { ok: false, error: '이미 취소된 대체휴무입니다.' };
  }

  if (leave.status === 'USED') {
    return { ok: false, error: '이미 사용된 대체휴무는 먼저 사용 취소 후 부여를 취소할 수 있습니다.' };
  }

  const now = nowISO();
  const auditId = crypto.randomUUID();

  await env.DB.batch([
    env.DB.prepare(
      `UPDATE compensatory_leaves
       SET cancelled_at = ?, cancelled_by = ?, updated_at = ?
       WHERE id = ?`
    ).bind(now, actorId, now, leave.id),

    env.DB.prepare(
      `INSERT INTO audit_logs
         (id, actor_employee_id, target_employee_id, entity_type, entity_id, action, target_date, before_json, after_json, reason, created_at)
       VALUES (?, ?, ?, 'COMPENSATORY_LEAVE', ?, 'DELETE', ?, ?, ?, ?, ?)`
    ).bind(
      auditId,
      actorId,
      leave.employeeId,
      leave.id,
      leave.issuedOn,
      JSON.stringify(leave),
      JSON.stringify({ ...leave, cancelledAt: now, cancelledBy: actorId }),
      reason,
      now
    ),
  ]);

  return { ok: true };
}

// ─── ADMIN 조회 기능 ──────────────────────────────────────────────────────────

/**
 * ADMIN: 대체휴무 목록 및 상단 통계 조회
 */
export async function listCompensatoryLeavesAdmin(params: {
  search?: string;
  department?: string;
  statusFilter?: string;      // ALL, AVAILABLE, USED, EXPIRED, EXPIRING_30
  startDate?: string;
  endDate?: string;
  includeResigned?: boolean;
}): Promise<{
  rows: CompensatoryLeaveRow[];
  summary: CompensatoryLeaveSummary;
}> {
  const {
    search,
    department,
    statusFilter = 'ALL',
    startDate,
    endDate,
    includeResigned = false,
  } = params;

  const today = todayKST();
  const thisMonthStart = today.slice(0, 7) + '-01';

  let sql = `
    SELECT
      cl.id,
      cl.employee_id AS employeeId,
      e.employee_number AS employeeNumber,
      e.full_name AS fullName,
      e.department,
      e.employment_status AS employmentStatus,
      cl.source_overtime_id AS sourceOvertimeId,
      ow.work_date AS sourceWorkDate,
      ow.started_at AS sourceStartedAt,
      ow.ended_at AS sourceEndedAt,
      ow.duration_minutes AS sourceDurationMinutes,
      ow.description AS sourceDescription,
      cl.issued_on AS issuedOn,
      cl.expires_on AS expiresOn,
      cl.status AS dbStatus,
      cl.cancelled_at AS cancelledAt,
      clu.id AS usageId,
      clu.used_on AS usedOn
    FROM compensatory_leaves cl
    JOIN employees e ON e.id = cl.employee_id
    JOIN overtime_works ow ON ow.id = cl.source_overtime_id
    LEFT JOIN compensatory_leave_usages clu ON clu.compensatory_leave_id = cl.id
    WHERE cl.cancelled_at IS NULL
  `;
  const binds: unknown[] = [];

  if (!includeResigned) {
    sql += ` AND e.employment_status <> 'RESIGNED'`;
  }

  if (department && department !== 'ALL') {
    sql += ` AND e.department = ?`;
    binds.push(department);
  }

  if (search?.trim()) {
    const q = `%${search.trim()}%`;
    sql += ` AND (e.employee_number LIKE ? OR e.full_name LIKE ?)`;
    binds.push(q, q);
  }

  if (startDate) {
    sql += ` AND cl.issued_on >= ?`;
    binds.push(startDate);
  }
  if (endDate) {
    sql += ` AND cl.issued_on <= ?`;
    binds.push(endDate);
  }

  sql += ` ORDER BY cl.issued_on DESC, cl.created_at DESC`;

  const rawRows = await env.DB.prepare(sql).bind(...binds).all<{
    id: string;
    employeeId: string;
    employeeNumber: string;
    fullName: string;
    department: string;
    employmentStatus: any;
    sourceOvertimeId: string;
    sourceWorkDate: string;
    sourceStartedAt: string;
    sourceEndedAt: string;
    sourceDurationMinutes: number;
    sourceDescription: string;
    issuedOn: string;
    expiresOn: string;
    dbStatus: 'AVAILABLE' | 'USED' | 'EXPIRED';
    cancelledAt: string | null;
    usageId: string | null;
    usedOn: string | null;
  }>();

  // 통계 집계 및 실질 상태(Effective Status) 계산
  let totalAvailableDays = 0;
  let usedThisMonthDays = 0;
  let expiringWithin30Days = 0;
  let expiredDays = 0;

  const processedRows: CompensatoryLeaveRow[] = [];

  for (const r of rawRows.results) {
    const effectiveStatus = getCompLeaveEffectiveStatus(r, today);
    const diffDays = daysBetweenDates(today, r.expiresOn);

    // 통계 집계
    if (effectiveStatus === 'AVAILABLE') {
      totalAvailableDays += 1;
      if (diffDays >= 0 && diffDays <= 30) {
        expiringWithin30Days += 1;
      }
    } else if (effectiveStatus === 'USED') {
      if (r.usedOn && r.usedOn >= thisMonthStart) {
        usedThisMonthDays += 1;
      }
    } else if (effectiveStatus === 'EXPIRED') {
      expiredDays += 1;
    }

    const rowObj: CompensatoryLeaveRow = {
      id: r.id,
      employeeId: r.employeeId,
      employeeNumber: r.employeeNumber,
      fullName: r.fullName,
      department: r.department,
      employmentStatus: r.employmentStatus,
      sourceOvertimeId: r.sourceOvertimeId,
      sourceWorkDate: r.sourceWorkDate,
      sourceStartedAt: r.sourceStartedAt,
      sourceEndedAt: r.sourceEndedAt,
      sourceDurationMinutes: r.sourceDurationMinutes,
      sourceDescription: r.sourceDescription,
      issuedOn: r.issuedOn,
      expiresOn: r.expiresOn,
      dbStatus: r.dbStatus,
      status: effectiveStatus,
      usedOn: r.usedOn,
      usageId: r.usageId,
      cancelledAt: r.cancelledAt,
      daysUntilExpiry: diffDays,
    };

    // 상태 필터링 적용
    if (statusFilter === 'ALL') {
      processedRows.push(rowObj);
    } else if (statusFilter === 'EXPIRING_30') {
      if (effectiveStatus === 'AVAILABLE' && diffDays >= 0 && diffDays <= 30) {
        processedRows.push(rowObj);
      }
    } else if (statusFilter === effectiveStatus) {
      processedRows.push(rowObj);
    }
  }

  return {
    rows: processedRows,
    summary: {
      totalAvailableDays,
      usedThisMonthDays,
      expiringWithin30Days,
      expiredDays,
    },
  };
}

/**
 * 특정 직원의 사용 가능한(AVAILABLE) 대체휴무 목록 조회
 * (ADMIN 사용등록 모달에서 관리자가 직접 선택할 원본 목록)
 */
export async function getAvailableCompensatoryLeavesForEmployee(
  employeeId: string
): Promise<CompensatoryLeaveRow[]> {
  const today = todayKST();

  const rows = await env.DB.prepare(
    `SELECT
       cl.id,
       cl.employee_id AS employeeId,
       e.employee_number AS employeeNumber,
       e.full_name AS fullName,
       e.department,
       e.employment_status AS employmentStatus,
       cl.source_overtime_id AS sourceOvertimeId,
       ow.work_date AS sourceWorkDate,
       ow.started_at AS sourceStartedAt,
       ow.ended_at AS sourceEndedAt,
       ow.duration_minutes AS sourceDurationMinutes,
       ow.description AS sourceDescription,
       cl.issued_on AS issuedOn,
       cl.expires_on AS expiresOn,
       cl.status AS dbStatus,
       cl.cancelled_at AS cancelledAt,
       NULL AS usageId,
       NULL AS usedOn
     FROM compensatory_leaves cl
     JOIN employees e ON e.id = cl.employee_id
     JOIN overtime_works ow ON ow.id = cl.source_overtime_id
     WHERE cl.employee_id = ?
       AND cl.cancelled_at IS NULL
       AND cl.status = 'AVAILABLE'
       AND cl.expires_on >= ?
     ORDER BY cl.expires_on ASC, cl.issued_on ASC`
  )
    .bind(employeeId, today)
    .all<any>();

  return rows.results.map((r) => ({
    ...r,
    status: 'AVAILABLE' as CompensatoryLeaveStatus,
    daysUntilExpiry: daysBetweenDates(today, r.expiresOn),
  }));
}

/**
 * ADMIN Dashboard용: 30일 이내 만료예정 대체휴무 목록
 */
export async function getExpiringSoonCompLeavesAdmin(limit = 10): Promise<ExpiringSoonCompLeave[]> {
  const today = todayKST();

  const rows = await env.DB.prepare(
    `SELECT
       cl.id,
       cl.employee_id AS employeeId,
       e.employee_number AS employeeNumber,
       e.full_name AS fullName,
       e.department,
       ow.work_date AS sourceWorkDate,
       cl.issued_on AS issuedOn,
       cl.expires_on AS expiresOn
     FROM compensatory_leaves cl
     JOIN employees e ON e.id = cl.employee_id
     JOIN overtime_works ow ON ow.id = cl.source_overtime_id
     WHERE cl.cancelled_at IS NULL
       AND cl.status = 'AVAILABLE'
       AND cl.expires_on >= ?
       AND e.employment_status <> 'RESIGNED'
     ORDER BY cl.expires_on ASC
     LIMIT 50`
  )
    .bind(today)
    .all<{
      id: string;
      employeeId: string;
      employeeNumber: string;
      fullName: string;
      department: string;
      sourceWorkDate: string;
      issuedOn: string;
      expiresOn: string;
    }>();

  const results: ExpiringSoonCompLeave[] = [];
  for (const r of rows.results) {
    const diffDays = daysBetweenDates(today, r.expiresOn);
    if (diffDays >= 0 && diffDays <= 30) {
      results.push({
        ...r,
        daysUntilExpiry: diffDays,
      });
      if (results.length >= limit) break;
    }
  }

  return results;
}

// ─── USER 조회 기능 ──────────────────────────────────────────────────────────

/**
 * USER 본인 대체휴무 조회 (세션 ID 강제)
 */
export async function getUserCompensatoryLeaves(employeeId: string): Promise<{
  rows: UserCompensatoryLeaveRow[];
  summary: UserCompensatoryLeaveSummary;
  expiringSoonList: ExpiringSoonCompLeave[];
}> {
  const today = todayKST();

  const rawRows = await env.DB.prepare(
    `SELECT
       cl.id,
       ow.work_date AS sourceWorkDate,
       ow.duration_minutes AS sourceDurationMinutes,
       cl.issued_on AS issuedOn,
       cl.expires_on AS expiresOn,
       cl.status AS dbStatus,
       cl.cancelled_at AS cancelledAt,
       clu.used_on AS usedOn
     FROM compensatory_leaves cl
     JOIN overtime_works ow ON ow.id = cl.source_overtime_id
     LEFT JOIN compensatory_leave_usages clu ON clu.compensatory_leave_id = cl.id
     WHERE cl.employee_id = ?
       AND cl.cancelled_at IS NULL
     ORDER BY cl.issued_on DESC, cl.created_at DESC`
  )
    .bind(employeeId)
    .all<{
      id: string;
      sourceWorkDate: string;
      sourceDurationMinutes: number;
      issuedOn: string;
      expiresOn: string;
      dbStatus: 'AVAILABLE' | 'USED' | 'EXPIRED';
      cancelledAt: string | null;
      usedOn: string | null;
    }>();

  let availableDays = 0;
  let usedDays = 0;
  let expiringSoonDays = 0;

  const rows: UserCompensatoryLeaveRow[] = [];
  const expiringSoonList: ExpiringSoonCompLeave[] = [];

  for (const r of rawRows.results) {
    const effectiveStatus = getCompLeaveEffectiveStatus(
      { status: r.dbStatus, expiresOn: r.expiresOn, cancelledAt: r.cancelledAt, usedOn: r.usedOn },
      today
    );
    const diffDays = daysBetweenDates(today, r.expiresOn);

    if (effectiveStatus === 'AVAILABLE') {
      availableDays += 1;
      if (diffDays >= 0 && diffDays <= 30) {
        expiringSoonDays += 1;
        expiringSoonList.push({
          id: r.id,
          employeeId,
          employeeNumber: '',
          fullName: '',
          department: '',
          sourceWorkDate: r.sourceWorkDate,
          issuedOn: r.issuedOn,
          expiresOn: r.expiresOn,
          daysUntilExpiry: diffDays,
        });
      }
    } else if (effectiveStatus === 'USED') {
      usedDays += 1;
    }

    rows.push({
      id: r.id,
      sourceWorkDate: r.sourceWorkDate,
      sourceDurationMinutes: r.sourceDurationMinutes,
      issuedOn: r.issuedOn,
      expiresOn: r.expiresOn,
      status: effectiveStatus,
      usedOn: r.usedOn,
      daysUntilExpiry: diffDays,
    });
  }

  return {
    rows,
    summary: {
      availableDays,
      usedDays,
      expiringSoonDays,
    },
    expiringSoonList,
  };
}

// ─── Phase 6 데이터 백필 ──────────────────────────────────────────────────────

/**
 * Phase 6 기존 휴일근무 중 대체휴무 미발행 건 안전 백필
 */
export async function backfillCompensatoryLeaves(actorId: string): Promise<{
  totalEligible: number;
  createdCount: number;
  skippedCount: number;
}> {
  // 대상: work_type = 'HOLIDAY_WORK', grant_comp_leave = 1, cancelled_at IS NULL
  // 그리고 아직 compensatory_leaves에 없는 건
  const eligible = await env.DB.prepare(
    `SELECT ow.id, ow.employee_id AS employeeId, ow.work_date AS workDate, ow.created_at AS createdAt
     FROM overtime_works ow
     LEFT JOIN compensatory_leaves cl ON cl.source_overtime_id = ow.id
     WHERE ow.work_type = 'HOLIDAY_WORK'
       AND ow.grant_comp_leave = 1
       AND ow.cancelled_at IS NULL
       AND cl.id IS NULL`
  ).all<{ id: string; employeeId: string; workDate: string; createdAt: string }>();

  let createdCount = 0;
  const now = nowISO();

  for (const item of eligible.results) {
    const compLeaveId = crypto.randomUUID();
    const expiresOn = calculateCompLeaveExpiryDate(item.workDate);

    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO compensatory_leaves
           (id, employee_id, source_overtime_id, issued_on, expires_on, status, issued_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'AVAILABLE', ?, ?, ?)`
      ).bind(compLeaveId, item.employeeId, item.id, item.workDate, expiresOn, actorId, now, now),

      env.DB.prepare(
        `INSERT INTO audit_logs
           (id, actor_employee_id, target_employee_id, entity_type, entity_id, action, target_date, after_json, reason, created_at)
         VALUES (?, ?, ?, 'COMPENSATORY_LEAVE', ?, 'CREATE', ?, ?, 'Phase 6 기존 휴일근무 대체휴무 백필', ?)`
      ).bind(
        crypto.randomUUID(),
        actorId,
        item.employeeId,
        compLeaveId,
        item.workDate,
        JSON.stringify({
          compLeaveId,
          employeeId: item.employeeId,
          sourceOvertimeId: item.id,
          issuedOn: item.workDate,
          expiresOn,
          status: 'AVAILABLE',
        }),
        now
      ),
    ]);

    createdCount += 1;
  }

  return {
    totalEligible: eligible.results.length,
    createdCount,
    skippedCount: 0,
  };
}
