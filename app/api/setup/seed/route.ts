import { env } from 'cloudflare:workers';
import { NextResponse } from 'next/server';
import { hashPassword, secureTextEqual } from '@/lib/password';

type SeedBody = {
  setupSecret?: string;
  adminPassword?: string;
  user1Password?: string;
  user2Password?: string;
};

export async function POST(request: Request) {
  const configuredSecret = env.HR_SETUP_SECRET;
  if (!configuredSecret) {
    return NextResponse.json({ error: '초기 설정이 비활성화되어 있습니다.' }, { status: 404 });
  }

  const body = (await request.json()) as SeedBody;
  if (!body.setupSecret || !secureTextEqual(body.setupSecret, configuredSecret)) {
    return NextResponse.json({ error: '초기 설정 키가 올바르지 않습니다.' }, { status: 403 });
  }

  const existing = await env.DB.prepare('SELECT COUNT(*) AS count FROM employees')
    .first<{ count: number }>();
  if ((existing?.count ?? 0) > 0) {
    return NextResponse.json(
      { error: '이미 사원 데이터가 존재하여 초기 설정을 실행할 수 없습니다.' },
      { status: 409 },
    );
  }

  const passwords = [
    body.adminPassword,
    body.user1Password,
    body.user2Password,
  ];
  if (passwords.some((password) => !password || password.length < 12)) {
    return NextResponse.json(
      { error: '모든 초기 비밀번호는 12자 이상이어야 합니다.' },
      { status: 400 },
    );
  }

  const hashes = await Promise.all(passwords.map((password) => hashPassword(password!)));
  const now = new Date().toISOString();
  const seedEmployees = [
    { number: 'EMP001', name: '관리자', department: '인사팀', title: '관리자', role: 'ADMIN' },
    { number: 'EMP002', name: '일반직원1', department: '개발팀', title: '선임', role: 'USER' },
    { number: 'EMP003', name: '일반직원2', department: '영업팀', title: '사원', role: 'USER' },
  ] as const;

  const statements: D1PreparedStatement[] = [];
  seedEmployees.forEach((employee, index) => {
    const employeeId = crypto.randomUUID();
    const accountId = crypto.randomUUID();
    statements.push(
      env.DB.prepare(
        `INSERT INTO employees
         (id, employee_number, full_name, department, job_title, hired_on, employment_status, role, standard_start_minute, standard_end_minute, terminated_on, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, '2026-01-02', 'ACTIVE', ?, 540, 1080, NULL, ?, ?)`,
      ).bind(
        employeeId,
        employee.number,
        employee.name,
        employee.department,
        employee.title,
        employee.role,
        now,
        now,
      ),
      env.DB.prepare(
        `INSERT INTO user_accounts
         (id, employee_id, password_hash, password_salt, password_iterations, login_enabled, last_login_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 1, NULL, ?, ?)`,
      ).bind(
        accountId,
        employeeId,
        hashes[index].hash,
        hashes[index].salt,
        hashes[index].iterations,
        now,
        now,
      ),
    );
  });

  await env.DB.batch(statements);
  return NextResponse.json({ ok: true, employees: ['EMP001', 'EMP002', 'EMP003'] });
}