/**
 * lib/attendance-excel.ts — Excel 근태 일괄 업로드 및 검증/반영 서비스 레이어 (Phase 8)
 *
 * ── 설계 및 운영 원칙 ────────────────────────────────────────────────────────────
 * 1. Excel 전용 별도 근태 모델을 만들지 않고 기존 Attendance Model 재사용.
 * 2. Source = 'EXCEL' 활성화.
 * 3. 2단계 파이프라인: Preview(파싱·구조·Row·DB 충돌 검증) → Commit(재검증·원자적 반영).
 * 4. 파일 제한: .xlsx 전용, 최대 5MB, 최대 2,000행.
 * 5. 날짜: Asia/Seoul 기준 Date-only (YYYY-MM-DD), Excel Serial Date 안전 변환.
 * 6. 시간: HH:MM / HH:MM:SS / Time Serial 안전 변환.
 *    - 출근만 존재: 허용 (퇴근 미등록 상태)
 *    - 퇴근만 존재: 불가 (ERROR)
 * 7. 검증: 입사 전/퇴사 후/미래 날짜(ERROR), 휴일/휴직/연차/대체휴무(WARNING).
 * 8. 충돌: DB 기존 데이터와 다르면 CONFLICT. 기본값은 "기존값 유지(KEEP_EXISTING)".
 * 9. Commit 시 DB 재검증 필수 (Preview 이후 변경 감지).
 * 10. Audit Log: 행별 생성/수정 감사로그 + Import Batch 감사로그 기록.
 * ─────────────────────────────────────────────────────────────────────────
 */

import * as XLSX from 'xlsx';
import { env } from 'cloudflare:workers';
import {
  todayKST,
  nowISO,
  calculateAttendanceStatus,
  getActiveLeaveForDate,
} from '@/lib/attendance';
import { getEffectiveWorkday } from '@/lib/calendar';
import { formatTimeKST } from '@/lib/hr-types';
import type {
  AttendanceImportBatchRecord,
  ExcelAttendanceCommitResult,
  ExcelAttendancePreviewRow,
  ExcelAttendancePreviewSummary,
  ExcelConflictResolution,
} from '@/lib/hr-types';

export const MAX_EXCEL_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB
export const MAX_EXCEL_ROWS = 2000;

// ─── 날짜/시간 파싱 헬퍼 ──────────────────────────────────────────────────────

function parseDateCodeSafe(val: number) {
  const ssf = XLSX.SSF;
  if (ssf && typeof ssf.parse_date_code === 'function') {
    return ssf.parse_date_code(val);
  }
  const d = new Date(Math.round((val - 25569) * 86400 * 1000));
  return {
    y: d.getUTCFullYear(),
    m: d.getUTCMonth() + 1,
    d: d.getUTCDate(),
    H: d.getUTCHours(),
    M: d.getUTCMinutes(),
    S: d.getUTCSeconds(),
  };
}

/**
 * Excel Date 파싱: string, number(serial), Date 객체를 "YYYY-MM-DD"로 표준화
 */
export function parseExcelDate(val: unknown): { date: string | null; error?: string } {
  if (val === undefined || val === null || val === '') {
    return { date: null };
  }

  // 1. Excel Serial Number (e.g. 46300)
  if (typeof val === 'number') {
    if (isNaN(val) || val <= 0) {
      return { date: null, error: '유효하지 않은 날짜 일련번호입니다.' };
    }
    const parsed = parseDateCodeSafe(val);
    if (!parsed || !parsed.y || !parsed.m || !parsed.d) {
      return { date: null, error: '날짜 변환에 실패했습니다.' };
    }
    const dateStr = `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
    return { date: dateStr };
  }

  // 2. JavaScript Date Object
  if (val instanceof Date) {
    if (isNaN(val.getTime())) {
      return { date: null, error: '유효하지 않은 날짜 객체입니다.' };
    }
    const kstStr = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(val);
    return { date: kstStr };
  }

  // 3. String
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (!trimmed) return { date: null };

    // YYYY-MM-DD, YYYY.MM.DD, YYYY/MM/DD 매칭
    const m = trimmed.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})$/);
    if (m) {
      const y = parseInt(m[1], 10);
      const mon = parseInt(m[2], 10);
      const d = parseInt(m[3], 10);

      if (mon < 1 || mon > 12 || d < 1 || d > 31) {
        return { date: null, error: `유효하지 않은 날짜 값입니다. (${trimmed})` };
      }

      // 실제 유효 날짜 검증
      const testDate = new Date(Date.UTC(y, mon - 1, d));
      if (testDate.getUTCDate() !== d || testDate.getUTCMonth() !== mon - 1) {
        return { date: null, error: `존재하지 않는 날짜입니다. (${trimmed})` };
      }

      const norm = `${y}-${String(mon).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      return { date: norm };
    }

    // 모호한 날짜(01/02/26 등) 또는 비표준 형식은 추측하지 않고 오류 처리
    return { date: null, error: `날짜 형식을 인식할 수 없습니다: '${trimmed}' (YYYY-MM-DD 권장)` };
  }

  return { date: null, error: '지원되지 않는 날짜 형식입니다.' };
}

/**
 * Excel Time 파싱: string, number(fractional serial), Date 객체를 "HH:MM"으로 표준화
 */
export function parseExcelTime(val: unknown): { time: string | null; error?: string } {
  if (val === undefined || val === null || val === '') {
    return { time: null };
  }

  // 1. Number (Excel time is a fraction of a day, e.g. 0.375 = 09:00, or serial + fraction)
  if (typeof val === 'number') {
    if (isNaN(val) || val < 0) {
      return { time: null, error: '유효하지 않은 시간 값입니다.' };
    }
    const parsed = parseDateCodeSafe(val);
    if (!parsed) {
      return { time: null, error: '시간 변환에 실패했습니다.' };
    }
    const h = parsed.H ?? 0;
    const m = parsed.M ?? 0;
    return { time: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}` };
  }

  // 2. JavaScript Date Object
  if (val instanceof Date) {
    if (isNaN(val.getTime())) {
      return { time: null, error: '유효하지 않은 시간 객체입니다.' };
    }
    const timeStr = new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: 'Asia/Seoul',
    }).format(val);
    return { time: timeStr };
  }

  // 3. String
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (!trimmed) return { time: null };

    // HH:MM or HH:MM:SS
    const m = trimmed.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if (m) {
      const h = parseInt(m[1], 10);
      const min = parseInt(m[2], 10);

      if (h < 0 || h > 23 || min < 0 || min > 59) {
        return { time: null, error: `유효하지 않은 시간 범위입니다: '${trimmed}' (00:00 ~ 23:59)` };
      }
      return { time: `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}` };
    }

    return { time: null, error: `시간 형식을 인식할 수 없습니다: '${trimmed}' (HH:MM 권장)` };
  }

  return { time: null, error: '지원되지 않는 시간 형식입니다.' };
}

/**
 * ISO Timestamp에서 Asia/Seoul HH:MM 추출
 */
export function isoToTimeKST(isoString: string | null): string | null {
  if (!isoString) return null;
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Seoul',
  }).format(d);
}

// ─── Excel 파일 파싱 및 1차 구조 검증 ─────────────────────────────────────────

export interface ParsedRawRow {
  rowNumber: number; // 1-based (헤더가 1이면 첫 데이터는 2)
  employeeNumber: string;
  employeeName: string | null;
  workDateRaw: unknown;
  checkInRaw: unknown;
  checkOutRaw: unknown;
  isEmpty: boolean;
}

export function parseExcelWorkbook(buffer: ArrayBuffer | Uint8Array): {
  ok: true;
  rawRows: ParsedRawRow[];
} | {
  ok: false;
  error: string;
} {
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, {
      type: 'buffer',
      cellDates: true,
      cellNF: false,
      cellText: false,
    });
  } catch {
    return { ok: false, error: '올바른 Excel(.xlsx) 파일이 아니거나 손상된 파일입니다.' };
  }

  const sheetNames = workbook.SheetNames;
  if (!sheetNames || sheetNames.length === 0) {
    return { ok: false, error: 'Excel 파일에 워크시트가 존재하지 않습니다.' };
  }

  const sheet = workbook.Sheets[sheetNames[0]];
  if (!sheet) {
    return { ok: false, error: '첫 번째 워크시트를 읽을 수 없습니다.' };
  }

  // 2차원 배열로 읽기 (모든 행과 열)
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null });
  if (rows.length === 0) {
    return { ok: false, error: 'Excel 파일이 비어 있습니다.' };
  }

  // 헤더 검증 (첫 행)
  const headerRow = rows[0] as unknown[];
  if (!headerRow || headerRow.length === 0) {
    return { ok: false, error: '헤더 행(첫 번째 줄)을 찾을 수 없습니다.' };
  }

  const headerStrings = headerRow.map((c) => (c ? String(c).trim() : ''));

  const colIdxEmpNo = headerStrings.findIndex((h) => h === '사번');
  const colIdxDate = headerStrings.findIndex((h) => h === '근무일자');
  const colIdxIn = headerStrings.findIndex((h) => h === '출근시간');
  const colIdxOut = headerStrings.findIndex((h) => h === '퇴근시간');
  const colIdxName = headerStrings.findIndex((h) => h === '성명');

  if (colIdxEmpNo === -1) {
    return { ok: false, error: "필수 열 '사번'이 없습니다." };
  }
  if (colIdxDate === -1) {
    return { ok: false, error: "필수 열 '근무일자'가 없습니다." };
  }
  if (colIdxIn === -1) {
    return { ok: false, error: "필수 열 '출근시간'이 없습니다." };
  }
  if (colIdxOut === -1) {
    return { ok: false, error: "필수 열 '퇴근시간'이 없습니다." };
  }

  const rawRows: ParsedRawRow[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] as unknown[];
    if (!row || row.length === 0) continue;

    const empNo = row[colIdxEmpNo] !== undefined && row[colIdxEmpNo] !== null ? String(row[colIdxEmpNo]).trim() : '';
    const name = colIdxName !== -1 && row[colIdxName] !== undefined && row[colIdxName] !== null ? String(row[colIdxName]).trim() : null;
    const dateRaw = row[colIdxDate];
    const inRaw = row[colIdxIn];
    const outRaw = row[colIdxOut];

    const isCompletelyEmpty = !empNo && !name && (dateRaw === null || dateRaw === undefined || dateRaw === '') &&
      (inRaw === null || inRaw === undefined || inRaw === '') &&
      (outRaw === null || outRaw === undefined || outRaw === '');

    rawRows.push({
      rowNumber: i + 1,
      employeeNumber: empNo,
      employeeName: name || null,
      workDateRaw: dateRaw,
      checkInRaw: inRaw,
      checkOutRaw: outRaw,
      isEmpty: isCompletelyEmpty,
    });
  }

  return { ok: true, rawRows };
}

// ─── STEP 2 ~ 6: 미리보기 생성 (Preview Pipeline) ───────────────────────────

export async function generateAttendanceExcelPreview(params: {
  buffer: ArrayBuffer | Uint8Array;
  fileName: string;
}): Promise<
  | {
      ok: true;
      summary: ExcelAttendancePreviewSummary;
      rows: ExcelAttendancePreviewRow[];
    }
  | { ok: false; error: string }
> {
  const { buffer, fileName } = params;

  // 1. 파싱
  const parseResult = parseExcelWorkbook(buffer);
  if (!parseResult.ok) {
    return parseResult;
  }

  const { rawRows } = parseResult;

  // 빈 Row 제외 및 Row 수 제한 체크
  const dataRows = rawRows.filter((r) => !r.isEmpty);
  if (dataRows.length === 0) {
    return { ok: false, error: '업로드한 파일에 유효한 근태 데이터 행이 없습니다.' };
  }

  if (dataRows.length > MAX_EXCEL_ROWS) {
    return {
      ok: false,
      error: `파일의 데이터 행 수(${dataRows.length}개)가 최대 허용치(${MAX_EXCEL_ROWS}개)를 초과했습니다.`,
    };
  }

  const today = todayKST();

  // 2. 사원 목록 조회 (캐시용)
  const dbEmployees = await env.DB.prepare(
    `SELECT id, employee_number AS employeeNumber, full_name AS fullName,
            department, hired_on AS hiredOn,
            COALESCE(resignation_date, terminated_on) AS resignationDate,
            employment_status AS employmentStatus,
            standard_start_minute AS standardStartMinute,
            standard_end_minute AS standardEndMinute
     FROM employees`
  ).all<{
    id: string;
    employeeNumber: string;
    fullName: string;
    department: string;
    hiredOn: string;
    resignationDate: string | null;
    employmentStatus: string;
    standardStartMinute: number;
    standardEndMinute: number;
  }>();

  const employeeMap = new Map<string, (typeof dbEmployees.results)[number]>();
  for (const emp of dbEmployees.results) {
    employeeMap.set(emp.employeeNumber, emp);
  }

  // 3. 파일 내부 중복 검사 (동일 사번 + 동일 날짜가 2회 이상 등장)
  const keyToRowsMap = new Map<string, number[]>();
  for (const r of dataRows) {
    if (r.employeeNumber && r.workDateRaw !== undefined && r.workDateRaw !== null) {
      const parsedD = parseExcelDate(r.workDateRaw);
      if (parsedD.date) {
        const key = `${r.employeeNumber}__${parsedD.date}`;
        const list = keyToRowsMap.get(key) || [];
        list.push(r.rowNumber);
        keyToRowsMap.set(key, list);
      }
    }
  }

  // 4. 각 행별 데이터 검증 및 DB 데이터와 결합
  const previewRows: ExcelAttendancePreviewRow[] = [];

  for (const r of dataRows) {
    const errors: string[] = [];
    const warnings: string[] = [];

    // 불완전 Row 체크
    if (!r.employeeNumber && !r.workDateRaw) {
      errors.push('사번과 근무일자가 모두 누락되었습니다.');
    } else if (!r.employeeNumber) {
      errors.push('사번이 누락되었습니다.');
    } else if (!r.workDateRaw) {
      errors.push('근무일자가 누락되었습니다.');
    }

    // 날짜 파싱
    const { date: workDate, error: dateErr } = parseExcelDate(r.workDateRaw);
    if (dateErr) {
      errors.push(dateErr);
    }

    // 시간 파싱
    const { time: checkInTime, error: inErr } = parseExcelTime(r.checkInRaw);
    if (inErr) {
      errors.push(inErr);
    }

    const { time: checkOutTime, error: outErr } = parseExcelTime(r.checkOutRaw);
    if (outErr) {
      errors.push(outErr);
    }

    // 출퇴근 시간 조합 규칙 (Req 14)
    if (!inErr && !outErr) {
      if (!checkInTime && !checkOutTime) {
        errors.push('출근시간과 퇴근시간이 모두 비어 있습니다.');
      } else if (!checkInTime && checkOutTime) {
        errors.push('퇴근시간만 존재하는 기록은 등록할 수 없습니다.');
      } else if (checkInTime && checkOutTime && checkOutTime < checkInTime) {
        warnings.push(`퇴근시간(${checkOutTime})이 출근시간(${checkInTime})보다 빠릅니다.`);
      }
    }

    // 미래 날짜 검증 (Req 15)
    if (workDate && workDate > today) {
      errors.push(`미래 날짜(${workDate})의 근태기록은 등록할 수 없습니다.`);
    }

    // 파일 내 중복 검사 (Req 23)
    if (r.employeeNumber && workDate) {
      const dupRows = keyToRowsMap.get(`${r.employeeNumber}__${workDate}`);
      if (dupRows && dupRows.length > 1) {
        errors.push(`파일 내 동일 사번 및 근무일자 중복 데이터 (Row ${dupRows.join(', ')})`);
      }
    }

    // 사원 조회 및 사원 상태 검증
    const emp = r.employeeNumber ? employeeMap.get(r.employeeNumber) : undefined;
    if (r.employeeNumber && !emp) {
      errors.push(`등록되지 않은 사번입니다: '${r.employeeNumber}'`);
    }

    let dbEmployeeId: string | null = null;
    let dbEmployeeName: string | null = null;
    let department: string | null = null;

    if (emp && workDate) {
      dbEmployeeId = emp.id;
      dbEmployeeName = emp.fullName;
      department = emp.department;

      // 성명 불일치 경고 (Req 10)
      if (r.employeeName && r.employeeName.trim() !== emp.fullName) {
        warnings.push(
          `사번은 일치하지만 성명('${r.employeeName}')이 다릅니다. DB 직원정보('${emp.fullName}')를 기준으로 처리합니다.`
        );
      }

      // 입사 전 데이터 (Req 16)
      if (emp.hiredOn && workDate < emp.hiredOn) {
        errors.push(`입사일(${emp.hiredOn}) 이전의 근태기록입니다.`);
      }

      // 퇴사 후 데이터 (Req 17)
      if (emp.resignationDate && workDate > emp.resignationDate) {
        errors.push(`퇴사일(${emp.resignationDate}) 이후의 근태기록입니다.`);
      }

      // 휴직 기간 검증 (Req 18)
      const loas = await env.DB.prepare(
        `SELECT id, started_on AS startedOn, ended_on AS endedOn, reason
         FROM leave_of_absence_periods
         WHERE employee_id = ? AND started_on <= ? AND (ended_on IS NULL OR ended_on >= ?)
         LIMIT 1`
      )
        .bind(emp.id, workDate, workDate)
        .first<{ id: string; startedOn: string; endedOn: string | null; reason: string | null }>();

      if (loas) {
        warnings.push(`해당 일자는 직원의 휴직기간(${loas.startedOn} ~ ${loas.endedOn || '현재'})에 포함됩니다.`);
      }

      // 근무일 캘린더 판정 (Req 19, 20)
      const effectiveWorkday = await getEffectiveWorkday(workDate);
      if (!effectiveWorkday.isWorkday) {
        warnings.push(`휴일(${effectiveWorkday.name || '주말/공휴일'})의 출퇴근 기록입니다.`);
      }

      // 연차일 충돌 검증 (Req 21)
      const activeLeave = await getActiveLeaveForDate(emp.id, workDate);
      if (activeLeave) {
        warnings.push(`해당 날짜에 연차(${activeLeave.leaveType})가 등록되어 있습니다.`);
      }

      // 대체휴무일 충돌 검증 (Req 22)
      const compLeaveUsage = await env.DB.prepare(
        `SELECT id, used_on AS usedOn FROM compensatory_leave_usages
         WHERE employee_id = ? AND used_on = ?
         LIMIT 1`
      )
        .bind(emp.id, workDate)
        .first();

      if (compLeaveUsage) {
        warnings.push('해당 날짜에 대체휴무 사용이 등록되어 있습니다.');
      }
    }

    // 5. DB 기존 Attendance와 충돌 검사 (Req 24 ~ 27)
    let status: ExcelAttendancePreviewRow['status'] = 'NEW';
    let resolution: ExcelConflictResolution = 'KEEP_EXISTING';
    let existingSource: 'WEB' | 'ADMIN_EDIT' | 'EXCEL' | null = null;
    let existingCheckIn: string | null = null;
    let existingCheckOut: string | null = null;
    let canCommit = true;

    if (errors.length > 0) {
      status = 'ERROR';
      canCommit = false;
    } else if (emp && workDate) {
      const existingAtt = await env.DB.prepare(
        `SELECT id, check_in_at AS checkInAt, check_out_at AS checkOutAt, source
         FROM attendance
         WHERE employee_id = ? AND work_date = ?
         LIMIT 1`
      )
        .bind(emp.id, workDate)
        .first<{
          id: string;
          checkInAt: string | null;
          checkOutAt: string | null;
          source: 'WEB' | 'ADMIN_EDIT' | 'EXCEL';
        }>();

      if (existingAtt) {
        existingSource = existingAtt.source;
        existingCheckIn = isoToTimeKST(existingAtt.checkInAt);
        existingCheckOut = isoToTimeKST(existingAtt.checkOutAt);

        // 동일성 비교 (HH:MM 기준)
        const isSameIn = (existingCheckIn ?? '') === (checkInTime ?? '');
        const isSameOut = (existingCheckOut ?? '') === (checkOutTime ?? '');

        if (isSameIn && isSameOut) {
          status = 'SAME';
          canCommit = false; // 동일 데이터는 재저장하지 않고 반영 제외
        } else {
          status = 'CONFLICT';
          resolution = 'KEEP_EXISTING'; // 기본값은 기존값 유지 (Req 28)
          canCommit = true; // 관리자 선택에 따라 반영 가능
        }
      } else {
        // 기존 기록 없음
        status = warnings.length > 0 ? 'WARNING' : 'NEW';
        resolution = 'OVERWRITE_EXCEL'; // 신규 건은 자동 반영 대상
        canCommit = true;
      }
    }

    previewRows.push({
      rowNumber: r.rowNumber,
      employeeNumber: r.employeeNumber,
      employeeName: r.employeeName,
      dbEmployeeId,
      dbEmployeeName,
      department,
      workDate: workDate || '',
      checkInTime,
      checkOutTime,
      status,
      resolution,
      existingSource,
      existingCheckIn,
      existingCheckOut,
      errors,
      warnings,
      canCommit,
    });
  }

  // 통계 산출
  let newCount = 0;
  let sameCount = 0;
  let conflictCount = 0;
  let warningCount = 0;
  let errorCount = 0;
  let canCommitCount = 0;

  for (const pr of previewRows) {
    if (pr.status === 'ERROR') errorCount++;
    else if (pr.status === 'CONFLICT') conflictCount++;
    else if (pr.status === 'SAME') sameCount++;
    else if (pr.status === 'WARNING') warningCount++;
    else if (pr.status === 'NEW') newCount++;

    if (pr.canCommit) canCommitCount++;
  }

  const summary: ExcelAttendancePreviewSummary = {
    totalRows: previewRows.length,
    newCount,
    sameCount,
    conflictCount,
    warningCount,
    errorCount,
    canCommitCount,
  };

  return { ok: true, summary, rows: previewRows };
}

// ─── STEP 7 ~ 9: DB 반영 (Commit Pipeline) ───────────────────────────────────

export interface CommitRowSelection {
  rowNumber: number;
  employeeNumber: string;
  workDate: string;
  checkInTime: string | null;
  checkOutTime: string | null;
  resolution: ExcelConflictResolution; // 'KEEP_EXISTING' | 'OVERWRITE_EXCEL'
}

export async function commitAttendanceExcelImport(params: {
  fileName: string;
  fileSizeBytes: number;
  rows: CommitRowSelection[];
  actorId: string;
}): Promise<
  | {
      ok: true;
      result: ExcelAttendanceCommitResult;
    }
  | {
      ok: false;
      error: string;
      conflictRow?: number;
    }
> {
  const { fileName, fileSizeBytes, rows, actorId } = params;

  if (!rows || rows.length === 0) {
    return { ok: false, error: '반영할 데이터가 전달되지 않았습니다.' };
  }

  const now = nowISO();
  const batchId = crypto.randomUUID();

  // 1. 사원 정보 조회
  const employeeNumbers = [...new Set(rows.map((r) => r.employeeNumber))];
  const placeholders = employeeNumbers.map(() => '?').join(',');
  const emps = await env.DB.prepare(
    `SELECT id, employee_number AS employeeNumber, full_name AS fullName,
            standard_start_minute AS standardStartMinute,
            standard_end_minute AS standardEndMinute
     FROM employees
     WHERE employee_number IN (${placeholders})`
  )
    .bind(...employeeNumbers)
    .all<{
      id: string;
      employeeNumber: string;
      fullName: string;
      standardStartMinute: number;
      standardEndMinute: number;
    }>();

  const empMap = new Map<string, (typeof emps.results)[number]>();
  for (const e of emps.results) {
    empMap.set(e.employeeNumber, e);
  }

  // 2. Commit 시점 DB 재검증 (Req 38: Preview와 Commit 사이 변경 감지)
  // 대상 날짜 및 사원에 대해 현재 DB 기록 재조회
  let newCount = 0;
  let updatedCount = 0;
  let keptExistingCount = 0;
  let sameCount = 0;
  let errorCount = 0;

  const statements: D1PreparedStatement[] = [];

  for (const r of rows) {
    const emp = empMap.get(r.employeeNumber);
    if (!emp) {
      errorCount++;
      continue;
    }

    // 현재 DB 근태 기록 확인
    const currentAtt = await env.DB.prepare(
      `SELECT id, check_in_at AS checkInAt, check_out_at AS checkOutAt, source,
              representative_status AS representativeStatus,
              original_check_in_at AS originalCheckInAt, original_check_out_at AS originalCheckOutAt
       FROM attendance
       WHERE employee_id = ? AND work_date = ?
       LIMIT 1`
    )
      .bind(emp.id, r.workDate)
      .first<{
        id: string;
        checkInAt: string | null;
        checkOutAt: string | null;
        source: 'WEB' | 'ADMIN_EDIT' | 'EXCEL';
        representativeStatus: string | null;
        originalCheckInAt: string | null;
        originalCheckOutAt: string | null;
      }>();

    // 시간 ISO 변환
    let checkInIso: string | null = null;
    let checkOutIso: string | null = null;
    if (r.checkInTime) {
      checkInIso = new Date(`${r.workDate}T${r.checkInTime}:00+09:00`).toISOString();
    }
    if (r.checkOutTime) {
      checkOutIso = new Date(`${r.workDate}T${r.checkOutTime}:00+09:00`).toISOString();
    }

    if (currentAtt) {
      // 이미 DB에 기록이 있는 경우
      const curInTime = isoToTimeKST(currentAtt.checkInAt);
      const curOutTime = isoToTimeKST(currentAtt.checkOutAt);

      if (curInTime === r.checkInTime && curOutTime === r.checkOutTime) {
        // 기존 데이터와 완전히 동일
        sameCount++;
        continue;
      }

      // 충돌 발생: 사용자의 선택(resolution) 확인
      if (r.resolution === 'KEEP_EXISTING') {
        // 기존값 유지
        keptExistingCount++;
        continue;
      }

      // OVERWRITE_EXCEL: Excel 값으로 변경
      // 연차 확인
      const leave = await getActiveLeaveForDate(emp.id, r.workDate);

      // 근태 재판정
      const judgement = calculateAttendanceStatus({
        standardStartMinute: emp.standardStartMinute,
        standardEndMinute: emp.standardEndMinute,
        checkInAt: checkInIso,
        checkOutAt: checkOutIso,
        leaveType: leave?.leaveType ?? null,
      });

      const originalCheckInAt = currentAtt.originalCheckInAt ?? currentAtt.checkInAt;
      const originalCheckOutAt = currentAtt.originalCheckOutAt ?? currentAtt.checkOutAt;

      const beforeJson = JSON.stringify({
        checkInAt: currentAtt.checkInAt,
        checkOutAt: currentAtt.checkOutAt,
        source: currentAtt.source,
        representativeStatus: currentAtt.representativeStatus,
      });

      const afterJson = JSON.stringify({
        checkInAt: checkInIso,
        checkOutAt: checkOutIso,
        source: 'EXCEL',
        representativeStatus: judgement.representativeStatus,
        importBatchId: batchId,
      });

      // 1) attendance UPDATE
      statements.push(
        env.DB.prepare(
          `UPDATE attendance
           SET check_in_at = ?, check_out_at = ?,
               source = 'EXCEL',
               representative_status = ?,
               is_late = ?, is_early_leave = ?,
               original_check_in_at = ?, original_check_out_at = ?,
               import_batch_id = ?,
               updated_at = ?
           WHERE id = ?`
        ).bind(
          checkInIso,
          checkOutIso,
          judgement.representativeStatus,
          judgement.isLate ? 1 : 0,
          judgement.isEarlyLeave ? 1 : 0,
          originalCheckInAt,
          originalCheckOutAt,
          batchId,
          now,
          currentAtt.id
        )
      );

      // 2) audit_logs INSERT
      statements.push(
        env.DB.prepare(
          `INSERT INTO audit_logs
             (id, actor_employee_id, target_employee_id, entity_type, entity_id,
              action, target_date, before_json, after_json, reason, created_at)
           VALUES (?, ?, ?, 'ATTENDANCE', ?, 'UPDATE', ?, ?, ?, ?, ?)`
        ).bind(
          crypto.randomUUID(),
          actorId,
          emp.id,
          currentAtt.id,
          r.workDate,
          beforeJson,
          afterJson,
          `Excel 근태 일괄 반영 (기존 ${currentAtt.source} -> EXCEL, Batch: ${fileName})`,
          now
        )
      );

      updatedCount++;
    } else {
      // 신규 등록 건
      const leave = await getActiveLeaveForDate(emp.id, r.workDate);

      const judgement = calculateAttendanceStatus({
        standardStartMinute: emp.standardStartMinute,
        standardEndMinute: emp.standardEndMinute,
        checkInAt: checkInIso,
        checkOutAt: checkOutIso,
        leaveType: leave?.leaveType ?? null,
      });

      const newAttId = crypto.randomUUID();
      const afterJson = JSON.stringify({
        id: newAttId,
        employeeId: emp.id,
        workDate: r.workDate,
        checkInAt: checkInIso,
        checkOutAt: checkOutIso,
        source: 'EXCEL',
        representativeStatus: judgement.representativeStatus,
        importBatchId: batchId,
      });

      // 1) attendance INSERT
      statements.push(
        env.DB.prepare(
          `INSERT INTO attendance
             (id, employee_id, work_date, check_in_at, check_out_at,
              source, representative_status, is_late, is_early_leave,
              original_check_in_at, original_check_out_at, import_batch_id,
              created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, 'EXCEL', ?, ?, ?, NULL, NULL, ?, ?, ?)`
        ).bind(
          newAttId,
          emp.id,
          r.workDate,
          checkInIso,
          checkOutIso,
          judgement.representativeStatus,
          judgement.isLate ? 1 : 0,
          judgement.isEarlyLeave ? 1 : 0,
          batchId,
          now,
          now
        )
      );

      // 2) audit_logs INSERT
      statements.push(
        env.DB.prepare(
          `INSERT INTO audit_logs
             (id, actor_employee_id, target_employee_id, entity_type, entity_id,
              action, target_date, before_json, after_json, reason, created_at)
           VALUES (?, ?, ?, 'ATTENDANCE', ?, 'CREATE', ?, NULL, ?, ?, ?)`
        ).bind(
          crypto.randomUUID(),
          actorId,
          emp.id,
          newAttId,
          r.workDate,
          afterJson,
          `Excel 근태 일괄 신규 등록 (Batch: ${fileName})`,
          now
        )
      );

      newCount++;
    }
  }

  // 3. Import Batch 레코드 추가
  const summaryJson = JSON.stringify({
    totalRows: rows.length,
    newCount,
    updatedCount,
    sameCount,
    keptExistingCount,
    errorCount,
  });

  const batchStmt = env.DB.prepare(
    `INSERT INTO attendance_import_batches
       (id, actor_employee_id, file_name, file_size_bytes, total_rows,
        new_count, updated_count, same_count, warning_count, error_count,
        status, summary_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 'COMMITTED', ?, ?, ?)`
  ).bind(
    batchId,
    actorId,
    fileName,
    fileSizeBytes,
    rows.length,
    newCount,
    updatedCount,
    sameCount,
    errorCount,
    summaryJson,
    now,
    now
  );

  // Batch 단위 Audit Log Statement
  const batchAuditStmt = env.DB.prepare(
    `INSERT INTO audit_logs
       (id, actor_employee_id, target_employee_id, entity_type, entity_id,
        action, target_date, before_json, after_json, reason, created_at)
     VALUES (?, ?, NULL, 'ATTENDANCE_EXCEL_IMPORT', ?, 'CREATE', NULL, NULL, ?, ?, ?)`
  ).bind(
    crypto.randomUUID(),
    actorId,
    batchId,
    summaryJson,
    `Excel 근태 파일 일괄 처리 완료 (${fileName}, 총 ${rows.length}행)`,
    now
  );

  statements.push(batchStmt);
  statements.push(batchAuditStmt);

  // D1 Batch 실행 (원자적 처리 또는 청크 처리)
  // D1 batch supports up to 100 statements per batch call safely.
  const CHUNK_SIZE = 80;
  for (let i = 0; i < statements.length; i += CHUNK_SIZE) {
    const chunk = statements.slice(i, i + CHUNK_SIZE);
    await env.DB.batch(chunk);
  }

  return {
    ok: true,
    result: {
      batchId,
      fileName,
      totalRows: rows.length,
      newCount,
      updatedCount,
      keptExistingCount,
      sameCount,
      errorCount,
    },
  };
}

// ─── 표준 Excel Template 생성 ────────────────────────────────────────────────

export function generateAttendanceExcelTemplate(): Uint8Array {
  const wb = XLSX.utils.book_new();

  const headers = ['사번', '성명', '근무일자', '출근시간', '퇴근시간'];
  const sampleData = [
    headers,
    ['EMP001', '홍길동', '2026-10-01', '09:02', '18:07'],
    ['EMP002', '김유연', '2026-10-01', '08:58', '18:15'],
  ];

  const ws = XLSX.utils.aoa_to_sheet(sampleData);

  // 열 너비 지정
  ws['!cols'] = [
    { wch: 12 }, // 사번
    { wch: 14 }, // 성명
    { wch: 14 }, // 근무일자
    { wch: 12 }, // 출근시간
    { wch: 12 }, // 퇴근시간
  ];

  XLSX.utils.book_append_sheet(wb, ws, '근태등록양식');

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  return new Uint8Array(buf);
}

// ─── 오류/경고 내역 Excel 생성 ───────────────────────────────────────────────

export function generateAttendanceErrorExcel(rows: ExcelAttendancePreviewRow[]): Uint8Array {
  const wb = XLSX.utils.book_new();

  const headers = [
    '원본 Row',
    '사번',
    '성명',
    '근무일자',
    '출근시간',
    '퇴근시간',
    '검증상태',
    '오류내용',
    '경고내용',
  ];

  const dataRows: (string | number)[][] = [headers];

  for (const r of rows) {
    if (r.errors.length > 0 || r.warnings.length > 0 || r.status === 'CONFLICT') {
      dataRows.push([
        r.rowNumber,
        r.employeeNumber,
        r.employeeName || r.dbEmployeeName || '',
        r.workDate,
        r.checkInTime || '',
        r.checkOutTime || '',
        r.status === 'ERROR'
          ? '오류'
          : r.status === 'CONFLICT'
          ? '충돌'
          : r.status === 'WARNING'
          ? '경고'
          : r.status,
        r.errors.join('; '),
        r.warnings.join('; '),
      ]);
    }
  }

  const ws = XLSX.utils.aoa_to_sheet(dataRows);

  ws['!cols'] = [
    { wch: 10 },
    { wch: 12 },
    { wch: 14 },
    { wch: 14 },
    { wch: 12 },
    { wch: 12 },
    { wch: 12 },
    { wch: 40 },
    { wch: 40 },
  ];

  XLSX.utils.book_append_sheet(wb, ws, '오류및경고목록');

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  return new Uint8Array(buf);
}

// ─── 최근 Import 이력 조회 ───────────────────────────────────────────────────

export async function listAttendanceImportBatches(limit = 20): Promise<AttendanceImportBatchRecord[]> {
  const rows = await env.DB.prepare(
    `SELECT b.id, b.actor_employee_id AS actorEmployeeId,
            e.full_name AS actorName,
            b.file_name AS fileName,
            b.file_size_bytes AS fileSizeBytes,
            b.total_rows AS totalRows,
            b.new_count AS newCount,
            b.updated_count AS updatedCount,
            b.same_count AS sameCount,
            b.warning_count AS warningCount,
            b.error_count AS errorCount,
            b.status,
            b.created_at AS createdAt
     FROM attendance_import_batches b
     LEFT JOIN employees e ON e.id = b.actor_employee_id
     ORDER BY b.created_at DESC
     LIMIT ?`
  )
    .bind(limit)
    .all<{
      id: string;
      actorEmployeeId: string;
      actorName: string | null;
      fileName: string;
      fileSizeBytes: number;
      totalRows: number;
      newCount: number;
      updatedCount: number;
      sameCount: number;
      warningCount: number;
      errorCount: number;
      status: 'COMMITTED' | 'FAILED';
      createdAt: string;
    }>();

  return rows.results.map((r) => ({
    id: r.id,
    actorEmployeeId: r.actorEmployeeId,
    actorName: r.actorName || '시스템 관리자',
    fileName: r.fileName,
    fileSizeBytes: r.fileSizeBytes,
    totalRows: r.totalRows,
    newCount: r.newCount,
    updatedCount: r.updatedCount,
    sameCount: r.sameCount,
    warningCount: r.warningCount,
    errorCount: r.errorCount,
    status: r.status,
    createdAt: r.createdAt,
  }));
}
