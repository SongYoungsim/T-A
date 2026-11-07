/**
 * lib/reports.ts — 관리자 통합 근태 리포트, 이상데이터 탐지 및 감사로그 서비스 레이어 (Phase 9)
 *
 * ── 설계 및 운영 원칙 ────────────────────────────────────────────────────────────
 * 1. 통계의 Source of Truth: employees, attendance, leave_usages, compensatory_leaves,
 *    compensatory_leave_usages, overtime_works, work_calendar, leave_of_absence_periods.
 * 2. Phase 1~8의 기존 공통 Business Logic(5분 Grace, 지각·조퇴 세부 플래그, 연차·대체휴무 우선)을 100% 재사용.
 * 3. 시간 표시는 Integer Minutes 기반 "X시간 Y분" 표기 (소수점 시간 기본표시 금지).
 * 4. 연차(일수/시간)와 대체휴무(일수)는 통계에서 절대 단일 휴가값으로 합산하지 않고 완전 분리.
 * 5. 직원 평가/순위 목적 배제, 근태현황 파악·이상데이터 탐지·월말 정산에 집중.
 * 6. 이상데이터 자동 수정 절대 금지 (관리자가 직접 확인 후 원본 화면에서 조치).
 * 7. 감사로그는 읽기 전용, 서버사이드 페이징, 민감정보(비밀번호, 해시, 솔트, 토큰) 완전 마스킹.
 * 8. N+1 쿼리 방지: 월 단위 벌크 조회 후 인메모리 매핑.
 * ─────────────────────────────────────────────────────────────────────────
 */

import * as XLSX from 'xlsx';
import { env } from 'cloudflare:workers';
import { todayKST, calculateAttendanceStatus } from '@/lib/attendance';
import { getEffectiveWorkdaysInRange } from '@/lib/calendar';
import { formatDuration, formatTimeKST } from '@/lib/hr-types';
import type {
  AttendanceAnomaly,
  AttendanceImportBatchRecord,
  AuditLogPaginatedResult,
  AuditLogQueryItem,
  DepartmentMonthlySummary,
  EmployeeDailyDrilldown,
  EmployeeMonthlySummary,
  MonthlyReportKPI,
} from '@/lib/hr-types';

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function getKoreanDayOfWeek(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const day = new Date(Date.UTC(y, m - 1, d, 3, 0, 0)).getUTCDay();
  const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
  return dayNames[day] || '';
}

// ─── 1. 월간 통합 근태 리포트 데이터 생성 ─────────────────────────────────────

export async function getMonthlyAttendanceReport(params: {
  year: number;
  month: number;
  department?: string;
}): Promise<{
  year: number;
  month: number;
  selectedDepartment: string;
  departments: string[];
  kpi: MonthlyReportKPI;
  employeeSummaries: EmployeeMonthlySummary[];
  departmentSummaries: DepartmentMonthlySummary[];
  anomalies: AttendanceAnomaly[];
}> {
  const { year, month, department = 'ALL' } = params;

  // 1. 해당 월 시작일 및 종료일 계산
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const startDate = `${year}-${pad(month)}-01`;
  const endDate = `${year}-${pad(month)}-${pad(lastDay)}`;
  const today = todayKST();

  // 2. 월간 근무일 캘린더 전체 조회 (벌크 1회)
  const calendarMap = await getEffectiveWorkdaysInRange(startDate, endDate);

  // 3. 전직원 조회 (퇴사자 포함: 해당 월에 근무 가능했던 자)
  // 입사일이 월말 이전이고, 퇴사일이 없거나 월초 이후인 직원 대상
  const empRows = await env.DB.prepare(
    `SELECT id, employee_number AS employeeNumber, full_name AS fullName,
            department, job_title AS jobTitle, hired_on AS hiredOn,
            COALESCE(resignation_date, terminated_on) AS resignationDate,
            employment_status AS employmentStatus,
            standard_start_minute AS standardStartMinute,
            standard_end_minute AS standardEndMinute
     FROM employees
     WHERE hired_on <= ? AND (COALESCE(resignation_date, terminated_on) IS NULL OR COALESCE(resignation_date, terminated_on) >= ?)
     ORDER BY department ASC, employee_number ASC`
  )
    .bind(endDate, startDate)
    .all<{
      id: string;
      employeeNumber: string;
      fullName: string;
      department: string;
      jobTitle: string;
      hiredOn: string;
      resignationDate: string | null;
      employmentStatus: string;
      standardStartMinute: number;
      standardEndMinute: number;
    }>();

  // 고유 부서 목록
  const allDepartments = Array.from(new Set(empRows.results.map((e) => e.department))).filter(Boolean);

  // 부서 필터링
  const targetEmployees = department === 'ALL'
    ? empRows.results
    : empRows.results.filter((e) => e.department === department);

  const targetEmpIds = targetEmployees.map((e) => e.id);
  const targetEmpIdSet = new Set(targetEmpIds);

  // 4. 휴직 기간 조회 (벌크 1회)
  const loaRows = await env.DB.prepare(
    `SELECT employee_id AS employeeId, started_on AS startedOn, ended_on AS endedOn
     FROM leave_of_absence_periods
     WHERE started_on <= ? AND (ended_on IS NULL OR ended_on >= ?)`
  )
    .bind(endDate, startDate)
    .all<{ employeeId: string; startedOn: string; endedOn: string | null }>();

  // 5. 근태 기록 조회 (해당 월 전체, 벌크 1회)
  const attRows = await env.DB.prepare(
    `SELECT id, employee_id AS employeeId, work_date AS workDate,
            check_in_at AS checkInAt, check_out_at AS checkOutAt, source,
            representative_status AS representativeStatus,
            is_late AS isLate, is_early_leave AS isEarlyLeave
     FROM attendance
     WHERE work_date >= ? AND work_date <= ?`
  )
    .bind(startDate, endDate)
    .all<{
      id: string;
      employeeId: string;
      workDate: string;
      checkInAt: string | null;
      checkOutAt: string | null;
      source: string | null;
      representativeStatus: string | null;
      isLate: number;
      isEarlyLeave: number;
    }>();

  // 6. 연차 사용 기록 조회 (취소되지 않은 건, 벌크 1회)
  const leaveRows = await env.DB.prepare(
    `SELECT employee_id AS employeeId, leave_date AS leaveDate, leave_type AS leaveType, minutes
     FROM leave_usages
     WHERE leave_date >= ? AND leave_date <= ? AND cancelled_at IS NULL`
  )
    .bind(startDate, endDate)
    .all<{ employeeId: string; leaveDate: string; leaveType: string; minutes: number }>();

  // 7. 대체휴무 사용 기록 조회 (해당 월, 벌크 1회)
  const compUsageRows = await env.DB.prepare(
    `SELECT employee_id AS employeeId, used_on AS usedOn
     FROM compensatory_leave_usages
     WHERE used_on >= ? AND used_on <= ?`
  )
    .bind(startDate, endDate)
    .all<{ employeeId: string; usedOn: string }>();

  // 8. 연장/휴일근무 조회 (취소되지 않은 건, 벌크 1회)
  const otRows = await env.DB.prepare(
    `SELECT id, employee_id AS employeeId, work_date AS workDate,
            work_type AS workType, duration_minutes AS durationMinutes, grant_comp_leave AS grantCompLeave
     FROM overtime_works
     WHERE work_date >= ? AND work_date <= ? AND cancelled_at IS NULL`
  )
    .bind(startDate, endDate)
    .all<{
      id: string;
      employeeId: string;
      workDate: string;
      workType: 'OVERTIME' | 'HOLIDAY_WORK';
      durationMinutes: number;
      grantCompLeave: number;
    }>();

  // 9. 30일 이내 만료 예정 대체휴무 조회 (이상데이터 안내용)
  const expiringCompLeaves = await env.DB.prepare(
    `SELECT cl.id, cl.employee_id AS employeeId, e.employee_number AS employeeNumber,
            e.full_name AS fullName, e.department, cl.expires_on AS expiresOn, cl.issued_on AS issuedOn
     FROM compensatory_leaves cl
     JOIN employees e ON e.id = cl.employee_id
     LEFT JOIN compensatory_leave_usages clu ON clu.compensatory_leave_id = cl.id
     WHERE cl.cancelled_at IS NULL AND cl.status = 'AVAILABLE' AND clu.id IS NULL
       AND cl.expires_on >= ? AND cl.expires_on <= date(?, '+30 days')`
  )
    .bind(today, today)
    .all<{
      id: string;
      employeeId: string;
      employeeNumber: string;
      fullName: string;
      department: string;
      expiresOn: string;
      issuedOn: string;
    }>();

  // ─── 인메모리 색인 매핑 ─────────────────────────────────────────────────────

  // 근태 Map: `${empId}__${date}` -> attendance
  const attMap = new Map<string, (typeof attRows.results)[number]>();
  for (const a of attRows.results) {
    if (targetEmpIdSet.has(a.employeeId)) {
      attMap.set(`${a.employeeId}__${a.workDate}`, a);
    }
  }

  // 연차 Map: `${empId}__${date}` -> leave
  const leaveMap = new Map<string, (typeof leaveRows.results)[number]>();
  for (const l of leaveRows.results) {
    if (targetEmpIdSet.has(l.employeeId)) {
      leaveMap.set(`${l.employeeId}__${l.leaveDate}`, l);
    }
  }

  // 대체휴무 사용 Set: `${empId}__${date}`
  const compUsageSet = new Set<string>();
  for (const cu of compUsageRows.results) {
    if (targetEmpIdSet.has(cu.employeeId)) {
      compUsageSet.add(`${cu.employeeId}__${cu.usedOn}`);
    }
  }

  // 연장/휴일근무 Map: `${empId}__${date}` -> array
  const otMap = new Map<string, (typeof otRows.results)[number][]>();
  for (const ot of otRows.results) {
    if (targetEmpIdSet.has(ot.employeeId)) {
      const key = `${ot.employeeId}__${ot.workDate}`;
      const list = otMap.get(key) || [];
      list.push(ot);
      otMap.set(key, list);
    }
  }

  // 휴직 기간 Map: empId -> array of { startedOn, endedOn }
  const loaMap = new Map<string, { startedOn: string; endedOn: string | null }[]>();
  for (const loa of loaRows.results) {
    const list = loaMap.get(loa.employeeId) || [];
    list.push(loa);
    loaMap.set(loa.employeeId, list);
  }

  // ─── 이상데이터 탐지 목록 ───────────────────────────────────────────────────
  const anomalies: AttendanceAnomaly[] = [];

  // 1) 30일 이내 만료 예정 대체휴무 (INFO/WARNING)
  for (const ecl of expiringCompLeaves.results) {
    if (department === 'ALL' || ecl.department === department) {
      anomalies.push({
        id: `anom_comp_exp_${ecl.id}`,
        severity: 'WARNING',
        employeeId: ecl.employeeId,
        employeeNumber: ecl.employeeNumber,
        fullName: ecl.fullName,
        department: ecl.department,
        date: ecl.expiresOn,
        category: 'EXPIRING_COMP_LEAVE',
        message: `대체휴무 1일이 ${ecl.expiresOn}에 만료 예정입니다 (발행일: ${ecl.issuedOn}).`,
        linkUrl: `/admin/comp-leave`,
      });
    }
  }

  // ─── 직원별 집계 및 날짜별 순회 ─────────────────────────────────────────────

  // 월의 모든 날짜 리스트 생성
  const monthDates: string[] = [];
  for (let d = 1; d <= lastDay; d++) {
    monthDates.push(`${year}-${pad(month)}-${pad(d)}`);
  }

  // 회사 전체 기준 정상 근무일수 (주말/공휴일 제외, 대체근무일 포함)
  let totalCompanyTargetWorkdays = 0;
  for (const d of monthDates) {
    const cal = calendarMap.get(d);
    if (cal && cal.isWorkday) {
      totalCompanyTargetWorkdays++;
    }
  }

  const employeeSummaries: EmployeeMonthlySummary[] = [];

  for (const emp of targetEmployees) {
    let targetWorkdays = 0;
    let normalDays = 0;
    let lateCount = 0;
    let earlyLeaveCount = 0;
    let absentDays = 0;
    let leaveMinutes = 0;
    let compLeaveUsedDays = 0;
    let overtimeMinutes = 0;
    let holidayWorkMinutes = 0;

    const empLoas = loaMap.get(emp.id) || [];

    for (const d of monthDates) {
      const cal = calendarMap.get(d);
      const isCalendarWorkday = cal?.isWorkday ?? true;

      // 직원 입사 전 / 퇴사 후 / 휴직 여부 확인
      const isBeforeHire = d < emp.hiredOn;
      const isAfterResign = Boolean(emp.resignationDate && d > emp.resignationDate);
      const isLoaDay = empLoas.some((l) => d >= l.startedOn && (!l.endedOn || d <= l.endedOn));

      const isEmployeeWorkduty = isCalendarWorkday && !isBeforeHire && !isAfterResign && !isLoaDay;
      if (isEmployeeWorkduty) {
        targetWorkdays++;
      }

      const att = attMap.get(`${emp.id}__${d}`);
      const leave = leaveMap.get(`${emp.id}__${d}`);
      const isCompUsed = compUsageSet.has(`${emp.id}__${d}`);
      const ots = otMap.get(`${emp.id}__${d}`) || [];

      // 연장 / 휴일근무 시간 합산
      for (const ot of ots) {
        if (ot.workType === 'OVERTIME') {
          overtimeMinutes += ot.durationMinutes;
        } else if (ot.workType === 'HOLIDAY_WORK') {
          holidayWorkMinutes += ot.durationMinutes;
        }
      }

      // 연차 사용 합산
      if (leave) {
        leaveMinutes += leave.minutes;
      }

      // 대체휴무 사용 합산
      if (isCompUsed) {
        compLeaveUsedDays += 1;
      }

      // 근태 출퇴근 기반 집계
      if (att && att.checkInAt) {
        // 출퇴근이 존재하는 경우
        if (att.isLate) lateCount++;
        if (att.isEarlyLeave) earlyLeaveCount++;

        // 정상 근무일 카운트: 연차나 대체휴무가 아니고 지각/조퇴가 없는 경우
        if (!leave && !isCompUsed && !att.isLate && !att.isEarlyLeave && isEmployeeWorkduty) {
          normalDays++;
        }
      } else if (isEmployeeWorkduty && d <= today && !leave && !isCompUsed) {
        // 근무일인데 오늘 이전/당일이며 출근기록 및 연차/대체휴무가 없으면 결근
        absentDays++;
      }

      // ── 이상데이터 탐지 규칙 (Req 18) ──────────────────────────────────
      if (att) {
        // 1) 출근은 있으나 퇴근 없음 (과거 일자)
        if (att.checkInAt && !att.checkOutAt && d < today) {
          anomalies.push({
            id: `anom_no_out_${att.id}`,
            severity: 'WARNING',
            employeeId: emp.id,
            employeeNumber: emp.employeeNumber,
            fullName: emp.fullName,
            department: emp.department,
            date: d,
            category: 'CHECK_OUT_MISSING',
            message: `${d}: 출근기록(${formatTimeKST(att.checkInAt)})은 있으나 퇴근기록이 누락되었습니다.`,
            linkUrl: `/admin/attendance?date=${d}`,
          });
        }

        // 2) 퇴근만 존재하는 비정상 Attendance (ERROR)
        if (!att.checkInAt && att.checkOutAt) {
          anomalies.push({
            id: `anom_no_in_${att.id}`,
            severity: 'ERROR',
            employeeId: emp.id,
            employeeNumber: emp.employeeNumber,
            fullName: emp.fullName,
            department: emp.department,
            date: d,
            category: 'CHECK_IN_MISSING',
            message: `${d}: 출근기록 없이 퇴근기록(${formatTimeKST(att.checkOutAt)})만 존재합니다.`,
            linkUrl: `/admin/attendance?date=${d}`,
          });
        }

        // 3) 연차일에 출퇴근기록 존재 (WARNING)
        if (leave && (att.checkInAt || att.checkOutAt)) {
          anomalies.push({
            id: `anom_leave_att_${att.id}`,
            severity: 'WARNING',
            employeeId: emp.id,
            employeeNumber: emp.employeeNumber,
            fullName: emp.fullName,
            department: emp.department,
            date: d,
            category: 'ATTENDANCE_ON_LEAVE',
            message: `${d}: 연차(${leave.leaveType}) 등록일에 실제 출퇴근 기록이 존재합니다.`,
            linkUrl: `/admin/attendance?date=${d}`,
          });
        }

        // 4) 대체휴무일에 출퇴근기록 존재 (WARNING)
        if (isCompUsed && (att.checkInAt || att.checkOutAt)) {
          anomalies.push({
            id: `anom_comp_att_${att.id}`,
            severity: 'WARNING',
            employeeId: emp.id,
            employeeNumber: emp.employeeNumber,
            fullName: emp.fullName,
            department: emp.department,
            date: d,
            category: 'ATTENDANCE_ON_COMP_LEAVE',
            message: `${d}: 대체휴무 사용일에 실제 출퇴근 기록이 존재합니다.`,
            linkUrl: `/admin/attendance?date=${d}`,
          });
        }

        // 6) 휴일에 출퇴근기록은 있으나 공식 HOLIDAY_WORK 없음 (WARNING)
        if (!isCalendarWorkday && (att.checkInAt || att.checkOutAt) && ots.length === 0) {
          anomalies.push({
            id: `anom_hol_no_work_${att.id}`,
            severity: 'WARNING',
            employeeId: emp.id,
            employeeNumber: emp.employeeNumber,
            fullName: emp.fullName,
            department: emp.department,
            date: d,
            category: 'HOLIDAY_ATTENDANCE_WITHOUT_WORK',
            message: `${d}: 휴일에 출퇴근 기록이 있으나 관리자 휴일근무(Holiday Work) 승인 기록이 없습니다.`,
            linkUrl: `/admin/overtime?year=${year}&month=${month}`,
          });
        }

        // 8) 입사일 이전 또는 퇴사일 이후 출퇴근 기록 (ERROR)
        if (isBeforeHire || isAfterResign) {
          anomalies.push({
            id: `anom_bound_${att.id}`,
            severity: 'ERROR',
            employeeId: emp.id,
            employeeNumber: emp.employeeNumber,
            fullName: emp.fullName,
            department: emp.department,
            date: d,
            category: 'DATE_OUT_OF_BOUNDS',
            message: `${d}: 직원 ${isBeforeHire ? '입사일 이전' : '퇴사일 이후'}의 출퇴근 기록입니다.`,
            linkUrl: `/admin/attendance?date=${d}`,
          });
        }
      }

      // 5) 평일연장 등록은 있으나 실제 출퇴근 기록 없음 (WARNING)
      const hasWeekdayOt = ots.some((ot) => ot.workType === 'OVERTIME');
      if (hasWeekdayOt && (!att || !att.checkInAt)) {
        anomalies.push({
          id: `anom_ot_no_att_${emp.id}_${d}`,
          severity: 'WARNING',
          employeeId: emp.id,
          employeeNumber: emp.employeeNumber,
          fullName: emp.fullName,
          department: emp.department,
          date: d,
          category: 'OVERTIME_WITHOUT_ATTENDANCE',
          message: `${d}: 평일 연장근무가 등록되어 있으나 출퇴근 기록이 없습니다.`,
          linkUrl: `/admin/overtime?year=${year}&month=${month}`,
        });
      }
    }

    const leaveDays = leaveMinutes / 480;

    employeeSummaries.push({
      employeeId: emp.id,
      employeeNumber: emp.employeeNumber,
      fullName: emp.fullName,
      department: emp.department,
      jobTitle: emp.jobTitle,
      targetWorkdays,
      normalDays,
      lateCount,
      earlyLeaveCount,
      absentDays,
      leaveMinutes,
      leaveDays,
      compLeaveUsedDays,
      overtimeMinutes,
      holidayWorkMinutes,
    });
  }

  // ─── 부서별 집계 ────────────────────────────────────────────────────────────
  const deptMap = new Map<string, DepartmentMonthlySummary>();

  for (const es of employeeSummaries) {
    const existing = deptMap.get(es.department) || {
      department: es.department,
      employeeCount: 0,
      targetWorkdays: 0,
      normalDays: 0,
      lateCount: 0,
      earlyLeaveCount: 0,
      absentDays: 0,
      leaveDays: 0,
      compLeaveUsedDays: 0,
      overtimeMinutes: 0,
      holidayWorkMinutes: 0,
    };

    existing.employeeCount += 1;
    existing.targetWorkdays += es.targetWorkdays;
    existing.normalDays += es.normalDays;
    existing.lateCount += es.lateCount;
    existing.earlyLeaveCount += es.earlyLeaveCount;
    existing.absentDays += es.absentDays;
    existing.leaveDays += es.leaveDays;
    existing.compLeaveUsedDays += es.compLeaveUsedDays;
    existing.overtimeMinutes += es.overtimeMinutes;
    existing.holidayWorkMinutes += es.holidayWorkMinutes;

    deptMap.set(es.department, existing);
  }

  const departmentSummaries = Array.from(deptMap.values()).sort((a, b) =>
    a.department.localeCompare(b.department)
  );

  // ─── 전체 월간 핵심 KPI 집계 ────────────────────────────────────────────────
  let totalNormalDays = 0;
  let totalLateCount = 0;
  let totalEarlyLeaveCount = 0;
  let totalAbsentCount = 0;
  let totalLeaveMinutes = 0;
  let totalCompLeaveUsedDays = 0;
  let totalOvertimeMinutes = 0;
  let totalHolidayWorkMinutes = 0;

  for (const es of employeeSummaries) {
    totalNormalDays += es.normalDays;
    totalLateCount += es.lateCount;
    totalEarlyLeaveCount += es.earlyLeaveCount;
    totalAbsentCount += es.absentDays;
    totalLeaveMinutes += es.leaveMinutes;
    totalCompLeaveUsedDays += es.compLeaveUsedDays;
    totalOvertimeMinutes += es.overtimeMinutes;
    totalHolidayWorkMinutes += es.holidayWorkMinutes;
  }

  const kpi: MonthlyReportKPI = {
    activeEmployees: targetEmployees.length,
    totalTargetWorkdays: totalCompanyTargetWorkdays,
    normalDaysCount: totalNormalDays,
    lateCount: totalLateCount,
    earlyLeaveCount: totalEarlyLeaveCount,
    absentCount: totalAbsentCount,
    leaveMinutes: totalLeaveMinutes,
    leaveDays: totalLeaveMinutes / 480,
    overtimeMinutes: totalOvertimeMinutes,
    holidayWorkMinutes: totalHolidayWorkMinutes,
    compLeaveUsedDays: totalCompLeaveUsedDays,
  };

  return {
    year,
    month,
    selectedDepartment: department,
    departments: allDepartments,
    kpi,
    employeeSummaries,
    departmentSummaries,
    anomalies,
  };
}

// ─── 2. 특정 직원의 월간 일별 Drill-down 상세 조회 ───────────────────────────

export async function getEmployeeMonthlyDrilldown(params: {
  employeeId: string;
  year: number;
  month: number;
}): Promise<{
  employee: {
    id: string;
    employeeNumber: string;
    fullName: string;
    department: string;
    jobTitle: string;
    standardStartMinute: number;
    standardEndMinute: number;
  };
  days: EmployeeDailyDrilldown[];
}> {
  const { employeeId, year, month } = params;

  // 1. 직원 정보
  const emp = await env.DB.prepare(
    `SELECT id, employee_number AS employeeNumber, full_name AS fullName,
            department, job_title AS jobTitle,
            standard_start_minute AS standardStartMinute,
            standard_end_minute AS standardEndMinute
     FROM employees WHERE id = ? LIMIT 1`
  )
    .bind(employeeId)
    .first<{
      id: string;
      employeeNumber: string;
      fullName: string;
      department: string;
      jobTitle: string;
      standardStartMinute: number;
      standardEndMinute: number;
    }>();

  if (!emp) {
    throw new Error('직원 정보를 찾을 수 없습니다.');
  }

  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const startDate = `${year}-${pad(month)}-01`;
  const endDate = `${year}-${pad(month)}-${pad(lastDay)}`;

  // 2. 캘린더, 근태, 연차, 대체휴무, 연장근무 동시 조회
  const [calendarMap, attRows, leaveRows, compRows, otRows] = await Promise.all([
    getEffectiveWorkdaysInRange(startDate, endDate),
    env.DB.prepare(
      `SELECT work_date AS workDate, check_in_at AS checkInAt, check_out_at AS checkOutAt,
              representative_status AS representativeStatus, is_late AS isLate,
              is_early_leave AS isEarlyLeave, source
       FROM attendance
       WHERE employee_id = ? AND work_date >= ? AND work_date <= ?`
    ).bind(employeeId, startDate, endDate).all<{
      workDate: string;
      checkInAt: string | null;
      checkOutAt: string | null;
      representativeStatus: string | null;
      isLate: number;
      isEarlyLeave: number;
      source: string | null;
    }>(),
    env.DB.prepare(
      `SELECT leave_date AS leaveDate, leave_type AS leaveType, minutes
       FROM leave_usages
       WHERE employee_id = ? AND leave_date >= ? AND leave_date <= ? AND cancelled_at IS NULL`
    ).bind(employeeId, startDate, endDate).all<{
      leaveDate: string;
      leaveType: string;
      minutes: number;
    }>(),
    env.DB.prepare(
      `SELECT used_on AS usedOn
       FROM compensatory_leave_usages
       WHERE employee_id = ? AND used_on >= ? AND used_on <= ?`
    ).bind(employeeId, startDate, endDate).all<{ usedOn: string }>(),
    env.DB.prepare(
      `SELECT work_date AS workDate, work_type AS workType, duration_minutes AS durationMinutes
       FROM overtime_works
       WHERE employee_id = ? AND work_date >= ? AND work_date <= ? AND cancelled_at IS NULL`
    ).bind(employeeId, startDate, endDate).all<{
      workDate: string;
      workType: string;
      durationMinutes: number;
    }>(),
  ]);

  const attMap = new Map(attRows.results.map((r) => [r.workDate, r]));
  const leaveMap = new Map(leaveRows.results.map((r) => [r.leaveDate, r]));
  const compSet = new Set(compRows.results.map((r) => r.usedOn));

  const otMap = new Map<string, { overtime: number; holiday: number }>();
  for (const ot of otRows.results) {
    const cur = otMap.get(ot.workDate) || { overtime: 0, holiday: 0 };
    if (ot.workType === 'OVERTIME') cur.overtime += ot.durationMinutes;
    else if (ot.workType === 'HOLIDAY_WORK') cur.holiday += ot.durationMinutes;
    otMap.set(ot.workDate, cur);
  }

  const startH = Math.floor(emp.standardStartMinute / 60);
  const startM = emp.standardStartMinute % 60;
  const endH = Math.floor(emp.standardEndMinute / 60);
  const endM = emp.standardEndMinute % 60;
  const standardStartStr = `${pad(startH)}:${pad(startM)}`;
  const standardEndStr = `${pad(endH)}:${pad(endM)}`;

  const days: EmployeeDailyDrilldown[] = [];

  for (let d = 1; d <= lastDay; d++) {
    const dateStr = `${year}-${pad(month)}-${pad(d)}`;
    const cal = calendarMap.get(dateStr);
    const dayOfWeek = getKoreanDayOfWeek(dateStr);
    const att = attMap.get(dateStr);
    const leave = leaveMap.get(dateStr);
    const isCompUsed = compSet.has(dateStr);
    const ot = otMap.get(dateStr) || { overtime: 0, holiday: 0 };

    days.push({
      date: dateStr,
      dayOfWeek,
      isWorkday: cal?.isWorkday ?? true,
      dayTypeName: cal?.name || (cal?.isWorkday ? '일반근무일' : '휴일'),
      standardStart: standardStartStr,
      standardEnd: standardEndStr,
      checkInAt: att?.checkInAt ? formatTimeKST(att.checkInAt) : null,
      checkOutAt: att?.checkOutAt ? formatTimeKST(att.checkOutAt) : null,
      representativeStatus: (att?.representativeStatus as any) || (leave?.leaveType as any) || (isCompUsed ? 'COMPENSATORY_LEAVE' : null),
      isLate: Boolean(att?.isLate),
      isEarlyLeave: Boolean(att?.isEarlyLeave),
      leaveType: (leave?.leaveType as any) || null,
      isCompLeaveUsed: isCompUsed,
      overtimeMinutes: ot.overtime,
      holidayWorkMinutes: ot.holiday,
      source: att?.source || null,
    });
  }

  return { employee: emp, days };
}

// ─── 3. 월간 근태 리포트 다중 시트 Excel 생성 (Req 32 ~ 36) ───────────────────

export function generateMonthlyReportExcel(data: {
  year: number;
  month: number;
  kpi: MonthlyReportKPI;
  employeeSummaries: EmployeeMonthlySummary[];
  departmentSummaries: DepartmentMonthlySummary[];
}): Uint8Array {
  const wb = XLSX.utils.book_new();
  const { year, month, kpi, employeeSummaries, departmentSummaries } = data;

  // ── Sheet 1: 월간요약 ──────────────────────────────────────────────────────
  const s1Data: (string | number)[][] = [
    ['월간 근태 리포트 요약'],
    [`조회 기간: ${year}년 ${month}월`],
    [],
    ['항목', '값', '단위', '비고'],
    ['근무대상 인원', kpi.activeEmployees, '명', '해당 월 재직자 기준'],
    ['정상 근무일수', kpi.totalTargetWorkdays, '일', '캘린더 기준 일반/대체근무일'],
    ['정상 출근 일수 총합', kpi.normalDaysCount, '일', '지각/조퇴 없는 정상 근무'],
    ['지각 건수', kpi.lateCount, '회', '5분 Grace 초과'],
    ['조퇴 건수', kpi.earlyLeaveCount, '회', '5분 Grace 미만'],
    ['결근 건수', kpi.absentCount, '일', '미출근 및 휴가 미등록'],
    ['연차 사용량', `${kpi.leaveDays}일 (${kpi.leaveMinutes / 60}시간)`, '', '1일 = 8시간 기준'],
    ['대체휴무 사용량', `${kpi.compLeaveUsedDays}일`, '', '1일 단위 사용'],
    ['평일 연장근무시간', formatDuration(kpi.overtimeMinutes), '', `총 ${kpi.overtimeMinutes}분`],
    ['휴일근무시간', formatDuration(kpi.holidayWorkMinutes), '', `총 ${kpi.holidayWorkMinutes}분`],
  ];
  const ws1 = XLSX.utils.aoa_to_sheet(s1Data);
  ws1['!cols'] = [{ wch: 22 }, { wch: 18 }, { wch: 10 }, { wch: 28 }];
  XLSX.utils.book_append_sheet(wb, ws1, '월간요약');

  // ── Sheet 2: 직원별근태 ────────────────────────────────────────────────────
  const s2Headers = [
    '사번', '성명', '부서', '직급', '근무대상일',
    '정상', '지각', '조퇴', '결근', '연차사용',
    '대체휴무', '평일연장', '휴일근무',
  ];
  const s2Data: (string | number)[][] = [
    [`직원별 근태 요약 (${year}년 ${month}월)`],
    s2Headers,
  ];

  for (const e of employeeSummaries) {
    s2Data.push([
      e.employeeNumber,
      e.fullName,
      e.department,
      e.jobTitle,
      `${e.targetWorkdays}일`,
      `${e.normalDays}일`,
      `${e.lateCount}회`,
      `${e.earlyLeaveCount}회`,
      `${e.absentDays}일`,
      `${e.leaveDays}일 (${e.leaveMinutes / 60}h)`,
      `${e.compLeaveUsedDays}일`,
      formatDuration(e.overtimeMinutes),
      formatDuration(e.holidayWorkMinutes),
    ]);
  }
  const ws2 = XLSX.utils.aoa_to_sheet(s2Data);
  ws2['!cols'] = [
    { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 12 }, { wch: 12 },
    { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 16 },
    { wch: 12 }, { wch: 16 }, { wch: 16 },
  ];
  XLSX.utils.book_append_sheet(wb, ws2, '직원별근태');

  // ── Sheet 3: 부서별요약 ────────────────────────────────────────────────────
  const s3Headers = [
    '부서명', '인원', '총 근무대상일', '정상일',
    '지각', '조퇴', '결근', '연차사용',
    '대체휴무', '평일연장', '휴일근무',
  ];
  const s3Data: (string | number)[][] = [
    [`부서별 근태 요약 (${year}년 ${month}월)`],
    s3Headers,
  ];
  for (const d of departmentSummaries) {
    s3Data.push([
      d.department,
      `${d.employeeCount}명`,
      `${d.targetWorkdays}일`,
      `${d.normalDays}일`,
      `${d.lateCount}회`,
      `${d.earlyLeaveCount}회`,
      `${d.absentDays}일`,
      `${d.leaveDays}일`,
      `${d.compLeaveUsedDays}일`,
      formatDuration(d.overtimeMinutes),
      formatDuration(d.holidayWorkMinutes),
    ]);
  }
  const ws3 = XLSX.utils.aoa_to_sheet(s3Data);
  ws3['!cols'] = [
    { wch: 16 }, { wch: 10 }, { wch: 14 }, { wch: 10 },
    { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 12 },
    { wch: 12 }, { wch: 16 }, { wch: 16 },
  ];
  XLSX.utils.book_append_sheet(wb, ws3, '부서별요약');

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  return new Uint8Array(buf);
}

// ─── 4. 전체 Audit Log 통합 조회 및 페이징 (Req 22 ~ 28, 48) ──────────────────

const FEATURE_LABEL_MAP: Record<string, string> = {
  ATTENDANCE: '근태관리',
  ANNUAL_LEAVE_MASTER: '연차마스터',
  LEAVE_USAGE: '연차사용',
  OVERTIME_WORK: '연장·휴일근무',
  COMPENSATORY_LEAVE: '대체휴무',
  COMPENSATORY_LEAVE_USAGE: '대체휴무사용',
  EMPLOYEE: '사원관리',
  USER_ACCOUNT: '계정관리',
  WORK_CALENDAR: '근무일캘린더',
  ATTENDANCE_EXCEL_IMPORT: 'Excel가져오기',
};

const ACTION_LABEL_MAP: Record<string, string> = {
  CREATE: '신규등록',
  UPDATE: '정보수정',
  DELETE: '취소/삭제',
  LOGIN: '로그인',
};

/**
 * 민감정보(비밀번호, 솔트, 토큰, 해시) 완전 마스킹 헬퍼
 */
function sanitizeJsonString(rawJson: string | null): { sanitized: string | null; summary: string | null } {
  if (!rawJson) return { sanitized: null, summary: null };

  try {
    const obj = JSON.parse(rawJson);

    // 민감정보 제거
    const sensitiveKeys = ['password', 'passwordHash', 'passwordSalt', 'passwordIterations', 'tokenHash', 'secret'];
    for (const k of sensitiveKeys) {
      if (k in obj) {
        obj[k] = '[MASKED]';
      }
    }

    // 사람이 읽기 쉬운 요약문 생성
    const parts: string[] = [];
    if (obj.checkInAt !== undefined) parts.push(`출근: ${obj.checkInAt ? formatTimeKST(obj.checkInAt) : '없음'}`);
    if (obj.checkOutAt !== undefined) parts.push(`퇴근: ${obj.checkOutAt ? formatTimeKST(obj.checkOutAt) : '없음'}`);
    if (obj.representativeStatus) parts.push(`상태: ${obj.representativeStatus}`);
    if (obj.startedAt && obj.endedAt) parts.push(`시간: ${obj.startedAt}~${obj.endedAt}`);
    if (obj.durationMinutes) parts.push(`근무: ${obj.durationMinutes}분`);
    if (obj.workType) parts.push(`구분: ${obj.workType === 'OVERTIME' ? '평일연장' : '휴일근무'}`);
    if (obj.leaveType) parts.push(`연차: ${obj.leaveType}`);
    if (obj.minutes) parts.push(`시간: ${obj.minutes}분`);
    if (obj.fileName) parts.push(`파일: ${obj.fileName}`);
    if (obj.totalRows) parts.push(`총 ${obj.totalRows}행`);

    const summary = parts.length > 0 ? parts.join(' · ') : null;
    return { sanitized: JSON.stringify(obj, null, 2), summary };
  } catch {
    return { sanitized: rawJson, summary: null };
  }
}

export async function listAuditLogsPaginated(params: {
  startDate?: string;
  endDate?: string;
  feature?: string;
  action?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}): Promise<AuditLogPaginatedResult> {
  const {
    startDate,
    endDate,
    feature,
    action,
    search,
    page = 1,
    pageSize = 30,
  } = params;

  let whereClauses: string[] = ['1=1'];
  const binds: unknown[] = [];

  if (startDate) {
    whereClauses.push('al.created_at >= ?');
    binds.push(`${startDate}T00:00:00.000Z`);
  }
  if (endDate) {
    whereClauses.push('al.created_at <= ?');
    binds.push(`${endDate}T23:59:59.999Z`);
  }
  if (feature && feature !== 'ALL') {
    whereClauses.push('al.entity_type = ?');
    binds.push(feature);
  }
  if (action && action !== 'ALL') {
    whereClauses.push('al.action = ?');
    binds.push(action);
  }
  if (search?.trim()) {
    const q = `%${search.trim()}%`;
    whereClauses.push(
      '(actor.full_name LIKE ? OR actor.employee_number LIKE ? OR target.full_name LIKE ? OR target.employee_number LIKE ? OR al.reason LIKE ?)'
    );
    binds.push(q, q, q, q, q);
  }

  const whereSql = whereClauses.join(' AND ');

  // 1. 총 건수 조회
  const countRow = await env.DB.prepare(
    `SELECT COUNT(*) AS total
     FROM audit_logs al
     LEFT JOIN employees actor ON actor.id = al.actor_employee_id
     LEFT JOIN employees target ON target.id = al.target_employee_id
     WHERE ${whereSql}`
  )
    .bind(...binds)
    .first<{ total: number }>();

  const totalCount = countRow?.total ?? 0;
  const totalPages = Math.ceil(totalCount / pageSize) || 1;
  const validPage = Math.min(Math.max(1, page), totalPages);
  const offset = (validPage - 1) * pageSize;

  // 2. 페이지네이션 레코드 조회
  const rows = await env.DB.prepare(
    `SELECT
       al.id, al.created_at AS createdAt, al.entity_type AS entityType,
       al.action, al.target_date AS targetDate, al.before_json AS beforeJson,
       al.after_json AS afterJson, al.reason,
       actor.full_name AS actorName, actor.employee_number AS actorEmployeeNumber,
       target.full_name AS targetEmployeeName, target.employee_number AS targetEmployeeNumber
     FROM audit_logs al
     LEFT JOIN employees actor ON actor.id = al.actor_employee_id
     LEFT JOIN employees target ON target.id = al.target_employee_id
     WHERE ${whereSql}
     ORDER BY al.created_at DESC
     LIMIT ? OFFSET ?`
  )
    .bind(...binds, pageSize, offset)
    .all<{
      id: string;
      createdAt: string;
      entityType: string;
      action: string;
      targetDate: string | null;
      beforeJson: string | null;
      afterJson: string | null;
      reason: string | null;
      actorName: string | null;
      actorEmployeeNumber: string | null;
      targetEmployeeName: string | null;
      targetEmployeeNumber: string | null;
    }>();

  const logs: AuditLogQueryItem[] = rows.results.map((r) => {
    const before = sanitizeJsonString(r.beforeJson);
    const after = sanitizeJsonString(r.afterJson);

    return {
      id: r.id,
      createdAt: r.createdAt,
      actorName: r.actorName || '시스템 관리자',
      actorEmployeeNumber: r.actorEmployeeNumber,
      feature: FEATURE_LABEL_MAP[r.entityType] || r.entityType,
      action: r.action,
      actionLabel: ACTION_LABEL_MAP[r.action] || r.action,
      targetEmployeeName: r.targetEmployeeName,
      targetEmployeeNumber: r.targetEmployeeNumber,
      targetDate: r.targetDate,
      beforeSummary: before.summary,
      afterSummary: after.summary,
      beforeJson: before.sanitized,
      afterJson: after.sanitized,
      reason: r.reason,
    };
  });

  return {
    logs,
    totalCount,
    page: validPage,
    pageSize,
    totalPages,
  };
}
