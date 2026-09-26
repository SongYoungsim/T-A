import type { EmployeeRole, EmploymentStatus } from '@/lib/hr-types';

export type EmployeeInput = {
  employeeNumber: string;
  fullName: string;
  department: string;
  jobTitle: string;
  hiredOn: string;
  employmentStatus: EmploymentStatus;
  role: EmployeeRole;
  standardStartMinute: number;
  standardEndMinute: number;
  accountEnabled: boolean;
  initialPassword?: string;
};

const statuses = new Set<EmploymentStatus>(['ACTIVE', 'LEAVE', 'RESIGNED']);
const roles = new Set<EmployeeRole>(['ADMIN', 'USER']);

function cleanText(value: unknown, maxLength = 100) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function timeToMinute(value: unknown) {
  if (typeof value === 'number' && Number.isInteger(value)) return value;
  if (typeof value !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) {
    return -1;
  }
  const [hour, minute] = value.split(':').map(Number);
  return hour * 60 + minute;
}

export function validateEmployeeInput(
  body: Record<string, unknown>,
): { ok: true; value: EmployeeInput } | { ok: false; error: string } {
  const employeeNumber = cleanText(body.employeeNumber, 20).toUpperCase();
  const fullName = cleanText(body.fullName, 80);
  const department = cleanText(body.department, 80);
  const jobTitle = cleanText(body.jobTitle, 80);
  const hiredOn = cleanText(body.hiredOn, 10);
  const employmentStatus = cleanText(body.employmentStatus) as EmploymentStatus;
  const role = cleanText(body.role) as EmployeeRole;
  const standardStartMinute = timeToMinute(body.standardStartMinute ?? body.standardStartTime);
  const standardEndMinute = timeToMinute(body.standardEndMinute ?? body.standardEndTime);
  const accountEnabled = body.accountEnabled !== false;
  const initialPassword =
    typeof body.initialPassword === 'string' ? body.initialPassword : undefined;

  if (!/^[A-Z0-9_-]{3,20}$/.test(employeeNumber)) {
    return { ok: false, error: '사번은 영문 대문자, 숫자, _, - 조합 3~20자로 입력해주세요.' };
  }
  if (!fullName || !department || !jobTitle) {
    return { ok: false, error: '성명, 부서, 직급은 필수입니다.' };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(hiredOn)) {
    return { ok: false, error: '입사일을 올바르게 입력해주세요.' };
  }
  if (!statuses.has(employmentStatus) || !roles.has(role)) {
    return { ok: false, error: '재직상태 또는 권한 값이 올바르지 않습니다.' };
  }
  if (
    standardStartMinute < 0 ||
    standardEndMinute < 0 ||
    standardEndMinute <= standardStartMinute
  ) {
    return { ok: false, error: '기준 퇴근시간은 출근시간보다 늦어야 합니다.' };
  }

  return {
    ok: true,
    value: {
      employeeNumber,
      fullName,
      department,
      jobTitle,
      hiredOn,
      employmentStatus,
      role,
      standardStartMinute,
      standardEndMinute,
      accountEnabled,
      initialPassword,
    },
  };
}