import { env } from 'cloudflare:workers';
import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getEmployee } from '@/lib/employees';
import { validateEmployeeInput } from '@/lib/employee-validation';

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  const actor = await getCurrentUser();
  if (actor?.role !== 'ADMIN') {
    return NextResponse.json({ error: '접근 권한이 없습니다.' }, { status: 403 });
  }
  const { id } = await context.params;
  const employee = await getEmployee(id);
  if (!employee) {
    return NextResponse.json({ error: '직원을 찾을 수 없습니다.' }, { status: 404 });
  }
  return NextResponse.json({ employee });
}

export async function PATCH(request: Request, context: Context) {
  const actor = await getCurrentUser();
  if (actor?.role !== 'ADMIN') {
    return NextResponse.json({ error: '접근 권한이 없습니다.' }, { status: 403 });
  }
  const { id } = await context.params;
  const before = await getEmployee(id);
  if (!before) {
    return NextResponse.json({ error: '직원을 찾을 수 없습니다.' }, { status: 404 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: '요청 형식이 올바르지 않습니다.' }, { status: 400 });
  }
  const parsed = validateEmployeeInput({
    ...body,
    employeeNumber: before.employeeNumber,
  });
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const input = parsed.value;
  const now = new Date().toISOString();
  const terminatedOn =
    input.employmentStatus === 'RESIGNED'
      ? before.terminatedOn ?? now.slice(0, 10)
      : null;
  const statements = [
    env.DB.prepare(
      `UPDATE employees SET
       full_name = ?, department = ?, job_title = ?, hired_on = ?,
       employment_status = ?, role = ?, standard_start_minute = ?,
       standard_end_minute = ?, terminated_on = ?, updated_at = ?
       WHERE id = ?`,
    ).bind(
      input.fullName,
      input.department,
      input.jobTitle,
      input.hiredOn,
      input.employmentStatus,
      input.role,
      input.standardStartMinute,
      input.standardEndMinute,
      terminatedOn,
      now,
      id,
    ),
    env.DB.prepare(
      'UPDATE user_accounts SET login_enabled = ?, updated_at = ? WHERE employee_id = ?',
    ).bind(
      input.employmentStatus === 'RESIGNED' ? 0 : input.accountEnabled ? 1 : 0,
      now,
      id,
    ),
  ];

  if (input.employmentStatus === 'RESIGNED') {
    statements.push(
      env.DB.prepare(
        'DELETE FROM auth_sessions WHERE account_id IN (SELECT id FROM user_accounts WHERE employee_id = ?)',
      ).bind(id),
    );
  }

  const afterSnapshot = {
    ...before,
    fullName: input.fullName,
    department: input.department,
    jobTitle: input.jobTitle,
    hiredOn: input.hiredOn,
    employmentStatus: input.employmentStatus,
    role: input.role,
    standardStartMinute: input.standardStartMinute,
    standardEndMinute: input.standardEndMinute,
    terminatedOn,
    accountEnabled:
      input.employmentStatus === 'RESIGNED' ? false : input.accountEnabled,
    leavePeriods: undefined,
  };
  statements.push(
    env.DB.prepare(
      `INSERT INTO audit_logs
       (id, actor_employee_id, target_employee_id, entity_type, entity_id, action, target_date, before_json, after_json, reason, created_at)
       VALUES (?, ?, ?, 'EMPLOYEE', ?, 'UPDATE', NULL, ?, ?, '사원정보 수정', ?)`,
    ).bind(
      crypto.randomUUID(),
      actor.employeeId,
      id,
      id,
      JSON.stringify({ ...before, leavePeriods: undefined }),
      JSON.stringify(afterSnapshot),
      now,
    ),
  );

  await env.DB.batch(statements);
  return NextResponse.json({ ok: true });
}