/**
 * POST /api/setup/migrate — Phase 3 + Phase 4 D1 Migration 적용
 *
 * 이 엔드포인트는 배포 직후 한 번만 실행합니다.
 * HR_SETUP_SECRET 환경변수가 설정된 경우에만 동작합니다.
 * 운영 데이터를 삭제하지 않고 ALTER TABLE만 실행합니다.
 *
 * 멱등성: 이미 컬럼이 존재하면 "duplicate column" 오류를 무시합니다.
 */
import { env } from 'cloudflare:workers';
import { NextResponse } from 'next/server';
import { secureTextEqual } from '@/lib/password';

const PHASE3_STATEMENTS = [
  // 1. annual_leave_masters에 분 단위 컬럼 추가
  `ALTER TABLE annual_leave_masters ADD COLUMN granted_minutes integer NOT NULL DEFAULT 0`,
  `ALTER TABLE annual_leave_masters ADD COLUMN carried_minutes integer NOT NULL DEFAULT 0`,
  // 2. 기존 hours 데이터를 minutes로 변환
  `UPDATE annual_leave_masters SET granted_minutes = granted_hours * 60, carried_minutes = carried_hours * 60 WHERE granted_hours > 0 OR carried_hours > 0`,
  // 3. leave_usages에 분 단위 컬럼 추가
  `ALTER TABLE leave_usages ADD COLUMN minutes integer NOT NULL DEFAULT 0`,
  // 4. 기존 hours를 minutes로 변환
  `UPDATE leave_usages SET minutes = hours * 60 WHERE hours > 0`,
  // 5. Soft Delete 컬럼 추가
  `ALTER TABLE leave_usages ADD COLUMN cancelled_at text`,
  `ALTER TABLE leave_usages ADD COLUMN cancelled_by text`,
  // 6. 인덱스 (이미 존재하면 무시)
  `CREATE INDEX IF NOT EXISTS idx_leave_usage_cancelled ON leave_usages (cancelled_at)`,
  // 7. 최적화
  `PRAGMA optimize`,
];

const PHASE4_STATEMENTS = [
  // attendance 테이블 Phase 4 컬럼 추가
  `ALTER TABLE attendance ADD COLUMN is_late integer NOT NULL DEFAULT 0`,
  `ALTER TABLE attendance ADD COLUMN is_early_leave integer NOT NULL DEFAULT 0`,
  `ALTER TABLE attendance ADD COLUMN original_check_in_at text`,
  `ALTER TABLE attendance ADD COLUMN original_check_out_at text`,
  // 인덱스
  `CREATE INDEX IF NOT EXISTS idx_attendance_status ON attendance (employee_id, representative_status)`,
  `CREATE INDEX IF NOT EXISTS idx_attendance_employee_date ON attendance (employee_id, work_date)`,
  `PRAGMA optimize`,
];

const PHASE5_STATEMENTS = [
  // work_calendar 테이블 Phase 5 컬럼 추가
  `ALTER TABLE work_calendar ADD COLUMN is_workday integer NOT NULL DEFAULT 1`,
  `ALTER TABLE work_calendar ADD COLUMN memo text`,
  `ALTER TABLE work_calendar ADD COLUMN source text DEFAULT 'MANUAL'`,
  // employees 테이블 resignation_date 추가
  `ALTER TABLE employees ADD COLUMN resignation_date text`,
  // 인덱스
  `CREATE INDEX IF NOT EXISTS idx_work_calendar_date_type ON work_calendar (calendar_date, day_type)`,
  `CREATE INDEX IF NOT EXISTS idx_employees_resignation ON employees (resignation_date)`,
  `PRAGMA optimize`,
];

const PHASE6_STATEMENTS = [
  // overtime_works 테이블 Phase 6 컬럼 추가
  `ALTER TABLE overtime_works ADD COLUMN grant_comp_leave integer NOT NULL DEFAULT 0`,
  `ALTER TABLE overtime_works ADD COLUMN cancelled_at text`,
  `ALTER TABLE overtime_works ADD COLUMN cancelled_by text`,
  `CREATE INDEX IF NOT EXISTS idx_overtime_cancelled ON overtime_works (cancelled_at)`,
  `PRAGMA optimize`,
];

const PHASE7_STATEMENTS = [
  // compensatory_leaves 테이블 Phase 7 컬럼 및 인덱스 추가
  `ALTER TABLE compensatory_leaves ADD COLUMN cancelled_at text`,
  `ALTER TABLE compensatory_leaves ADD COLUMN cancelled_by text`,
  `CREATE INDEX IF NOT EXISTS idx_comp_leave_cancelled ON compensatory_leaves (cancelled_at)`,
  `CREATE INDEX IF NOT EXISTS idx_comp_leave_source_ot ON compensatory_leaves (source_overtime_id)`,
  `CREATE INDEX IF NOT EXISTS idx_comp_leave_employee_expires ON compensatory_leaves (employee_id, expires_on)`,
  `PRAGMA optimize`,
];

const PHASE8_STATEMENTS = [
  // Phase 8: Excel Import Batches 테이블 및 attendance.import_batch_id 추가
  `CREATE TABLE IF NOT EXISTS attendance_import_batches (
    id text PRIMARY KEY NOT NULL,
    actor_employee_id text NOT NULL REFERENCES employees(id),
    file_name text NOT NULL,
    file_size_bytes integer DEFAULT 0 NOT NULL,
    total_rows integer DEFAULT 0 NOT NULL,
    new_count integer DEFAULT 0 NOT NULL,
    updated_count integer DEFAULT 0 NOT NULL,
    same_count integer DEFAULT 0 NOT NULL,
    warning_count integer DEFAULT 0 NOT NULL,
    error_count integer DEFAULT 0 NOT NULL,
    status text DEFAULT 'COMMITTED' NOT NULL,
    summary_json text,
    created_at text NOT NULL,
    updated_at text NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_import_batch_actor ON attendance_import_batches (actor_employee_id)`,
  `CREATE INDEX IF NOT EXISTS idx_import_batch_created ON attendance_import_batches (created_at)`,
  `ALTER TABLE attendance ADD COLUMN import_batch_id text REFERENCES attendance_import_batches(id)`,
  `CREATE INDEX IF NOT EXISTS idx_attendance_import_batch ON attendance (import_batch_id)`,
  `PRAGMA optimize`,
];

const ALL_STATEMENTS = [
  ...PHASE3_STATEMENTS,
  ...PHASE4_STATEMENTS,
  ...PHASE5_STATEMENTS,
  ...PHASE6_STATEMENTS,
  ...PHASE7_STATEMENTS,
  ...PHASE8_STATEMENTS,
];

export async function POST(request: Request) {
  const configuredSecret = env.HR_SETUP_SECRET;
  if (!configuredSecret) {
    return NextResponse.json({ error: '초기 설정이 비활성화되어 있습니다.' }, { status: 404 });
  }

  let body: { setupSecret?: string };
  try {
    body = await request.json() as { setupSecret?: string };
  } catch {
    return NextResponse.json({ error: '요청 형식이 올바르지 않습니다.' }, { status: 400 });
  }

  if (!body.setupSecret || !secureTextEqual(body.setupSecret, configuredSecret)) {
    return NextResponse.json({ error: '초기 설정 키가 올바르지 않습니다.' }, { status: 403 });
  }

  const results: { statement: string; status: string; error?: string }[] = [];

  for (const sql of ALL_STATEMENTS) {
    try {
      await env.DB.prepare(sql).run();
      results.push({ statement: sql.slice(0, 60) + '...', status: 'OK' });
    } catch (e) {
      const errMsg = String(e);
      // 이미 존재하는 컬럼은 무시 (멱등성)
      if (errMsg.toLowerCase().includes('duplicate column') || errMsg.toLowerCase().includes('already exists')) {
        results.push({ statement: sql.slice(0, 60) + '...', status: 'SKIPPED (already exists)' });
      } else {
        results.push({ statement: sql.slice(0, 60) + '...', status: 'ERROR', error: errMsg });
      }
    }
  }

  // Phase 7: 기존 Phase 6 휴일근무 대체휴무 백필 (안전 실행)
  let backfillResult = null;
  try {
    const { backfillCompensatoryLeaves } = await import('@/lib/compensatory-leave');
    backfillResult = await backfillCompensatoryLeaves('SYSTEM_MIGRATION');
  } catch (err) {
    backfillResult = { error: String(err) };
  }

  const hasError = results.some((r) => r.status === 'ERROR');
  return NextResponse.json({ ok: !hasError, results, backfillResult }, { status: hasError ? 500 : 200 });
}
