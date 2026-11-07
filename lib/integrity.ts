/**
 * lib/integrity.ts
 * Phase 10: 운영 DB 데이터 무결성 및 정합성 검사 엔진 (Read-Only)
 *
 * 원칙:
 * 1. 일체의 INSERT / UPDATE / DELETE 없이 오직 SELECT 쿼리만 수행합니다.
 * 2. 이상 발견 시 절대 자동 수정하지 않고, 관리자에게 상세 목록과 사유만 보고합니다.
 */

import { env } from 'cloudflare:workers';

export interface IntegrityIssue {
  id: string;
  category: string;
  severity: 'INFO' | 'WARNING' | 'ERROR';
  title: string;
  description: string;
  targetId?: string;
  targetEmployee?: string;
  targetDate?: string;
  actionUrl?: string;
}

export interface IntegrityCheckResult {
  checkedAt: string;
  totalChecks: number;
  passedChecks: number;
  failedChecks: number;
  hasErrors: boolean;
  hasWarnings: boolean;
  issues: IntegrityIssue[];
}

export async function runSystemIntegrityCheck(): Promise<IntegrityCheckResult> {
  const issues: IntegrityIssue[] = [];
  const checkedAt = new Date().toISOString();
  let totalChecks = 0;
  let passedChecks = 0;

  // ─── 1. 중복 사번 검사 ──────────────────────────────────────────────────
  totalChecks++;
  try {
    const dupEmployees = await env.DB.prepare(
      `SELECT employee_number, COUNT(*) as cnt
       FROM employees
       GROUP BY employee_number
       HAVING cnt > 1`
    ).all<{ employee_number: string; cnt: number }>();

    if (dupEmployees.results.length > 0) {
      for (const row of dupEmployees.results) {
        issues.push({
          id: `dup-emp-${row.employee_number}`,
          category: '사원 데이터',
          severity: 'ERROR',
          title: '중복 사번 감지',
          description: `사번 [${row.employee_number}]가 DB 내 ${row.cnt}회 중복 등록되어 있습니다.`,
          actionUrl: '/admin/employees',
        });
      }
    } else {
      passedChecks++;
    }
  } catch (err) {
    issues.push({
      id: 'err-check-emp-dup',
      category: '사원 데이터',
      severity: 'ERROR',
      title: '중복 사번 검사 쿼리 오류',
      description: String(err),
    });
  }

  // ─── 2. 동일 직원 + 동일 일자 근태 중복 검사 ─────────────────────────────
  totalChecks++;
  try {
    const dupAttendance = await env.DB.prepare(
      `SELECT a.employee_id, a.work_date, COUNT(*) as cnt, e.full_name, e.employee_number
       FROM attendance a
       LEFT JOIN employees e ON e.id = a.employee_id
       GROUP BY a.employee_id, a.work_date
       HAVING cnt > 1`
    ).all<{ employee_id: string; work_date: string; cnt: number; full_name: string | null; employee_number: string | null }>();

    if (dupAttendance.results.length > 0) {
      for (const row of dupAttendance.results) {
        issues.push({
          id: `dup-att-${row.employee_id}-${row.work_date}`,
          category: '출퇴근 근태',
          severity: 'ERROR',
          title: '근태 기록 중복',
          description: `직원 [${row.full_name || row.employee_number}]의 ${row.work_date} 근태가 ${row.cnt}건 중복 저장되어 있습니다.`,
          targetEmployee: row.full_name ? `${row.full_name} (${row.employee_number})` : row.employee_id,
          targetDate: row.work_date,
          actionUrl: `/admin/attendance?date=${row.work_date}`,
        });
      }
    } else {
      passedChecks++;
    }
  } catch (err) {
    issues.push({
      id: 'err-check-att-dup',
      category: '출퇴근 근태',
      severity: 'ERROR',
      title: '근태 중복 검사 쿼리 오류',
      description: String(err),
    });
  }

  // ─── 3. 입사일 > 퇴사일 역전 검사 ─────────────────────────────────────────
  totalChecks++;
  try {
    const invalidDates = await env.DB.prepare(
      `SELECT id, employee_number, full_name, hired_on, resignation_date
       FROM employees
       WHERE resignation_date IS NOT NULL AND hired_on > resignation_date`
    ).all<{ id: string; employee_number: string; full_name: string; hired_on: string; resignation_date: string }>();

    if (invalidDates.results.length > 0) {
      for (const row of invalidDates.results) {
        issues.push({
          id: `invalid-date-${row.id}`,
          category: '사원 데이터',
          severity: 'ERROR',
          title: '입사일-퇴사일 역전 오류',
          description: `직원 [${row.full_name} (${row.employee_number})]의 입사일(${row.hired_on})이 퇴사일(${row.resignation_date})보다 미래입니다.`,
          targetEmployee: `${row.full_name} (${row.employee_number})`,
          actionUrl: '/admin/employees',
        });
      }
    } else {
      passedChecks++;
    }
  } catch (err) {
    issues.push({
      id: 'err-check-emp-dates',
      category: '사원 데이터',
      severity: 'ERROR',
      title: '입퇴사일 검사 쿼리 오류',
      description: String(err),
    });
  }

  // ─── 4. 휴직 시작일 > 종료일 역전 검사 ────────────────────────────────────
  totalChecks++;
  try {
    const invalidLoa = await env.DB.prepare(
      `SELECT loa.id, loa.started_on, loa.ended_on, e.full_name, e.employee_number
       FROM leave_of_absence_periods loa
       LEFT JOIN employees e ON e.id = loa.employee_id
       WHERE loa.ended_on IS NOT NULL AND loa.started_on > loa.ended_on`
    ).all<{ id: string; started_on: string; ended_on: string; full_name: string | null; employee_number: string | null }>();

    if (invalidLoa.results.length > 0) {
      for (const row of invalidLoa.results) {
        issues.push({
          id: `invalid-loa-${row.id}`,
          category: '휴직 관리',
          severity: 'ERROR',
          title: '휴직 기간 역전 오류',
          description: `직원 [${row.full_name || ''} (${row.employee_number || ''})]의 휴직 시작일(${row.started_on})이 종료일(${row.ended_on})보다 늦습니다.`,
          targetEmployee: `${row.full_name || ''} (${row.employee_number || ''})`,
          actionUrl: '/admin/employees',
        });
      }
    } else {
      passedChecks++;
    }
  } catch (err) {
    issues.push({
      id: 'err-check-loa',
      category: '휴직 관리',
      severity: 'ERROR',
      title: '휴직기간 검사 쿼리 오류',
      description: String(err),
    });
  }

  // ─── 5. 존재하지 않는 사원 참조 (외래키 고아 데이터) ──────────────────────
  totalChecks++;
  try {
    const orphanAttendance = await env.DB.prepare(
      `SELECT a.id, a.work_date, a.employee_id
       FROM attendance a
       LEFT JOIN employees e ON e.id = a.employee_id
       WHERE e.id IS NULL
       LIMIT 5`
    ).all<{ id: string; work_date: string; employee_id: string }>();

    if (orphanAttendance.results.length > 0) {
      for (const row of orphanAttendance.results) {
        issues.push({
          id: `orphan-att-${row.id}`,
          category: '데이터 무결성',
          severity: 'ERROR',
          title: '사원 미존재 근태 고아 데이터',
          description: `삭제되었거나 존재하지 않는 employee_id [${row.employee_id}]를 참조하는 근태 레코드가 있습니다. (${row.work_date})`,
          targetDate: row.work_date,
        });
      }
    } else {
      passedChecks++;
    }
  } catch (err) {
    issues.push({
      id: 'err-orphan-att',
      category: '데이터 무결성',
      severity: 'ERROR',
      title: '고아 근태 데이터 검사 오류',
      description: String(err),
    });
  }

  // ─── 6. 연차 잔여일수 음수 또는 과다사용 검사 ─────────────────────────────
  totalChecks++;
  try {
    const overUsedLeaves = await env.DB.prepare(
      `SELECT alm.id, alm.year, alm.granted_minutes, alm.carried_minutes,
              e.full_name, e.employee_number,
              COALESCE(SUM(lu.minutes), 0) as used_minutes
       FROM annual_leave_masters alm
       JOIN employees e ON e.id = alm.employee_id
       LEFT JOIN leave_usages lu ON lu.leave_master_id = alm.id AND lu.cancelled_at IS NULL
       GROUP BY alm.id
       HAVING used_minutes > (alm.granted_minutes + alm.carried_minutes)`
    ).all<{
      id: string;
      year: number;
      granted_minutes: number;
      carried_minutes: number;
      full_name: string;
      employee_number: string;
      used_minutes: number;
    }>();

    if (overUsedLeaves.results.length > 0) {
      for (const row of overUsedLeaves.results) {
        const totalGranted = (row.granted_minutes + row.carried_minutes) / 480;
        const totalUsed = row.used_minutes / 480;
        issues.push({
          id: `over-leave-${row.id}`,
          category: '연차 관리',
          severity: 'WARNING',
          title: '연차 한도 초과 사용',
          description: `직원 [${row.full_name} (${row.employee_number})]의 ${row.year}년 연차 사용량(${totalUsed}일)이 총 부여량(${totalGranted}일)을 초과했습니다.`,
          targetEmployee: `${row.full_name} (${row.employee_number})`,
          actionUrl: '/admin/leave',
        });
      }
    } else {
      passedChecks++;
    }
  } catch (err) {
    issues.push({
      id: 'err-check-leave-balance',
      category: '연차 관리',
      severity: 'ERROR',
      title: '연차 잔여 검사 쿼리 오류',
      description: String(err),
    });
  }

  // ─── 7. 대체휴무 USED인데 Usage 기록 없는 불일치 ─────────────────────────
  totalChecks++;
  try {
    const compNoUsage = await env.DB.prepare(
      `SELECT cl.id, cl.issued_on, cl.expires_on, e.full_name, e.employee_number
       FROM compensatory_leaves cl
       LEFT JOIN compensatory_leave_usages clu ON clu.compensatory_leave_id = cl.id
       JOIN employees e ON e.id = cl.employee_id
       WHERE cl.status = 'USED' AND clu.id IS NULL AND cl.cancelled_at IS NULL`
    ).all<{ id: string; issued_on: string; expires_on: string; full_name: string; employee_number: string }>();

    if (compNoUsage.results.length > 0) {
      for (const row of compNoUsage.results) {
        issues.push({
          id: `comp-no-usage-${row.id}`,
          category: '대체휴무 관리',
          severity: 'WARNING',
          title: '대체휴무 사용 상태 불일치 (기록 누락)',
          description: `직원 [${row.full_name} (${row.employee_number})]의 대체휴무(${row.issued_on} 부여)가 USED 상태이나 실제 사용 기록(usage)이 없습니다.`,
          targetEmployee: `${row.full_name} (${row.employee_number})`,
          actionUrl: '/admin/comp-leave',
        });
      }
    } else {
      passedChecks++;
    }
  } catch (err) {
    issues.push({
      id: 'err-check-comp-no-usage',
      category: '대체휴무 관리',
      severity: 'ERROR',
      title: '대체휴무 기록 검사 쿼리 오류',
      description: String(err),
    });
  }

  // ─── 8. 대체휴무 Usage가 있는데 상태가 AVAILABLE인 불일치 ─────────────────
  totalChecks++;
  try {
    const compAvailableWithUsage = await env.DB.prepare(
      `SELECT cl.id, cl.issued_on, cl.expires_on, clu.used_on, e.full_name, e.employee_number
       FROM compensatory_leaves cl
       JOIN compensatory_leave_usages clu ON clu.compensatory_leave_id = cl.id
       JOIN employees e ON e.id = cl.employee_id
       WHERE cl.status = 'AVAILABLE' AND cl.cancelled_at IS NULL`
    ).all<{ id: string; issued_on: string; expires_on: string; used_on: string; full_name: string; employee_number: string }>();

    if (compAvailableWithUsage.results.length > 0) {
      for (const row of compAvailableWithUsage.results) {
        issues.push({
          id: `comp-available-used-${row.id}`,
          category: '대체휴무 관리',
          severity: 'WARNING',
          title: '대체휴무 사용 상태 불일치 (상태 미반영)',
          description: `직원 [${row.full_name} (${row.employee_number})]의 대체휴무가 ${row.used_on}에 사용되었으나 상태가 여전히 AVAILABLE로 남아있습니다.`,
          targetEmployee: `${row.full_name} (${row.employee_number})`,
          actionUrl: '/admin/comp-leave',
        });
      }
    } else {
      passedChecks++;
    }
  } catch (err) {
    issues.push({
      id: 'err-check-comp-available-used',
      category: '대체휴무 관리',
      severity: 'ERROR',
      title: '대체휴무 상태 검사 쿼리 오류',
      description: String(err),
    });
  }

  // ─── 9. 휴일근무 대체휴무 부여 옵션인데 마스터 미연결 ─────────────────────
  totalChecks++;
  try {
    const holidayWithoutComp = await env.DB.prepare(
      `SELECT ot.id, ot.work_date, ot.duration_minutes, e.full_name, e.employee_number
       FROM overtime_works ot
       LEFT JOIN compensatory_leaves cl ON cl.source_overtime_id = ot.id AND cl.cancelled_at IS NULL
       JOIN employees e ON e.id = ot.employee_id
       WHERE ot.work_type = 'HOLIDAY_WORK'
         AND ot.grant_comp_leave = 1
         AND ot.cancelled_at IS NULL
         AND cl.id IS NULL`
    ).all<{ id: string; work_date: string; duration_minutes: number; full_name: string; employee_number: string }>();

    if (holidayWithoutComp.results.length > 0) {
      for (const row of holidayWithoutComp.results) {
        issues.push({
          id: `holiday-comp-missing-${row.id}`,
          category: '연장/휴일근무',
          severity: 'WARNING',
          title: '휴일근무 대체휴무 마스터 누락',
          description: `직원 [${row.full_name} (${row.employee_number})]의 ${row.work_date} 휴일근무가 대체휴무 부여 옵션이나 생성된 대체휴무 레코드가 없습니다.`,
          targetEmployee: `${row.full_name} (${row.employee_number})`,
          targetDate: row.work_date,
          actionUrl: '/admin/overtime',
        });
      }
    } else {
      passedChecks++;
    }
  } catch (err) {
    issues.push({
      id: 'err-check-holiday-comp',
      category: '연장/휴일근무',
      severity: 'ERROR',
      title: '휴일근무 대체휴무 검사 쿼리 오류',
      description: String(err),
    });
  }

  // ─── 10. 출근시간 > 퇴근시간 역전 오류 (동일 날짜 내) ────────────────────
  totalChecks++;
  try {
    const timeInversion = await env.DB.prepare(
      `SELECT a.id, a.work_date, a.check_in_at, a.check_out_at, e.full_name, e.employee_number
       FROM attendance a
       JOIN employees e ON e.id = a.employee_id
       WHERE a.check_in_at IS NOT NULL
         AND a.check_out_at IS NOT NULL
         AND a.check_in_at > a.check_out_at`
    ).all<{ id: string; work_date: string; check_in_at: string; check_out_at: string; full_name: string; employee_number: string }>();

    if (timeInversion.results.length > 0) {
      for (const row of timeInversion.results) {
        issues.push({
          id: `time-inversion-${row.id}`,
          category: '출퇴근 근태',
          severity: 'ERROR',
          title: '출퇴근 시간 역전 오류',
          description: `직원 [${row.full_name} (${row.employee_number})]의 ${row.work_date} 출근시간(${row.check_in_at.slice(11, 16)})이 퇴근시간(${row.check_out_at.slice(11, 16)})보다 늦습니다.`,
          targetEmployee: `${row.full_name} (${row.employee_number})`,
          targetDate: row.work_date,
          actionUrl: `/admin/attendance?date=${row.work_date}`,
        });
      }
    } else {
      passedChecks++;
    }
  } catch (err) {
    issues.push({
      id: 'err-check-time-inversion',
      category: '출퇴근 근태',
      severity: 'ERROR',
      title: '출퇴근 시간 검사 쿼리 오류',
      description: String(err),
    });
  }

  const hasErrors = issues.some((i) => i.severity === 'ERROR');
  const hasWarnings = issues.some((i) => i.severity === 'WARNING');

  return {
    checkedAt,
    totalChecks,
    passedChecks,
    failedChecks: totalChecks - passedChecks,
    hasErrors,
    hasWarnings,
    issues,
  };
}
