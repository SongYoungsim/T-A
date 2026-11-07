/**
 * lib/calendar.ts — 근무일 캘린더 서비스 레이어 (Phase 5)
 *
 * ── 판정 우선순위 ────────────────────────────────────────────────────────────
 * 1순위: ADMIN 지정 대체근무일 (SUBSTITUTE_WORKDAY) → isWorkday = true
 * 2순위: ADMIN 지정 회사 휴무일 (COMPANY_HOLIDAY)    → isWorkday = false
 * 3순위: 대한민국 공휴일 (PUBLIC_HOLIDAY)           → isWorkday = false
 * 4순위: 주말 (토요일, 일요일: WEEKEND)              → isWorkday = false
 * 5순위: 일반 근무일 (월~금: NORMAL_WORKDAY)          → isWorkday = true
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { env } from 'cloudflare:workers';
import type { CalendarDayType, EffectiveWorkday, WorkCalendarRow } from '@/lib/hr-types';

/** KST 기준 특정 날짜의 요일 구하기 (0: 일, 1: 월, ..., 6: 토) */
export function getDayOfWeekKST(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  // UTC Date 객체로 생성하되 KST 정오를 기준으로 시차 왜곡 방지
  const date = new Date(Date.UTC(y, m - 1, d, 3, 0, 0)); // UTC 03:00 = KST 12:00
  return date.getUTCDay();
}

/**
 * 단일 일자에 대한 최종 유효 근무일 판정 (메모리 맵 또는 단건 조회)
 */
export function evaluateWorkday(
  date: string,
  calendarRecord?: WorkCalendarRow | null
): EffectiveWorkday {
  const dayOfWeek = getDayOfWeekKST(date);
  const isWeekendDay = dayOfWeek === 0 || dayOfWeek === 6;

  // DB 예외 캘린더가 있는 경우
  if (calendarRecord) {
    const type = calendarRecord.dayType;

    // 1순위: 대체근무일 (원래 휴일이어도 근무일로 지정)
    if (type === 'SUBSTITUTE_WORKDAY') {
      return {
        date,
        dayType: 'SUBSTITUTE_WORKDAY',
        isWorkday: true,
        name: calendarRecord.name || '대체근무일',
        memo: calendarRecord.memo,
        source: calendarRecord.source,
      };
    }

    // 2순위: 회사 지정 휴무일
    if (type === 'COMPANY_HOLIDAY') {
      return {
        date,
        dayType: 'COMPANY_HOLIDAY',
        isWorkday: false,
        name: calendarRecord.name || '회사 휴무일',
        memo: calendarRecord.memo,
        source: calendarRecord.source,
      };
    }

    // 3순위: 공휴일
    if (type === 'PUBLIC_HOLIDAY') {
      return {
        date,
        dayType: 'PUBLIC_HOLIDAY',
        isWorkday: false,
        name: calendarRecord.name || '공휴일',
        memo: calendarRecord.memo,
        source: calendarRecord.source,
      };
    }

    // 명시적 일반 근무일 등록인 경우
    if (type === 'NORMAL_WORKDAY' || (type as string) === 'WORKDAY') {
      return {
        date,
        dayType: 'NORMAL_WORKDAY',
        isWorkday: true,
        name: calendarRecord.name || null,
        memo: calendarRecord.memo,
        source: calendarRecord.source,
      };
    }

    // 명시적 주말 등록인 경우
    if (type === 'WEEKEND') {
      return {
        date,
        dayType: 'WEEKEND',
        isWorkday: false,
        name: calendarRecord.name || (dayOfWeek === 0 ? '일요일' : '토요일'),
        memo: calendarRecord.memo,
        source: calendarRecord.source,
      };
    }
  }

  // 4순위: 토요일/일요일 기본 휴일
  if (isWeekendDay) {
    return {
      date,
      dayType: 'WEEKEND',
      isWorkday: false,
      name: dayOfWeek === 0 ? '일요일' : '토요일',
      memo: null,
      source: 'DEFAULT',
    };
  }

  // 5순위: 월~금 기본 일반 근무일
  return {
    date,
    dayType: 'NORMAL_WORKDAY',
    isWorkday: true,
    name: null,
    memo: null,
    source: 'DEFAULT',
  };
}

/**
 * 특정 일자의 최종 근무일 판정 (D1 단건 조회)
 */
export async function getEffectiveWorkday(date: string): Promise<EffectiveWorkday> {
  const row = await env.DB.prepare(
    `SELECT calendar_date AS calendarDate, day_type AS dayType, name,
            COALESCE(is_workday, 1) AS isWorkday, memo, source
     FROM work_calendar WHERE calendar_date = ? LIMIT 1`
  )
    .bind(date)
    .first<WorkCalendarRow>();

  return evaluateWorkday(date, row);
}

/**
 * 특정 기간(from ~ to)의 모든 날짜에 대해 최종 유효 근무일 맵 반환 (대량 조회 최적화)
 */
export async function getEffectiveWorkdaysInRange(
  from: string,
  to: string
): Promise<Map<string, EffectiveWorkday>> {
  const result = new Map<string, EffectiveWorkday>();

  // DB에 등록된 예외 캘린더 조회
  const rows = await env.DB.prepare(
    `SELECT calendar_date AS calendarDate, day_type AS dayType, name,
            COALESCE(is_workday, 1) AS isWorkday, memo, source
     FROM work_calendar
     WHERE calendar_date >= ? AND calendar_date <= ?`
  )
    .bind(from, to)
    .all<WorkCalendarRow>();

  const dbMap = new Map<string, WorkCalendarRow>();
  for (const r of rows.results) {
    dbMap.set(r.calendarDate, r);
  }

  // 날짜 범위 순회
  const [startY, startM, startD] = from.split('-').map(Number);
  const [endY, endM, endD] = to.split('-').map(Number);

  const curr = new Date(Date.UTC(startY, startM - 1, startD, 3, 0, 0));
  const end = new Date(Date.UTC(endY, endM - 1, endD, 3, 0, 0));

  while (curr <= end) {
    const y = curr.getUTCFullYear();
    const m = String(curr.getUTCMonth() + 1).padStart(2, '0');
    const d = String(curr.getUTCDate()).padStart(2, '0');
    const dateStr = `${y}-${m}-${d}`;

    const evaluated = evaluateWorkday(dateStr, dbMap.get(dateStr));
    result.set(dateStr, evaluated);

    curr.setUTCDate(curr.getUTCDate() + 1);
  }

  return result;
}

/**
 * 월별 D1 work_calendar 목록 조회 (ADMIN 관리용)
 */
export async function listWorkCalendarByMonth(
  year: number,
  month: number
): Promise<WorkCalendarRow[]> {
  const from = `${year}-${String(month).padStart(2, '0')}-01`;
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const to = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;

  const rows = await env.DB.prepare(
    `SELECT calendar_date AS calendarDate, day_type AS dayType, name,
            COALESCE(is_workday, 1) AS isWorkday, memo, source, created_by AS createdBy,
            created_at AS createdAt, updated_at AS updatedAt
     FROM work_calendar
     WHERE calendar_date >= ? AND calendar_date < ?
     ORDER BY calendar_date ASC`
  )
    .bind(from, to)
    .all<WorkCalendarRow>();

  return rows.results;
}

/**
 * work_calendar 등록 / 수정 (단일 일자 충돌 방지: Upsert)
 */
export async function upsertWorkCalendar(params: {
  date: string;
  dayType: CalendarDayType;
  name?: string;
  memo?: string;
  actorId: string;
  reason?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { date, dayType, name = '', memo = '', actorId, reason = '' } = params;

  // isWorkday 결정
  let isWorkday = 1;
  if (dayType === 'PUBLIC_HOLIDAY' || dayType === 'COMPANY_HOLIDAY' || dayType === 'WEEKEND') {
    isWorkday = 0;
  }

  // 기존 값 조회 (Audit Log용)
  const existing = await env.DB.prepare(
    `SELECT calendar_date AS calendarDate, day_type AS dayType, name, memo, is_workday AS isWorkday
     FROM work_calendar WHERE calendar_date = ? LIMIT 1`
  )
    .bind(date)
    .first<any>();

  const now = new Date().toISOString();

  // Upsert
  await env.DB.prepare(
    `INSERT INTO work_calendar
       (calendar_date, day_type, name, is_workday, memo, source, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'ADMIN', ?, ?, ?)
     ON CONFLICT(calendar_date) DO UPDATE SET
       day_type = excluded.day_type,
       name = excluded.name,
       is_workday = excluded.is_workday,
       memo = excluded.memo,
       source = 'ADMIN',
       updated_at = excluded.updated_at`
  )
    .bind(date, dayType, name, isWorkday, memo, actorId, now, now)
    .run();

  // Audit Log 저장
  const auditId = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO audit_logs
       (id, actor_employee_id, entity_type, entity_id, action, target_date, before_json, after_json, reason, created_at)
     VALUES (?, ?, 'WORK_CALENDAR', ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      auditId,
      actorId,
      date,
      existing ? 'UPDATE' : 'CREATE',
      date,
      existing ? JSON.stringify(existing) : null,
      JSON.stringify({ calendarDate: date, dayType, name, memo, isWorkday }),
      reason || (existing ? '근무일 캘린더 예외 수정' : '근무일 캘린더 예외 신규 등록'),
      now
    )
    .run();

  return { ok: true };
}

/**
 * work_calendar 예외 삭제 (기본 달력으로 복구)
 */
export async function deleteWorkCalendar(
  date: string,
  actorId: string,
  reason: string = '근무일 캘린더 예외 삭제 (기본 달력 복구)'
): Promise<{ ok: true } | { ok: false; error: string }> {
  const existing = await env.DB.prepare(
    `SELECT calendar_date AS calendarDate, day_type AS dayType, name, memo
     FROM work_calendar WHERE calendar_date = ? LIMIT 1`
  )
    .bind(date)
    .first<any>();

  if (!existing) {
    return { ok: false, error: '해당 일자의 캘린더 설정이 존재하지 않습니다.' };
  }

  const now = new Date().toISOString();

  await env.DB.prepare(`DELETE FROM work_calendar WHERE calendar_date = ?`)
    .bind(date)
    .run();

  // Audit Log
  const auditId = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO audit_logs
       (id, actor_employee_id, entity_type, entity_id, action, target_date, before_json, after_json, reason, created_at)
     VALUES (?, ?, 'WORK_CALENDAR', ?, 'DELETE', ?, ?, null, ?, ?)`
  )
    .bind(auditId, actorId, date, date, JSON.stringify(existing), reason, now)
    .run();

  return { ok: true };
}

// ─── 2026~2027 대한민국 법정공휴일 시드 데이터 ──────────────────────────────
export const KOREA_PUBLIC_HOLIDAYS_SEED: { date: string; name: string }[] = [
  // 2026년
  { date: '2026-01-01', name: '신정' },
  { date: '2026-02-16', name: '설날 연휴' },
  { date: '2026-02-17', name: '설날' },
  { date: '2026-02-18', name: '설날 연휴' },
  { date: '2026-03-01', name: '삼일절' },
  { date: '2026-03-02', name: '대체공휴일 (삼일절)' },
  { date: '2026-05-05', name: '어린이날' },
  { date: '2026-05-24', name: '부처님오신날' },
  { date: '2026-05-25', name: '대체공휴일 (부처님오신날)' },
  { date: '2026-06-06', name: '현충일' },
  { date: '2026-08-15', name: '광복절' },
  { date: '2026-08-17', name: '대체공휴일 (광복절)' },
  { date: '2026-09-24', name: '추석 연휴' },
  { date: '2026-09-25', name: '추석' },
  { date: '2026-09-26', name: '추석 연휴' },
  { date: '2026-10-03', name: '개천절' },
  { date: '2026-10-05', name: '대체공휴일 (개천절)' },
  { date: '2026-10-09', name: '한글날' },
  { date: '2026-12-25', name: '기독탄신일(성탄절)' },

  // 2027년
  { date: '2027-01-01', name: '신정' },
  { date: '2027-02-06', name: '설날 연휴' },
  { date: '2027-02-07', name: '설날' },
  { date: '2027-02-08', name: '설날 연휴' },
  { date: '2027-02-09', name: '대체공휴일 (설날)' },
  { date: '2027-03-01', name: '삼일절' },
  { date: '2027-05-05', name: '어린이날' },
  { date: '2027-05-13', name: '부처님오신날' },
  { date: '2027-06-06', name: '현충일' },
  { date: '2027-08-15', name: '광복절' },
  { date: '2027-08-16', name: '대체공휴일 (광복절)' },
  { date: '2027-09-14', name: '추석 연휴' },
  { date: '2027-09-15', name: '추석' },
  { date: '2027-09-16', name: '추석 연휴' },
  { date: '2027-10-03', name: '개천절' },
  { date: '2027-10-04', name: '대체공휴일 (개천절)' },
  { date: '2027-10-09', name: '한글날' },
  { date: '2027-10-11', name: '대체공휴일 (한글날)' },
  { date: '2027-12-25', name: '성탄절' },
  { date: '2027-12-27', name: '대체공휴일 (성탄절)' },
];

/**
 * 2026~2027 공휴일 데이터 안전 일괄 시드 (기존 회사 휴무일/대체근무일 override 보존)
 */
export async function seedPublicHolidays(actorId: string): Promise<{ total: number; inserted: number }> {
  const now = new Date().toISOString();
  let inserted = 0;

  for (const h of KOREA_PUBLIC_HOLIDAYS_SEED) {
    // 이미 존재하는지 확인
    const existing = await env.DB.prepare(
      `SELECT calendar_date, day_type, source FROM work_calendar WHERE calendar_date = ? LIMIT 1`
    )
      .bind(h.date)
      .first<{ calendar_date: string; day_type: string; source: string }>();

    // 이미 ADMIN이 수동 등록했거나 다른 유형으로 지정한 경우 보존
    if (!existing) {
      await env.DB.prepare(
        `INSERT INTO work_calendar
           (calendar_date, day_type, name, is_workday, memo, source, created_by, created_at, updated_at)
         VALUES (?, 'PUBLIC_HOLIDAY', ?, 0, '대한민국 법정공휴일', 'SEED', ?, ?, ?)`
      )
        .bind(h.date, h.name, actorId, now, now)
        .run();
      inserted++;
    }
  }

  // Audit Log
  const auditId = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO audit_logs
       (id, actor_employee_id, entity_type, entity_id, action, target_date, before_json, after_json, reason, created_at)
     VALUES (?, ?, 'WORK_CALENDAR', 'SEED_2026_2027', 'CREATE', null, null, ?, '2026~2027 대한민국 공휴일 초기 등록', ?)`
  )
    .bind(auditId, actorId, JSON.stringify({ inserted, total: KOREA_PUBLIC_HOLIDAYS_SEED.length }), now)
    .run();

  return { total: KOREA_PUBLIC_HOLIDAYS_SEED.length, inserted };
}
