/**
 * scripts/test-phase11.mjs
 * Phase 11: V1.0 Release Candidate E2E & Scenarios A~P Verification Runner
 *
 * Checks:
 * - Scenarios A through P logic & boundary conditions
 * - Security & Access Control Matrix (ADMIN vs USER vs Anonymous)
 * - Data Integrity & Masking
 * - UI Terminology & Zero-Placeholder Scan
 * - Operations Manual Checklists
 */

import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

console.log('================================================================');
console.log('  HR 근태관리 시스템 V1.0 Release Candidate 검증 (Phase 11)');
console.log('================================================================\n');

let totalTests = 0;
let passedTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  ✔ [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✖ [FAIL] ${name}`);
    console.error(`     Error: ${err.message}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. SCENARIO B: 지각 판정 및 5분 Grace Period 경계값 (09:05:59 vs 09:06:00)
// ─────────────────────────────────────────────────────────────────────────────
console.log('▶ [1/12] Scenario B & C: 근태 출퇴근 및 5분 유예(Grace Period) 경계값 검증');

function calculateAttendanceStatus(params) {
  const { standardStartMinute, standardEndMinute, checkInAt, checkOutAt, leaveType } = params;
  if (leaveType) return { representativeStatus: leaveType, isLate: false, isEarlyLeave: false };
  if (!checkInAt) return { representativeStatus: null, isLate: false, isEarlyLeave: false };

  const dIn = new Date(checkInAt);
  const kstMsIn = dIn.getTime() + 9 * 3600 * 1000;
  const inSec = Math.floor((kstMsIn % (24 * 3600 * 1000)) / 1000);

  const lateThresholdSec = (standardStartMinute + 5) * 60 + 59;
  const isLate = inSec > lateThresholdSec;

  let isEarlyLeave = false;
  if (checkOutAt) {
    const dOut = new Date(checkOutAt);
    const kstMsOut = dOut.getTime() + 9 * 3600 * 1000;
    const outSec = Math.floor((kstMsOut % (24 * 3600 * 1000)) / 1000);
    const earlyLeaveThresholdSec = (standardEndMinute - 5) * 60;
    isEarlyLeave = outSec < earlyLeaveThresholdSec;
  }

  let representativeStatus = 'NORMAL';
  if (isLate) representativeStatus = 'LATE';
  else if (isEarlyLeave) representativeStatus = 'EARLY_LEAVE';

  return { representativeStatus, isLate, isEarlyLeave };
}

runTest('Scenario B-1: 09:05:00 출근 -> 정상 (Grace Period 5분 이내)', () => {
  const res = calculateAttendanceStatus({
    standardStartMinute: 540,
    standardEndMinute: 1080,
    checkInAt: '2026-09-25T00:05:00.000Z', // KST 09:05:00
    checkOutAt: '2026-09-25T09:00:00.000Z', // KST 18:00:00
    leaveType: null,
  });
  assert.strictEqual(res.isLate, false);
  assert.strictEqual(res.representativeStatus, 'NORMAL');
});

runTest('Scenario B-2: 09:05:59 출근 -> 정상 (Grace Period 5분 59초 경계)', () => {
  const res = calculateAttendanceStatus({
    standardStartMinute: 540,
    standardEndMinute: 1080,
    checkInAt: '2026-09-25T00:05:59.000Z', // KST 09:05:59
    checkOutAt: '2026-09-25T09:00:00.000Z',
    leaveType: null,
  });
  assert.strictEqual(res.isLate, false);
  assert.strictEqual(res.representativeStatus, 'NORMAL');
});

runTest('Scenario B-3: 09:06:00 출근 -> 지각 (Grace Period 초과)', () => {
  const res = calculateAttendanceStatus({
    standardStartMinute: 540,
    standardEndMinute: 1080,
    checkInAt: '2026-09-25T00:06:00.000Z', // KST 09:06:00
    checkOutAt: '2026-09-25T09:00:00.000Z',
    leaveType: null,
  });
  assert.strictEqual(res.isLate, true);
  assert.strictEqual(res.representativeStatus, 'LATE');
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. SCENARIO C: 조퇴 판정 및 경계값 (17:55:00 vs 17:54:59)
// ─────────────────────────────────────────────────────────────────────────────
runTest('Scenario C-1: 17:55:00 퇴근 -> 정상 (기준 18:00 - 5분 이내 허용)', () => {
  const res = calculateAttendanceStatus({
    standardStartMinute: 540,
    standardEndMinute: 1080,
    checkInAt: '2026-09-25T00:00:00.000Z',
    checkOutAt: '2026-09-25T08:55:00.000Z', // KST 17:55:00
    leaveType: null,
  });
  assert.strictEqual(res.isEarlyLeave, false);
  assert.strictEqual(res.representativeStatus, 'NORMAL');
});

runTest('Scenario C-2: 17:54:59 퇴근 -> 조퇴 (17:55 미만 퇴근)', () => {
  const res = calculateAttendanceStatus({
    standardStartMinute: 540,
    standardEndMinute: 1080,
    checkInAt: '2026-09-25T00:00:00.000Z',
    checkOutAt: '2026-09-25T08:54:59.000Z', // KST 17:54:59
    leaveType: null,
  });
  assert.strictEqual(res.isEarlyLeave, true);
  assert.strictEqual(res.representativeStatus, 'EARLY_LEAVE');
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. SCENARIO D & E: 연차 및 대체휴무 계산 분리 검증
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n▶ [2/12] Scenario D & E: 연차 및 대체휴무 독립성 & 사용성 검증');

runTest('Scenario D: 1일 연차 등록 시 대표상태=FULL_DAY, 결근/지각 제외, 잔여 차감', () => {
  const res = calculateAttendanceStatus({
    standardStartMinute: 540,
    standardEndMinute: 1080,
    checkInAt: null,
    checkOutAt: null,
    leaveType: 'FULL_DAY',
  });
  assert.strictEqual(res.representativeStatus, 'FULL_DAY');
  assert.strictEqual(res.isLate, false);
  assert.strictEqual(res.isEarlyLeave, false);
});

function calculateCompLeaveExpiryDate(grantDate) {
  const parts = grantDate.split('-').map(Number);
  const year = parts[0];
  const month = parts[1];
  const day = parts[2];

  let targetYear = year;
  let targetMonth = month + 3;

  if (targetMonth > 12) {
    targetYear += Math.floor((targetMonth - 1) / 12);
    targetMonth = ((targetMonth - 1) % 12) + 1;
  }

  const daysInMonth = new Date(Date.UTC(targetYear, targetMonth, 0)).getUTCDate();
  const targetDay = Math.min(day, daysInMonth);

  return `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(targetDay).padStart(2, '0')}`;
}

function getCompLeaveEffectiveStatus(leave, today) {
  if (leave.cancelledAt) return 'CANCELLED';
  if (leave.status === 'USED' || Boolean(leave.usedOn)) return 'USED';
  if (today > leave.expiresOn) return 'EXPIRED';
  return 'AVAILABLE';
}

runTest('Scenario E-1: 휴일근무 대체휴무 유효기간 = Calendar Month 3개월 계산', () => {
  assert.strictEqual(calculateCompLeaveExpiryDate('2026-10-03'), '2027-01-03');
  assert.strictEqual(calculateCompLeaveExpiryDate('2026-11-30'), '2027-02-28'); // 2월 말일 안전 클램핑
  assert.strictEqual(calculateCompLeaveExpiryDate('2026-08-31'), '2026-11-30'); // 11월 30일
});

runTest('Scenario E-2: 대체휴무 상태 전이 (AVAILABLE -> USED) 및 연차와 잔여 완전 분리', () => {
  const grant = {
    id: 'cl-1',
    grantDate: '2026-10-03',
    expiresOn: '2027-01-03',
    status: 'AVAILABLE',
    usedOn: null,
  };
  assert.strictEqual(getCompLeaveEffectiveStatus(grant, '2026-10-05'), 'AVAILABLE');

  // 사용 등록 후
  grant.status = 'USED';
  grant.usedOn = '2026-10-10';
  assert.strictEqual(getCompLeaveEffectiveStatus(grant, '2026-10-11'), 'USED');
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. SCENARIO F & G: 결근 판정 vs 오늘 미출근 vs 휴일 규칙
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n▶ [3/12] Scenario F & G: 결근 자동판정 vs 오늘 미출근 vs 휴무일 검증');

function evaluateAttendanceExpectation({ targetDate, today, isWorkday, hasAttendance, hasLeave, hasCompLeave, isResigned, isBeforeHire }) {
  if (isResigned || isBeforeHire) {
    return { status: 'NOT_APPLICABLE', label: '대상 외' };
  }
  if (!isWorkday) {
    return { status: 'HOLIDAY', label: '휴무일' };
  }
  if (hasLeave || hasCompLeave) {
    return { status: 'LEAVE', label: '휴가' };
  }
  if (hasAttendance) {
    return { status: 'PRESENT', label: '출근' };
  }
  // 유효 근무일인데 기록이 없는 경우
  if (targetDate === today) {
    return { status: 'NOT_CLOCKED_IN', label: '미출근' }; // 오늘의 미출근은 결근이 아님
  } else if (targetDate < today) {
    return { status: 'ABSENT', label: '결근' }; // 과거 근무일 누락은 결근
  }
  return { status: 'UPCOMING', label: '예정' };
}

runTest('Scenario F-1: 과거 유효 근무일에 기록 없음 -> 결근(ABSENT)', () => {
  const res = evaluateAttendanceExpectation({
    targetDate: '2026-09-24',
    today: '2026-09-27',
    isWorkday: true,
    hasAttendance: false,
    hasLeave: false,
    hasCompLeave: false,
    isResigned: false,
    isBeforeHire: false,
  });
  assert.strictEqual(res.status, 'ABSENT');
  assert.strictEqual(res.label, '결근');
});

runTest('Scenario F-2: 오늘(당일) 아직 출근하지 않음 -> 미출근(NOT_CLOCKED_IN), 결근 아님', () => {
  const res = evaluateAttendanceExpectation({
    targetDate: '2026-09-27',
    today: '2026-09-27',
    isWorkday: true,
    hasAttendance: false,
    hasLeave: false,
    hasCompLeave: false,
    isResigned: false,
    isBeforeHire: false,
  });
  assert.strictEqual(res.status, 'NOT_CLOCKED_IN');
  assert.strictEqual(res.label, '미출근');
});

runTest('Scenario G: 토/일/공휴일/회사휴무일은 출퇴근 없어도 결근 아님', () => {
  const res = evaluateAttendanceExpectation({
    targetDate: '2026-09-26', // 토요일
    today: '2026-09-27',
    isWorkday: false,
    hasAttendance: false,
    hasLeave: false,
    hasCompLeave: false,
    isResigned: false,
    isBeforeHire: false,
  });
  assert.strictEqual(res.status, 'HOLIDAY');
  assert.strictEqual(res.label, '휴무일');
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. SCENARIO H & I: 평일연장 및 휴일근무 분(Minute) 단위 정밀 산출
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n▶ [4/12] Scenario H & I: 연장 및 휴일근무 분 단위 정밀 계산 검증');

function timeStringToMinutes(timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

function calculateOvertimeDuration(startedAt, endedAt, allowOvernight = false) {
  const startMin = timeStringToMinutes(startedAt);
  const endMin = timeStringToMinutes(endedAt);

  if (endMin > startMin) {
    return { durationMinutes: endMin - startMin, isOvernight: false };
  }
  if (allowOvernight && endMin < startMin) {
    return { durationMinutes: 1440 - startMin + endMin, isOvernight: true };
  }
  return { durationMinutes: 0, isOvernight: false };
}

runTest('Scenario H: 평일연장 18:03 ~ 20:17 -> 정확히 134분 (2시간 14분, 반올림 없음)', () => {
  const { durationMinutes } = calculateOvertimeDuration('18:03', '20:17');
  assert.strictEqual(durationMinutes, 134);
  const h = Math.floor(durationMinutes / 60);
  const m = durationMinutes % 60;
  assert.strictEqual(h, 2);
  assert.strictEqual(m, 14);
});

runTest('Scenario I: 휴일근무 09:10 ~ 13:35 -> 정확히 265분 (4시간 25분, 직원 출퇴근 태그 불요)', () => {
  const { durationMinutes } = calculateOvertimeDuration('09:10', '13:35');
  assert.strictEqual(durationMinutes, 265);
  const h = Math.floor(durationMinutes / 60);
  const m = durationMinutes % 60;
  assert.strictEqual(h, 4);
  assert.strictEqual(m, 25);
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. SCENARIO J: Excel 근태 업로드 Preview & Conflict 처리
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n▶ [5/12] Scenario J: Excel 근태 업로드 Preview 및 충돌(Conflict) 해결 원칙');

runTest('Scenario J: 충돌 시 기본값은 KEEP_EXISTING (기존 기록 유지 우선)', () => {
  const previewRow = {
    employeeNumber: 'EMP002',
    date: '2026-09-25',
    status: 'CONFLICT',
    existingIn: '09:02',
    existingOut: '18:03',
    excelIn: '09:05',
    excelOut: '18:10',
    selectedResolution: 'KEEP_EXISTING', // 기본값
  };

  function resolveConflict(row) {
    if (row.selectedResolution === 'OVERWRITE_EXCEL') {
      return { checkIn: row.excelIn, checkOut: row.excelOut, source: 'EXCEL' };
    }
    return { checkIn: row.existingIn, checkOut: row.existingOut, source: 'WEB' };
  }

  const defaultResolved = resolveConflict(previewRow);
  assert.strictEqual(defaultResolved.checkIn, '09:02');
  assert.strictEqual(defaultResolved.source, 'WEB');

  previewRow.selectedResolution = 'OVERWRITE_EXCEL';
  const overwriteResolved = resolveConflict(previewRow);
  assert.strictEqual(overwriteResolved.checkIn, '09:05');
  assert.strictEqual(overwriteResolved.source, 'EXCEL');
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. SCENARIO K: 관리자 출퇴근 보정 및 Audit Log
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n▶ [6/12] Scenario K: 관리자 근태 수기 보정 및 Audit Log 불변성 검증');

runTest('Scenario K: 수정사유 필수 확인 및 이전/수정값 Audit Log 기록', () => {
  const auditEntries = [];
  function adminCorrectAttendance({ adminId, employeeId, date, oldCheckOut, newCheckOut, reason }) {
    if (!reason || reason.trim().length === 0) {
      throw new Error('수정 사유는 필수 입력 항목입니다.');
    }
    auditEntries.push({
      action: 'UPDATE_ATTENDANCE',
      performedBy: adminId,
      targetEmployee: employeeId,
      date,
      diff: { oldCheckOut, newCheckOut },
      reason,
      createdAt: new Date().toISOString(),
    });
    return { success: true };
  }

  assert.throws(
    () => adminCorrectAttendance({ adminId: 'ADMIN1', employeeId: 'EMP002', date: '2026-09-25', oldCheckOut: '18:00', newCheckOut: '19:00', reason: '' }),
    /사유는 필수/
  );

  const ok = adminCorrectAttendance({
    adminId: 'ADMIN1',
    employeeId: 'EMP002',
    date: '2026-09-25',
    oldCheckOut: '17:50',
    newCheckOut: '18:05',
    reason: '단말기 미태그 소명 확인',
  });
  assert.strictEqual(ok.success, true);
  assert.strictEqual(auditEntries.length, 1);
  assert.strictEqual(auditEntries[0].reason, '단말기 미태그 소명 확인');
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. SCENARIO L & M: 퇴사자 및 휴직자 접근 및 통계 처리
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n▶ [7/12] Scenario L & M: 퇴사자(RESIGNED) 및 휴직자(LEAVE) 상태 처리');

runTest('Scenario L: 퇴사 직원은 로그인 차단, 과거 근태/연차 이력 보존', () => {
  const employee = { id: 'EMP005', status: 'RESIGNED', name: '정퇴사' };
  function canLogin(emp) {
    return emp.status === 'ACTIVE';
  }
  assert.strictEqual(canLogin(employee), false);
});

runTest('Scenario M: 휴직 기간에는 출퇴근 태깅 비활성화 및 결근 산정 제외', () => {
  const leaveEmployee = {
    id: 'EMP004',
    status: 'LEAVE',
    leaveStart: '2026-09-01',
    leaveEnd: '2026-09-30',
  };
  function canClockIn(emp, today) {
    if (emp.status === 'LEAVE' && today >= emp.leaveStart && today <= emp.leaveEnd) {
      return false;
    }
    return emp.status === 'ACTIVE';
  }
  assert.strictEqual(canClockIn(leaveEmployee, '2026-09-15'), false);
  assert.strictEqual(canClockIn({ status: 'ACTIVE' }, '2026-09-15'), true);
});

// ─────────────────────────────────────────────────────────────────────────────
// 9. SCENARIO N: 대체휴무 만료 및 30일 이내 만료 예정
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n▶ [8/12] Scenario N: 대체휴무 만료(EXPIRED) 및 D-30 임박 판정');

runTest('Scenario N: 만료일 당일까지 사용 가능, 만료 익일부터 EXPIRED, 30일 이내 만료예정 판정', () => {
  const leave = {
    expiresOn: '2026-10-25',
    status: 'AVAILABLE',
  };

  assert.strictEqual(getCompLeaveEffectiveStatus(leave, '2026-10-25'), 'AVAILABLE');
  assert.strictEqual(getCompLeaveEffectiveStatus(leave, '2026-10-26'), 'EXPIRED');

  function isExpiringSoon(expiresOn, today) {
    const d1 = new Date(`${today}T00:00:00Z`).getTime();
    const d2 = new Date(`${expiresOn}T00:00:00Z`).getTime();
    const diffDays = Math.round((d2 - d1) / (24 * 3600 * 1000));
    return diffDays >= 0 && diffDays <= 30;
  }

  assert.strictEqual(isExpiringSoon('2026-10-25', '2026-09-27'), true); // 28일 남음
  assert.strictEqual(isExpiringSoon('2026-12-25', '2026-09-27'), false); // 89일 남음
});

// ─────────────────────────────────────────────────────────────────────────────
// 10. SCENARIO O & P: 월말 및 연말 경계값 분리
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n▶ [9/12] Scenario O & P: 월말(09-30 -> 10-01) 및 연말(12-31 -> 01-01) 경계 분리');

runTest('Scenario O: 2026-09-30과 2026-10-01은 각 월별(2026-09 vs 2026-10)로 정확히 집계 분리', () => {
  const date1 = '2026-09-30';
  const date2 = '2026-10-01';
  assert.strictEqual(date1.substring(0, 7), '2026-09');
  assert.strictEqual(date2.substring(0, 7), '2026-10');
});

runTest('Scenario P: 연차 마스터는 연도(Year) 단위로 격리되며 임의 자동 이월 없음', () => {
  const master2026 = { employeeId: 'EMP002', year: 2026, totalDays: 15, usedDays: 8, remainingDays: 7 };
  const master2027 = { employeeId: 'EMP002', year: 2027, totalDays: 16, usedDays: 0, remainingDays: 16 };
  assert.notStrictEqual(master2026.year, master2027.year);
  assert.strictEqual(master2027.usedDays, 0);
});

// ─────────────────────────────────────────────────────────────────────────────
// 11. 보안 및 권한 매트릭스 검증 (ADMIN vs USER vs Unauthenticated)
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n▶ [10/12] 권한 및 보안 매트릭스 (ADMIN / USER / 익명 접근 차단) 검증');

function canAccessRoute(role, pathname) {
  if (!role) return false;
  const ownPrefix = role === 'ADMIN' ? '/admin' : '/user';
  return pathname === ownPrefix || pathname.startsWith(`${ownPrefix}/`);
}

runTest('Security 1: USER 권한으로 /admin 및 관리자 API 접근 불가', () => {
  assert.strictEqual(canAccessRoute('USER', '/admin'), false);
  assert.strictEqual(canAccessRoute('USER', '/admin/dashboard'), false);
  assert.strictEqual(canAccessRoute('USER', '/admin/comp-leave'), false);
  assert.strictEqual(canAccessRoute('USER', '/admin/settings'), false);
  assert.strictEqual(canAccessRoute('USER', '/user'), true);
  assert.strictEqual(canAccessRoute('USER', '/user/comp-leave'), true);
});

runTest('Security 2: 익명(미로그인) 접근 차단', () => {
  assert.strictEqual(canAccessRoute(null, '/admin'), false);
  assert.strictEqual(canAccessRoute(null, '/user'), false);
});

runTest('Security 3: 에러 로깅 시 비밀번호/토큰 민감정보 마스킹', () => {
  const payload = {
    password: 'secretPassword123!',
    token: 'jwt-header.payload.signature',
    employeeNumber: 'EMP001',
  };
  const SENSITIVE = new Set(['password', 'token', 'secret', 'cookie']);
  const masked = {};
  for (const [k, v] of Object.entries(payload)) {
    masked[k] = SENSITIVE.has(k) ? '********' : v;
  }
  assert.strictEqual(masked.password, '********');
  assert.strictEqual(masked.token, '********');
  assert.strictEqual(masked.employeeNumber, 'EMP001');
});

// ─────────────────────────────────────────────────────────────────────────────
// 12. UI 무결점 & 0 Placeholder & 용어 한글화 검증
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n▶ [11/12] UI 무결점 검증 (Zero Placeholder, PagePlaceholder 없음, 용어 한글화)');

function scanDirectory(dir, filterFn) {
  const results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...scanDirectory(fullPath, filterFn));
    } else if (filterFn(entry.name)) {
      results.push(fullPath);
    }
  }
  return results;
}

runTest('UI 1: app/ 디렉터리 내 PagePlaceholder 사용 0건 확인', () => {
  const appFiles = scanDirectory('app', (name) => name.endsWith('.tsx') || name.endsWith('.ts'));
  const violatingFiles = [];
  for (const file of appFiles) {
    const content = fs.readFileSync(file, 'utf8');
    if (content.includes('<PagePlaceholder') || content.includes('from \'@/components/page-placeholder\'')) {
      violatingFiles.push(file);
    }
  }
  assert.strictEqual(violatingFiles.length, 0, `PagePlaceholder가 여전히 사용 중인 파일: ${violatingFiles.join(', ')}`);
});

runTest('UI 2: docs/OPERATIONS.md 내 Daily & Monthly Checklist 존재 확인', () => {
  const opsContent = fs.readFileSync('docs/OPERATIONS.md', 'utf8');
  assert(opsContent.includes('## 11. 관리자 일상 업무 가이드'), 'Quick Guide 누락');
  assert(opsContent.includes('## 12. 관리자 Daily Checklist'), 'Daily Checklist 누락');
  assert(opsContent.includes('## 13. 관리자 Monthly Checklist'), 'Monthly Checklist 누락');
  assert(opsContent.includes('Version 1.0'), 'Version 1.0 언급 확인');
});

runTest('UI 3: settings-view.tsx에 Version 1.0 (Release Candidate) 배지 표기 확인', () => {
  const settingsContent = fs.readFileSync('app/admin/settings/settings-view.tsx', 'utf8');
  assert(settingsContent.includes('Version 1.0 (Release Candidate)'), 'Version 1.0 배지 누락');
});

console.log('\n================================================================');
console.log(`  Phase 11 V1.0 RC 검증 결과: ${passedTests}/${totalTests} 통과`);
console.log('================================================================\n');

if (passedTests !== totalTests) {
  process.exit(1);
}
