import { env } from 'cloudflare:workers';
import { NextResponse } from 'next/server';
import { createSession, setSessionCookie } from '@/lib/auth';
import { consumePasswordCost, verifyPassword } from '@/lib/password';
import type { EmployeeRole, EmploymentStatus } from '@/lib/hr-types';

type LoginRow = {
  employeeId: string;
  accountId: string;
  role: EmployeeRole;
  employmentStatus: EmploymentStatus;
  loginEnabled: number | boolean;
  passwordHash: string;
  passwordSalt: string;
  passwordIterations: number;
};

const invalidResponse = () =>
  NextResponse.json(
    { error: '사번 또는 비밀번호를 확인해주세요.' },
    { status: 401 },
  );

export async function POST(request: Request) {
  let body: { employeeNumber?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return invalidResponse();
  }

  const employeeNumber = body.employeeNumber?.trim().toUpperCase() ?? '';
  const password = body.password ?? '';
  if (!employeeNumber || !password) return invalidResponse();

  const account = await env.DB.prepare(
    `SELECT
       e.id AS employeeId,
       ua.id AS accountId,
       e.role,
       e.employment_status AS employmentStatus,
       ua.login_enabled AS loginEnabled,
       ua.password_hash AS passwordHash,
       ua.password_salt AS passwordSalt,
       ua.password_iterations AS passwordIterations
     FROM employees e
     JOIN user_accounts ua ON ua.employee_id = e.id
     WHERE e.employee_number = ?
     LIMIT 1`,
  )
    .bind(employeeNumber)
    .first<LoginRow>();

  if (!account) {
    await consumePasswordCost(password);
    return invalidResponse();
  }

  const validPassword = await verifyPassword(
    password,
    account.passwordHash,
    account.passwordSalt,
    account.passwordIterations,
  );

  if (
    !validPassword ||
    !Boolean(account.loginEnabled) ||
    account.employmentStatus === 'RESIGNED'
  ) {
    return invalidResponse();
  }

  const session = await createSession(account.accountId);
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare(
      'UPDATE user_accounts SET last_login_at = ?, updated_at = ? WHERE id = ?',
    ).bind(now, now, account.accountId),
    env.DB.prepare(
      `INSERT INTO audit_logs
       (id, actor_employee_id, target_employee_id, entity_type, entity_id, action, target_date, before_json, after_json, reason, created_at)
       VALUES (?, ?, ?, 'USER_ACCOUNT', ?, 'LOGIN', NULL, NULL, NULL, '로그인 성공', ?)`,
    ).bind(
      crypto.randomUUID(),
      account.employeeId,
      account.employeeId,
      account.accountId,
      now,
    ),
  ]);

  const response = NextResponse.json({
    ok: true,
    redirect: account.role === 'ADMIN' ? '/admin' : '/user',
  });
  setSessionCookie(response, session.token, session.expiresAt);
  return response;
}