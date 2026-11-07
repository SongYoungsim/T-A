import { env } from 'cloudflare:workers';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { CurrentUser } from '@/lib/hr-types';

export const SESSION_COOKIE = 'tna_hr_session';
const SESSION_TTL_SECONDS = 60 * 60 * 12;

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function hashSessionToken(token: string) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(token),
  );
  return bytesToHex(new Uint8Array(digest));
}

export async function createSession(accountId: string) {
  const tokenBytes = crypto.getRandomValues(new Uint8Array(32));
  const token = bytesToHex(tokenBytes);
  const tokenHash = await hashSessionToken(token);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_SECONDS * 1000);

  await env.DB.prepare(
    `INSERT INTO auth_sessions
      (id, account_id, token_hash, expires_at, last_seen_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      crypto.randomUUID(),
      accountId,
      tokenHash,
      expiresAt.toISOString(),
      now.toISOString(),
      now.toISOString(),
    )
    .run();

  return { token, expiresAt };
}

export function setSessionCookie(
  response: { cookies: { set: (name: string, value: string, options: Record<string, unknown>) => void } },
  token: string,
  expiresAt: Date,
) {
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  });
}

export function clearSessionCookie(
  response: { cookies: { set: (name: string, value: string, options: Record<string, unknown>) => void } },
) {
  response.cookies.set(SESSION_COOKIE, '', {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const tokenHash = await hashSessionToken(token);
  const now = new Date().toISOString();
  const row = await env.DB.prepare(
    `SELECT
       e.id AS employeeId,
       ua.id AS accountId,
       e.employee_number AS employeeNumber,
       e.full_name AS fullName,
       e.department,
       e.job_title AS jobTitle,
       e.employment_status AS employmentStatus,
       e.role,
       e.standard_start_minute AS standardStartMinute,
       e.standard_end_minute AS standardEndMinute
     FROM auth_sessions s
     JOIN user_accounts ua ON ua.id = s.account_id
     JOIN employees e ON e.id = ua.employee_id
     WHERE s.token_hash = ?
       AND s.expires_at > ?
       AND ua.login_enabled = 1
       AND e.employment_status <> 'RESIGNED'
     LIMIT 1`,
  )
    .bind(tokenHash, now)
    .first<CurrentUser>();

  return row ?? null;
}

export async function revokeCurrentSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return;
  const tokenHash = await hashSessionToken(token);
  await env.DB.prepare('DELETE FROM auth_sessions WHERE token_hash = ?')
    .bind(tokenHash)
    .run();
}

export async function requireAuth() {
  const user = await getCurrentUser();
  if (!user) redirect('/');
  return user;
}

export async function requireAdmin() {
  const user = await requireAuth();
  if (user.role !== 'ADMIN') redirect('/user?forbidden=1');
  return user;
}

export async function requireUser() {
  const user = await requireAuth();
  if (user.role !== 'USER') redirect('/admin');
  return user;
}