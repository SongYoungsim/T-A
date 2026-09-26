import { env } from 'cloudflare:workers';
import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getEmployee } from '@/lib/employees';

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

  const body = (await request.json()) as {
    startedOn?: string;
    endedOn?: string;
    reason?: string;
  };
  if (!body.startedOn || !/^\d{4}-\d{2}-\d{2}$/.test(body.startedOn)) {
    return NextResponse.json({ error: '휴직 시작일은 필수입니다.' }, { status: 400 });
  }
  if (body.endedOn && body.endedOn < body.startedOn) {
    return NextResponse.json(
      { error: '휴직 종료일은 시작일보다 빠를 수 없습니다.' },
      { status: 400 },
    );
  }

  const now = new Date().toISOString();
  const periodId = crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO leave_of_absence_periods
       (id, employee_id, started_on, ended_on, reason, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      periodId,
      id,
      body.startedOn,
      body.endedOn || null,
      body.reason?.trim().slice(0, 300) || null,
      now,
      now,
    ),
    env.DB.prepare(
      `INSERT INTO audit_logs
       (id, actor_employee_id, target_employee_id, entity_type, entity_id, action, target_date, before_json, after_json, reason, created_at)
       VALUES (?, ?, ?, 'LEAVE_OF_ABSENCE', ?, 'CREATE', ?, NULL, ?, '휴직기간 등록', ?)`,
    ).bind(
      crypto.randomUUID(),
      actor.employeeId,
      id,
      periodId,
      body.startedOn,
      JSON.stringify({
        startedOn: body.startedOn,
        endedOn: body.endedOn || null,
        reason: body.reason?.trim() || null,
      }),
      now,
    ),
  ]);

  return NextResponse.json({ ok: true, id: periodId }, { status: 201 });
}