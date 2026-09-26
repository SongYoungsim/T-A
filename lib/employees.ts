import { env } from 'cloudflare:workers';
import type { EmployeeRecord, LeavePeriod } from '@/lib/hr-types';

type EmployeeRow = Omit<EmployeeRecord, 'accountEnabled' | 'leavePeriods'> & {
  accountEnabled: number | boolean | null;
};

function normalizeEmployee(row: EmployeeRow): EmployeeRecord {
  return { ...row, accountEnabled: Boolean(row.accountEnabled) };
}

export async function listEmployees(): Promise<EmployeeRecord[]> {
  const result = await env.DB.prepare(
    `SELECT
       e.id,
       e.employee_number AS employeeNumber,
       e.full_name AS fullName,
       e.department,
       e.job_title AS jobTitle,
       e.hired_on AS hiredOn,
       e.employment_status AS employmentStatus,
       e.role,
       e.standard_start_minute AS standardStartMinute,
       e.standard_end_minute AS standardEndMinute,
       e.terminated_on AS terminatedOn,
       COALESCE(ua.login_enabled, 0) AS accountEnabled,
       ua.last_login_at AS lastLoginAt
     FROM employees e
     LEFT JOIN user_accounts ua ON ua.employee_id = e.id
     ORDER BY
       CASE e.employment_status WHEN 'ACTIVE' THEN 0 WHEN 'LEAVE' THEN 1 ELSE 2 END,
       e.employee_number`,
  ).all<EmployeeRow>();

  return result.results.map(normalizeEmployee);
}

export async function getEmployee(id: string): Promise<EmployeeRecord | null> {
  const row = await env.DB.prepare(
    `SELECT
       e.id,
       e.employee_number AS employeeNumber,
       e.full_name AS fullName,
       e.department,
       e.job_title AS jobTitle,
       e.hired_on AS hiredOn,
       e.employment_status AS employmentStatus,
       e.role,
       e.standard_start_minute AS standardStartMinute,
       e.standard_end_minute AS standardEndMinute,
       e.terminated_on AS terminatedOn,
       COALESCE(ua.login_enabled, 0) AS accountEnabled,
       ua.last_login_at AS lastLoginAt
     FROM employees e
     LEFT JOIN user_accounts ua ON ua.employee_id = e.id
     WHERE e.id = ?
     LIMIT 1`,
  )
    .bind(id)
    .first<EmployeeRow>();
  if (!row) return null;

  const periods = await env.DB.prepare(
    `SELECT id, started_on AS startedOn, ended_on AS endedOn, reason
     FROM leave_of_absence_periods
     WHERE employee_id = ?
     ORDER BY started_on DESC`,
  )
    .bind(id)
    .all<LeavePeriod>();

  return { ...normalizeEmployee(row), leavePeriods: periods.results };
}