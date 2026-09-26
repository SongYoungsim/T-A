import { env } from 'cloudflare:workers';
import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getEmployee } from '@/lib/employees';
import { hashPassword } from '@/lib/password';

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  const actor = await getCurrentUser();
  if (actor?.role !== 'ADMIN') {
    return NextResponse.json({ error: '접근 권한이 없습니다.' }, { status: 403 });
  }
  const { id } = await context.params;
  const employee = await getEmployee(id);
  if (!employee) {
    return NextResponse.json({ error: '직원을 찾을 수 없습니다.' }, { status: 404 });
  }
  if (employee.employmentStatus === 'RESIGNED') {
    return NextResponse.json(
      { error: '퇴사자의 계정은 활성화할 수 없습니다.' },
      { status: 400 },
    );
  }

  const body = (await request.json()) as { newPassword?: string };
  if (!body.newPassword || body.newPassword.length < 12) {
    return NextResponse.json(
      { error: '새 임시 비밀번호는 12자 이상이어야 합니다.' },
      { status: 400 },
    );
  }

  const password = await hashPassword(body.newPassword);
  const now = new Date().toISOString();
  const account = await env.DB.prepare(
    'SELECT id FROM user_accounts WHERE employee_id = ? LIMIT 1',
  )
    .bind(id)
    .first<{ id: string }>();
  const accountId = account?.id ?? crypto.randomUUID();

  const statements = account
    ? [
        env.DB.prepare(
          `UPDATE user_accounts SET
           password_hash = ?, password_salt = ?, password_iterations = ?,
           login_enabled = 1, updated_at = ?
           WHERE id = ?`,
        ).bind(password.hash, password.salt, password.iterations, now, accountId),
      ]
    : [
        env.DB.prepare(
          `INSERT INTO user_accounts
           (id, employee_id, password_hash, password_salt, password_iterations, login_enabled, last_login_at, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, 1, NULL, ?, ?)`,
        ).bind(
          accountId,
          id,
          password.hash,
          password.salt,
          password.iterations,
          now,
          now,
        ),
      ];

  statements.push(
    env.DB.prepare('DELETE FROM auth_sessions WHERE account_id = ?').bind(accountId),
    env.DB.prepare(
      `INSERT INTO audit_logs
       (id, actor_employee_id, target_employee_id, entity_type, entity_id, action, target_date, before_json, after_json, reason, created_at)
       VALUES (?, ?, ?, 'USER_ACCOUNT', ?, 'UPDATE', NULL, NULL, ?, '비밀번호 초기화', ?)`,
    ).bind(
      crypto.randomUUID(),
      actor.employeeId,
      id,
      accountId,
      JSON.stringify({ passwordReset: true, loginEnabled: true }),
      now,
    ),
  );

  await env.DB.batch(statements);
  return NextResponse.json({ ok: true });
}