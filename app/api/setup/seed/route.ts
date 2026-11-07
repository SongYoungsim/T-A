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
  // Phase 10 Req 9: Production 환경에서 Seed 실행 원천 차단
  const currentEnv = env.APP_ENV || process.env.APP_ENV;
  if (currentEnv === 'production') {
    return NextResponse.json(
      { error: '운영(Production) 환경에서는 시드 데이터 생성이 영구적으로 차단됩니다. (Phase 10 정책)' },
      { status: 403 },
    );
  }

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
    body.adminPassword || 'AdminPass1234!',
    body.user1Password || 'User1Pass1234!',
    body.user2Password || 'User2Pass1234!',
  ];
  if (passwords.some((password) => !password || password.length < 12)) {
    return NextResponse.json(
      { error: '모든 초기 비밀번호는 12자 이상이어야 합니다.' },
      { status: 400 },
    );
  }

  const hashes = await Promise.all(passwords.map((password) => hashPassword(password!)));
  const now = new Date().toISOString();

  // Phase 10 Req 7, 8: 실제 개인정보 복제 금지, 안전한 가상 테스트 직원 구성
  const seedEmployees = [
    { number: 'EMP001', name: '김관리', department: '인사팀', title: '팀장', role: 'ADMIN', status: 'ACTIVE', hiredOn: '2025-01-02', resignedOn: null },
    { number: 'EMP002', name: '이직원', department: '개발팀', title: '수석', role: 'USER', status: 'ACTIVE', hiredOn: '2025-03-01', resignedOn: null },
    { number: 'EMP003', name: '박연구', department: '연구소', title: '책임', role: 'USER', status: 'ACTIVE', hiredOn: '2025-06-01', resignedOn: null },
    { number: 'EMP004', name: '최생산', department: '생산팀', title: '매니저', role: 'USER', status: 'ACTIVE', hiredOn: '2026-01-02', resignedOn: null },
    { number: 'EMP005', name: '정퇴사', department: '개발팀', title: '사원', role: 'USER', status: 'RESIGNED', hiredOn: '2025-01-02', resignedOn: '2026-06-30' },
  ] as const;

  const statements: D1PreparedStatement[] = [];

  seedEmployees.forEach((employee, index) => {
    const employeeId = crypto.randomUUID();
    const accountId = crypto.randomUUID();
    const leaveMasterId = crypto.randomUUID();
    const hashData = hashes[index % hashes.length];

    statements.push(
      env.DB.prepare(
        `INSERT INTO employees
         (id, employee_number, full_name, department, job_title, hired_on, employment_status, role, standard_start_minute, standard_end_minute, resignation_date, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 540, 1080, ?, ?, ?)`,
      ).bind(
        employeeId,
        employee.number,
        employee.name,
        employee.department,
        employee.title,
        employee.hiredOn,
        employee.status,
        employee.role,
        employee.resignedOn,
        now,
        now,
      ),
      env.DB.prepare(
        `INSERT INTO user_accounts
         (id, employee_id, password_hash, password_salt, password_iterations, login_enabled, last_login_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
      ).bind(
        accountId,
        employeeId,
        hashData.hash,
        hashData.salt,
        hashData.iterations,
        employee.status === 'RESIGNED' ? 0 : 1, // 퇴사자는 로그인 비활성화
        now,
        now,
      ),
      // 기본 연차 마스터 부여 (15일 = 7200분)
      env.DB.prepare(
        `INSERT INTO annual_leave_masters
         (id, employee_id, year, granted_hours, carried_hours, granted_minutes, carried_minutes, created_at, updated_at)
         VALUES (?, ?, 2026, 120, 0, 7200, 0, ?, ?)`,
      ).bind(
        leaveMasterId,
        employeeId,
        now,
        now,
      ),
    );
  });

  await env.DB.batch(statements);
  return NextResponse.json({
    ok: true,
    environment: 'development',
    employees: seedEmployees.map((e) => `${e.number} ${e.name} (${e.status})`),
  });
}