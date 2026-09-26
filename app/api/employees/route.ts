import { env } from 'cloudflare:workers';
import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { listEmployees } from '@/lib/employees';
import { validateEmployeeInput } from '@/lib/employee-validation';
import { hashPassword } from '@/lib/password';

async function isAdmin() {
  return (await getCurrentUser())?.role === 'ADMIN';
}

export async function GET() {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: '접근 권한이 없습니다.' }, { status: 403 });
  }
  return NextResponse.json({ employees: await listEmployees() });
}

export async function POST(request: Request) {
  const actor = await getCurrentUser();
  if (actor?.role !== 'ADMIN') {
    return NextResponse.json({ error: '접근 권한이 없습니다.' }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: '요청 형식이 올바르지 않습니다.' }, { status: 400 });
  }

  const parsed = validateEmployeeInput(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const input = parsed.value;
  if (input.accountEnabled && (!input.initialPassword || input.initialPassword.length < 12)) {
    return NextResponse.json(
      { error: '계정을 활성화하려면 12자 이상의 초기 비밀번호가 필요합니다.' },
      { status: 400 },
    );
  }

  const employeeId = crypto.randomUUID();
  const now = new Date().toISOString();
  const statements = [
    env.DB.prepare(
      `INSERT INTO employees
       (id, employee_number, full_name, department, job_title, hired_on, employment_status, role, standard_start_minute, standard_end_minute, terminated_on, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      employeeId,
      input.employeeNumber,
      input.fullName,
      input.department,
      input.jobTitle,
      input.hiredOn,
      input.employmentStatus,
      input.role,
      input.standardStartMinute,
      input.standardEndMinute,
      input.employmentStatus === 'RESIGNED' ? now.slice(0, 10) : null,
      now,
      now,
    ),
  ];

  if (input.accountEnabled && input.initialPassword) {
    const password = await hashPassword(input.initialPassword);
    statements.push(
      env.DB.prepare(
        `INSERT INTO user_accounts
         (id, employee_id, password_hash, password_salt, password_iterations, login_enabled, last_login_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
      ).bind(
        crypto.randomUUID(),
        employeeId,
        password.hash,
        password.salt,
        password.iterations,
        input.employmentStatus === 'RESIGNED' ? 0 : 1,
        now,
        now,
      ),
    );
  }

  const auditSnapshot = {
    employeeNumber: input.employeeNumber,
    fullName: input.fullName,
    department: input.department,
    jobTitle: input.jobTitle,
    hiredOn: input.hiredOn,
    employmentStatus: input.employmentStatus,
    role: input.role,
    standardStartMinute: input.standardStartMinute,
    standardEndMinute: input.standardEndMinute,
    accountEnabled: input.accountEnabled,
  };
  statements.push(
    env.DB.prepare(
      `INSERT INTO audit_logs
       (id, actor_employee_id, target_employee_id, entity_type, entity_id, action, target_date, before_json, after_json, reason, created_at)
       VALUES (?, ?, ?, 'EMPLOYEE', ?, 'CREATE', NULL, NULL, ?, '사원 등록', ?)`,
    ).bind(
      crypto.randomUUID(),
      actor.employeeId,
      employeeId,
      employeeId,
      JSON.stringify(auditSnapshot),
      now,
    ),
  );

  try {
    await env.DB.batch(statements);
    return NextResponse.json({ ok: true, id: employeeId }, { status: 201 });
  } catch (error) {
    if (String(error).toLowerCase().includes('unique')) {
      return NextResponse.json({ error: '이미 사용 중인 사번입니다.' }, { status: 409 });
    }
    throw error;
  }
}