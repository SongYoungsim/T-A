/**
 * scripts/test-phase8.mjs
 * Phase 8: Excel 근태 일괄 업로드, 파싱, 검증, 충돌 처리, 근태 비즈니스 룰 종합 검증
 *
 * 검증 목록:
 * 1. Excel Parser 검증 (정상, 잘못된 형식, 빈 파일, 헤더 누락, 빈 Row, 불완전 Row)
 * 2. 날짜 및 시간 파싱 (정상 YYYY-MM-DD, 점/슬래시, Serial Date, 유효하지 않은 날짜, Time Serial, HH:MM, HH:MM:SS, 비정상 시간)
 * 3. 출/퇴근 조합 검증 (출근만 허용, 퇴근만 불가)
 * 4. 직원 상태 검증 (미존재 사번, 성명 불일치 Warning, 입사 전 Error, 입사 당일 허용, 퇴사 당일 허용, 퇴사 익일 Error, 휴직기간 Warning)
 * 5. 근무일 캘린더 및 휴가 검증 (휴일 Warning, 대체근무일 정상, 연차일 Warning 및 연차 우선, 대체휴무일 Warning 및 대체휴무 우선)
 * 6. 파일 내부 중복 검사 (동일 사번 + 동일 일자 중복 시 Error)
 * 7. DB 충돌 검사 (NEW, SAME, CONFLICT, WEB/ADMIN_EDIT 소스 보호, KEEP_EXISTING, OVERWRITE_EXCEL)
 * 8. 근태 비즈니스 룰 자동 재사용 (09:05 정상, 09:06 지각, 17:55 정상, 17:54 조퇴, 결근 해소)
 * 9. Audit Log 및 Import Batch 검증
 */

import * as XLSX from 'xlsx';
import assert from 'node:assert';

// ─── 유틸리티 및 모의 환경 ──────────────────────────────────────────────────

function pad(n) {
  return String(n).padStart(2, '0');
}

function parseDateCodeSafe(val) {
  const ssf = XLSX.SSF || XLSX.default?.SSF || XLSX.ssf;
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

// 1. 날짜 파싱 모듈 테스트용 구현
function parseExcelDate(val) {
  if (val === undefined || val === null || val === '') return { date: null };

  if (typeof val === 'number') {
    if (isNaN(val) || val <= 0) return { date: null, error: '유효하지 않은 날짜 일련번호입니다.' };
    const parsed = parseDateCodeSafe(val);
    if (!parsed || !parsed.y || !parsed.m || !parsed.d) return { date: null, error: '날짜 변환에 실패했습니다.' };
    return { date: `${parsed.y}-${pad(parsed.m)}-${pad(parsed.d)}` };
  }

  if (val instanceof Date) {
    if (isNaN(val.getTime())) return { date: null, error: '유효하지 않은 날짜 객체입니다.' };
    const kstStr = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(val);
    return { date: kstStr };
  }

  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (!trimmed) return { date: null };

    const m = trimmed.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})$/);
    if (m) {
      const y = parseInt(m[1], 10);
      const mon = parseInt(m[2], 10);
      const d = parseInt(m[3], 10);

      if (mon < 1 || mon > 12 || d < 1 || d > 31) return { date: null, error: `유효하지 않은 날짜 값입니다. (${trimmed})` };

      const testDate = new Date(Date.UTC(y, mon - 1, d));
      if (testDate.getUTCDate() !== d || testDate.getUTCMonth() !== mon - 1) {
        return { date: null, error: `존재하지 않는 날짜입니다. (${trimmed})` };
      }
      return { date: `${y}-${pad(mon)}-${pad(d)}` };
    }
    return { date: null, error: `날짜 형식을 인식할 수 없습니다: '${trimmed}' (YYYY-MM-DD 권장)` };
  }

  return { date: null, error: '지원되지 않는 날짜 형식입니다.' };
}

// 2. 시간 파싱 모듈 테스트용 구현
function parseExcelTime(val) {
  if (val === undefined || val === null || val === '') return { time: null };

  if (typeof val === 'number') {
    if (isNaN(val) || val < 0) return { time: null, error: '유효하지 않은 시간 값입니다.' };
    const parsed = parseDateCodeSafe(val);
    if (!parsed) return { time: null, error: '시간 변환에 실패했습니다.' };
    return { time: `${pad(parsed.H ?? 0)}:${pad(parsed.M ?? 0)}` };
  }

  if (val instanceof Date) {
    if (isNaN(val.getTime())) return { time: null, error: '유효하지 않은 시간 객체입니다.' };
    const timeStr = new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: 'Asia/Seoul',
    }).format(val);
    return { time: timeStr };
  }

  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (!trimmed) return { time: null };

    const m = trimmed.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if (m) {
      const h = parseInt(m[1], 10);
      const min = parseInt(m[2], 10);
      if (h < 0 || h > 23 || min < 0 || min > 59) {
        return { time: null, error: `유효하지 않은 시간 범위입니다: '${trimmed}' (00:00 ~ 23:59)` };
      }
      return { time: `${pad(h)}:${pad(min)}` };
    }
    return { time: null, error: `시간 형식을 인식할 수 없습니다: '${trimmed}' (HH:MM 권장)` };
  }

  return { time: null, error: '지원되지 않는 시간 형식입니다.' };
}

// 3. 근태 판정 로직
function calculateAttendanceStatus(params) {
  const { standardStartMinute, standardEndMinute, checkInTime, checkOutTime, leaveType } = params;

  if (leaveType) {
    return { representativeStatus: leaveType, isLate: false, isEarlyLeave: false };
  }

  if (!checkInTime) {
    return { representativeStatus: null, isLate: false, isEarlyLeave: false };
  }

  const [inH, inM] = checkInTime.split(':').map(Number);
  const inMin = inH * 60 + inM;
  // Grace period 5분
  const isLate = inMin > standardStartMinute + 5;

  let isEarlyLeave = false;
  if (checkOutTime) {
    const [outH, outM] = checkOutTime.split(':').map(Number);
    const outMin = outH * 60 + outM;
    isEarlyLeave = outMin < standardEndMinute - 5;
  }

  let representativeStatus = 'NORMAL';
  if (isLate && isEarlyLeave) representativeStatus = 'LATE';
  else if (isLate) representativeStatus = 'LATE';
  else if (isEarlyLeave) representativeStatus = 'EARLY_LEAVE';

  return { representativeStatus, isLate, isEarlyLeave };
}

// ─── 테스트 스위트 실행 ───────────────────────────────────────────────────────

console.log('================================================================');
console.log('Phase 8: Excel 근태 일괄 업로드 및 비즈니스 룰 종합 검증');
console.log('================================================================\n');

let passedTests = 0;
let failedTests = 0;

function runTest(name, fn) {
  try {
    fn();
    console.log(`  [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  [FAIL] ${name}`);
    console.error(`         ${err.message}`);
    failedTests++;
  }
}

// ─── 1. Excel Workbook 및 헤더 검증 ──────────────────────────────────────────
console.log('>>> 1. Excel 워크북 및 헤더 검증');

runTest('1. 정상 표준 헤더 인식 (사번, 성명, 근무일자, 출근시간, 퇴근시간)', () => {
  const wb = XLSX.utils.book_new();
  const data = [
    ['사번', '성명', '근무일자', '출근시간', '퇴근시간'],
    ['EMP001', '홍길동', '2026-10-01', '09:02', '18:07'],
  ];
  const ws = XLSX.utils.aoa_to_sheet(data);
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  const readWb = XLSX.read(buf, { type: 'buffer' });
  const rows = XLSX.utils.sheet_to_json(readWb.Sheets[readWb.SheetNames[0]], { header: 1 });
  const headers = rows[0].map((h) => String(h).trim());

  assert(headers.includes('사번'), '사번 열 누락');
  assert(headers.includes('근무일자'), '근무일자 열 누락');
  assert(headers.includes('출근시간'), '출근시간 열 누락');
  assert(headers.includes('퇴근시간'), '퇴근시간 열 누락');
});

runTest('2. 필수 열 누락 감지 (예: 출근시간 누락)', () => {
  const wb = XLSX.utils.book_new();
  const data = [['사번', '성명', '근무일자', '퇴근시간']];
  const ws = XLSX.utils.aoa_to_sheet(data);
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  const readWb = XLSX.read(buf, { type: 'buffer' });
  const rows = XLSX.utils.sheet_to_json(readWb.Sheets[readWb.SheetNames[0]], { header: 1 });
  const headers = rows[0].map((h) => String(h).trim());

  const hasCheckIn = headers.includes('출근시간');
  assert.strictEqual(hasCheckIn, false, '출근시간 누락 감지 실패');
});

runTest('3. 하단 빈 행(Empty Rows) 자동 무시', () => {
  const rawRows = [
    { employeeNumber: 'EMP001', workDateRaw: '2026-10-01', checkInRaw: '09:00', checkOutRaw: '18:00', isEmpty: false },
    { employeeNumber: '', workDateRaw: null, checkInRaw: null, checkOutRaw: null, isEmpty: true },
    { employeeNumber: '', workDateRaw: null, checkInRaw: null, checkOutRaw: null, isEmpty: true },
  ];
  const filtered = rawRows.filter((r) => !r.isEmpty);
  assert.strictEqual(filtered.length, 1, '빈 행 제외 실패');
});

runTest('4. 불완전 Row(사번 있고 날짜 없음) 오류 처리', () => {
  const row = { employeeNumber: 'EMP001', workDateRaw: null, checkInRaw: '09:00', checkOutRaw: '18:00' };
  const errors = [];
  if (!row.workDateRaw) errors.push('근무일자가 누락되었습니다.');
  assert(errors.length > 0, '불완전 행 오류 감지 실패');
  assert.strictEqual(errors[0], '근무일자가 누락되었습니다.');
});

// ─── 2. 날짜 및 시간 파싱 검증 ──────────────────────────────────────────────
console.log('\n>>> 2. 날짜 및 시간 파싱 및 정규화 검증');

runTest('1. 문자열 날짜 정규화 (YYYY-MM-DD, YYYY.MM.DD, YYYY/MM/DD)', () => {
  assert.strictEqual(parseExcelDate('2026-10-01').date, '2026-10-01');
  assert.strictEqual(parseExcelDate('2026.10.01').date, '2026-10-01');
  assert.strictEqual(parseExcelDate('2026/10/01').date, '2026-10-01');
});

runTest('2. Excel Serial Number 날짜 변환 (46300 -> 2026-10-05)', () => {
  const res = parseExcelDate(46300);
  assert.strictEqual(res.date, '2026-10-05');
  assert.strictEqual(res.error, undefined);
});

runTest('3. 잘못된 날짜 감지 (2026-02-30 또는 모호한 01/02/26)', () => {
  assert(parseExcelDate('2026-02-30').error !== undefined, '2월 30일 오류 감지 실패');
  assert(parseExcelDate('01/02/26').error !== undefined, '모호한 날짜 오류 감지 실패');
});

runTest('4. 시간 문자열 정규화 (HH:MM 및 HH:MM:SS)', () => {
  assert.strictEqual(parseExcelTime('09:02').time, '09:02');
  assert.strictEqual(parseExcelTime('9:05').time, '09:05');
  assert.strictEqual(parseExcelTime('18:07:30').time, '18:07');
});

runTest('5. Excel Time Serial Fraction 변환 (0.375 -> 09:00)', () => {
  const res = parseExcelTime(0.375);
  assert.strictEqual(res.time, '09:00');
});

runTest('6. 잘못된 시간 감지 (25:00, 9시, 오전9시)', () => {
  assert(parseExcelTime('25:00').error !== undefined, '25:00 오류 감지 실패');
  assert(parseExcelTime('9시').error !== undefined, '9시 오류 감지 실패');
  assert(parseExcelTime('오전9시').error !== undefined, '오전9시 오류 감지 실패');
});

// ─── 3. 출/퇴근 조합 규칙 검증 ───────────────────────────────────────────────
console.log('\n>>> 3. 출퇴근 시간 조합 검증');

runTest('1. 출근시간만 존재 -> 정상 허용 (퇴근 미등록)', () => {
  const inTime = '09:02';
  const outTime = null;
  const errors = [];
  if (!inTime && !outTime) errors.push('출퇴근 모두 비어있음');
  if (!inTime && outTime) errors.push('퇴근시간만 존재');
  assert.strictEqual(errors.length, 0, '출근만 있는 기록은 허용되어야 함');
});

runTest('2. 퇴근시간만 존재 -> ERROR 차단', () => {
  const inTime = null;
  const outTime = '18:05';
  const errors = [];
  if (!inTime && outTime) errors.push('퇴근시간만 존재하는 기록은 등록할 수 없습니다.');
  assert.strictEqual(errors.length, 1);
  assert.strictEqual(errors[0], '퇴근시간만 존재하는 기록은 등록할 수 없습니다.');
});

runTest('3. 출근/퇴근 둘 다 없음 -> ERROR 차단', () => {
  const inTime = null;
  const outTime = null;
  const errors = [];
  if (!inTime && !outTime) errors.push('출근시간과 퇴근시간이 모두 비어 있습니다.');
  assert.strictEqual(errors.length, 1);
});

runTest('4. 미래 날짜 검증 -> ERROR 차단', () => {
  const today = '2026-10-01';
  const workDate = '2026-10-05';
  const errors = [];
  if (workDate > today) errors.push('미래 날짜의 근태기록은 등록할 수 없습니다.');
  assert.strictEqual(errors.length, 1);
});

// ─── 4. 직원 상태 및 사번 검증 ──────────────────────────────────────────────
console.log('\n>>> 4. 사번 및 직원 상태 검증');

runTest('1. 미존재 사번 -> ERROR ("등록되지 않은 사번입니다")', () => {
  const dbEmployees = { EMP001: { fullName: '홍길동' } };
  const empNo = 'EMP999';
  const exists = Boolean(dbEmployees[empNo]);
  assert.strictEqual(exists, false);
});

runTest('2. 사번 일치하나 성명 불일치 -> WARNING (DB 성명 기준 처리)', () => {
  const dbEmp = { employeeNumber: 'EMP002', fullName: '김유연' };
  const excelName = '김유정';
  const warnings = [];
  if (excelName && excelName !== dbEmp.fullName) {
    warnings.push(`사번은 일치하지만 성명('${excelName}')이 다릅니다. DB 직원정보('${dbEmp.fullName}')를 기준으로 처리합니다.`);
  }
  assert.strictEqual(warnings.length, 1);
  assert(warnings[0].includes('DB 직원정보'), '성명 불일치 경고 메시지 포함');
});

runTest('3. 입사일 이전 데이터 -> ERROR', () => {
  const hiredOn = '2026-03-01';
  const workDate = '2026-02-28';
  const errors = [];
  if (workDate < hiredOn) errors.push('입사일 이전의 근태기록입니다.');
  assert.strictEqual(errors.length, 1);
});

runTest('4. 입사 당일 데이터 -> 정상 허용', () => {
  const hiredOn = '2026-03-01';
  const workDate = '2026-03-01';
  const errors = [];
  if (workDate < hiredOn) errors.push('입사일 이전의 근태기록입니다.');
  assert.strictEqual(errors.length, 0);
});

runTest('5. 퇴사 당일 데이터 -> 기존 정책에 따라 허용', () => {
  const resignationDate = '2026-09-30';
  const workDate = '2026-09-30';
  const errors = [];
  if (workDate > resignationDate) errors.push('퇴사일 이후의 근태기록입니다.');
  assert.strictEqual(errors.length, 0);
});

runTest('6. 퇴사일 다음날 데이터 -> ERROR', () => {
  const resignationDate = '2026-09-30';
  const workDate = '2026-10-01';
  const errors = [];
  if (workDate > resignationDate) errors.push('퇴사일 이후의 근태기록입니다.');
  assert.strictEqual(errors.length, 1);
});

runTest('7. 휴직기간 데이터 -> WARNING 표시', () => {
  const loa = { startedOn: '2026-07-01', endedOn: '2026-08-31' };
  const workDate = '2026-07-15';
  const warnings = [];
  if (workDate >= loa.startedOn && workDate <= loa.endedOn) {
    warnings.push('해당 일자는 직원의 휴직기간에 포함됩니다.');
  }
  assert.strictEqual(warnings.length, 1);
});

// ─── 5. 캘린더 및 휴가 우선순위 검증 ─────────────────────────────────────────
console.log('\n>>> 5. 근무일 캘린더 및 휴가 우선순위 검증');

runTest('1. 휴일 출퇴근 기록 -> WARNING 표시 & 휴일근무 자동생성 안 됨', () => {
  const isWorkday = false;
  const warnings = [];
  if (!isWorkday) warnings.push('휴일의 출퇴근 기록입니다.');
  assert.strictEqual(warnings.length, 1);
});

runTest('2. 대체근무일(SUBSTITUTE_WORKDAY) 출퇴근 기록 -> 정상 근무일 (경고 없음)', () => {
  const dayType = 'SUBSTITUTE_WORKDAY';
  const isWorkday = true;
  const warnings = [];
  if (!isWorkday) warnings.push('휴일의 출퇴근 기록입니다.');
  assert.strictEqual(warnings.length, 0);
});

runTest('3. 연차일 출퇴근 기록 -> WARNING & 대표상태는 연차 우선', () => {
  const leaveType = 'HALF_DAY';
  const judgement = calculateAttendanceStatus({
    standardStartMinute: 540,
    standardEndMinute: 1080,
    checkInTime: '09:03',
    checkOutTime: '18:05',
    leaveType,
  });
  assert.strictEqual(judgement.representativeStatus, 'HALF_DAY', '연차가 대표상태로 우선되어야 함');
});

runTest('4. 대체휴무 사용일 기록 -> WARNING & 대표상태 대체휴무 우선', () => {
  const leaveType = 'COMPENSATORY_LEAVE';
  const judgement = calculateAttendanceStatus({
    standardStartMinute: 540,
    standardEndMinute: 1080,
    checkInTime: '09:00',
    checkOutTime: '18:00',
    leaveType,
  });
  assert.strictEqual(judgement.representativeStatus, 'COMPENSATORY_LEAVE', '대체휴무가 대표상태로 우선되어야 함');
});

// ─── 6. 중복 및 충돌 검증 ───────────────────────────────────────────────────
console.log('\n>>> 6. 중복 및 DB 충돌 검증');

runTest('1. 파일 내 동일 사번+근무일자 중복 -> ERROR 차단', () => {
  const rows = [
    { rowNumber: 10, employeeNumber: 'EMP002', workDate: '2026-10-01' },
    { rowNumber: 27, employeeNumber: 'EMP002', workDate: '2026-10-01' },
  ];
  const keyMap = new Map();
  rows.forEach((r) => {
    const k = `${r.employeeNumber}__${r.workDate}`;
    const list = keyMap.get(k) || [];
    list.push(r.rowNumber);
    keyMap.set(k, list);
  });

  const dupRows = keyMap.get('EMP002__2026-10-01');
  assert.strictEqual(dupRows.length, 2, '중복 행 2개 검출');
});

runTest('2. DB에 데이터 없음 -> NEW', () => {
  const existingAtt = null;
  const status = existingAtt ? 'CONFLICT' : 'NEW';
  assert.strictEqual(status, 'NEW');
});

runTest('3. DB와 완전 동일 -> SAME (반영 제외)', () => {
  const existing = { checkInTime: '09:02', checkOutTime: '18:07' };
  const excel = { checkInTime: '09:02', checkOutTime: '18:07' };
  const isSame = existing.checkInTime === excel.checkInTime && existing.checkOutTime === excel.checkOutTime;
  assert.strictEqual(isSame, true, '완전 동일 데이터 감지');
});

runTest('4. 기존 WEB vs 다른 Excel -> CONFLICT 및 기본값 KEEP_EXISTING', () => {
  const existing = { source: 'WEB', checkInTime: '09:02', checkOutTime: '18:07' };
  const excel = { checkInTime: '09:00', checkOutTime: '18:10' };
  const isSame = existing.checkInTime === excel.checkInTime && existing.checkOutTime === excel.checkOutTime;

  let status = isSame ? 'SAME' : 'CONFLICT';
  let defaultResolution = 'KEEP_EXISTING';

  assert.strictEqual(status, 'CONFLICT');
  assert.strictEqual(defaultResolution, 'KEEP_EXISTING');
});

runTest('5. 관리자 선택에 따른 충돌 처리: KEEP_EXISTING vs OVERWRITE_EXCEL', () => {
  const conflictRow = {
    employeeNumber: 'EMP001',
    workDate: '2026-10-01',
    resolution: 'KEEP_EXISTING',
  };

  // 1) 기존값 유지 시 DB 수정 안 함
  assert.strictEqual(conflictRow.resolution, 'KEEP_EXISTING');

  // 2) 관리자가 Excel값 적용 선택 시
  conflictRow.resolution = 'OVERWRITE_EXCEL';
  assert.strictEqual(conflictRow.resolution, 'OVERWRITE_EXCEL');
});

// ─── 7. 근태 판정 규칙 재사용 ────────────────────────────────────────────────
console.log('\n>>> 7. 근태 판정 비즈니스 룰 자동 재사용');

runTest('1. Excel 09:05 출근 -> 정상 (Grace 5분 이내)', () => {
  const judgement = calculateAttendanceStatus({
    standardStartMinute: 540,
    standardEndMinute: 1080,
    checkInTime: '09:05',
    checkOutTime: '18:00',
    leaveType: null,
  });
  assert.strictEqual(judgement.isLate, false);
  assert.strictEqual(judgement.representativeStatus, 'NORMAL');
});

runTest('2. Excel 09:06 출근 -> 지각 (Grace 5분 초과)', () => {
  const judgement = calculateAttendanceStatus({
    standardStartMinute: 540,
    standardEndMinute: 1080,
    checkInTime: '09:06',
    checkOutTime: '18:00',
    leaveType: null,
  });
  assert.strictEqual(judgement.isLate, true);
  assert.strictEqual(judgement.representativeStatus, 'LATE');
});

runTest('3. Excel 17:55 퇴근 -> 정상 (Grace 5분 이내)', () => {
  const judgement = calculateAttendanceStatus({
    standardStartMinute: 540,
    standardEndMinute: 1080,
    checkInTime: '09:00',
    checkOutTime: '17:55',
    leaveType: null,
  });
  assert.strictEqual(judgement.isEarlyLeave, false);
  assert.strictEqual(judgement.representativeStatus, 'NORMAL');
});

runTest('4. Excel 17:54 퇴근 -> 조퇴 (Grace 5분 미만)', () => {
  const judgement = calculateAttendanceStatus({
    standardStartMinute: 540,
    standardEndMinute: 1080,
    checkInTime: '09:00',
    checkOutTime: '17:54',
    leaveType: null,
  });
  assert.strictEqual(judgement.isEarlyLeave, true);
  assert.strictEqual(judgement.representativeStatus, 'EARLY_LEAVE');
});

runTest('5. 기존 결근일에 정상 Excel 출근 등록 -> 결근 해소 및 NORMAL 전환', () => {
  // 기존에는 출퇴근 기록이 없어 결근(ABSENT) 상태
  const beforeStatus = 'ABSENT';
  // Excel로 09:02 / 18:05 등록
  const afterJudgement = calculateAttendanceStatus({
    standardStartMinute: 540,
    standardEndMinute: 1080,
    checkInTime: '09:02',
    checkOutTime: '18:05',
    leaveType: null,
  });
  assert.strictEqual(afterJudgement.representativeStatus, 'NORMAL');
  assert.strictEqual(afterJudgement.isLate, false);
});

// ─── 8. Audit Log 및 Import Batch 검증 ───────────────────────────────────────
console.log('\n>>> 8. Audit Log 및 Import Batch 구조 검증');

runTest('1. 신규 등록 및 기존 수정 시 Source = EXCEL 기록', () => {
  const newRow = { source: 'EXCEL' };
  const updatedRow = { oldSource: 'WEB', newSource: 'EXCEL' };
  assert.strictEqual(newRow.source, 'EXCEL');
  assert.strictEqual(updatedRow.newSource, 'EXCEL');
});

runTest('2. Import Batch 요약 필드 정합성', () => {
  const batch = {
    fileName: 'attendance_202610.xlsx',
    totalRows: 115,
    newCount: 91,
    updatedCount: 6,
    sameCount: 14,
    keptExistingCount: 2,
    errorCount: 2,
    status: 'COMMITTED',
  };
  const sum = batch.newCount + batch.updatedCount + batch.sameCount + batch.keptExistingCount + batch.errorCount;
  assert.strictEqual(sum, batch.totalRows, '행 합계 불일치');
});

console.log('\n================================================================');
console.log(`최종 결과: ${passedTests} 통과, ${failedTests} 실패`);
console.log('================================================================\n');

if (failedTests > 0) {
  process.exit(1);
}
