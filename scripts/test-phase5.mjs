/**
 * scripts/test-phase5.mjs
 * Phase 5 핵심 알고리즘 단위 및 시나리오 검증:
 * 1) 섹션 34: 근무일 판정 8개 테스트
 * 2) 섹션 35: 결근 판정 15개 테스트
 */

function getDayOfWeekKST(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d, 3, 0, 0));
  return date.getUTCDay();
}

function evaluateWorkday(date, calendarRecord) {
  const dayOfWeek = getDayOfWeekKST(date);
  const isWeekendDay = dayOfWeek === 0 || dayOfWeek === 6;

  if (calendarRecord) {
    const type = calendarRecord.dayType;

    // 1순위: 대체근무일
    if (type === 'SUBSTITUTE_WORKDAY') {
      return {
        date,
        dayType: 'SUBSTITUTE_WORKDAY',
        isWorkday: true,
        name: calendarRecord.name || '대체근무일',
      };
    }

    // 2순위: 회사 지정 휴무일
    if (type === 'COMPANY_HOLIDAY') {
      return {
        date,
        dayType: 'COMPANY_HOLIDAY',
        isWorkday: false,
        name: calendarRecord.name || '회사 휴무일',
      };
    }

    // 3순위: 공휴일
    if (type === 'PUBLIC_HOLIDAY') {
      return {
        date,
        dayType: 'PUBLIC_HOLIDAY',
        isWorkday: false,
        name: calendarRecord.name || '공휴일',
      };
    }

    // 명시적 일반 근무일
    if (type === 'NORMAL_WORKDAY' || type === 'WORKDAY') {
      return {
        date,
        dayType: 'NORMAL_WORKDAY',
        isWorkday: true,
        name: calendarRecord.name || null,
      };
    }

    // 명시적 주말
    if (type === 'WEEKEND') {
      return {
        date,
        dayType: 'WEEKEND',
        isWorkday: false,
        name: calendarRecord.name || (dayOfWeek === 0 ? '일요일' : '토요일'),
      };
    }
  }

  // 4순위: 주말 기본
  if (isWeekendDay) {
    return {
      date,
      dayType: 'WEEKEND',
      isWorkday: false,
      name: dayOfWeek === 0 ? '일요일' : '토요일',
    };
  }

  // 5순위: 월~금 기본
  return {
    date,
    dayType: 'NORMAL_WORKDAY',
    isWorkday: true,
    name: null,
  };
}

function calculateAttendanceStatus(params) {
  const { standardStartMinute, standardEndMinute, checkInAt, checkOutAt, leaveType } = params;
  if (leaveType) return { representativeStatus: leaveType, isLate: false, isEarlyLeave: false };
  if (!checkInAt) return { representativeStatus: null, isLate: false, isEarlyLeave: false };

  // 초 단위 변환
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

function evaluateDailyAttendance(params) {
  const {
    date,
    today,
    hiredOn,
    resignationDate,
    leavePeriods = [],
    effectiveWorkday,
    leaveType,
    checkInAt,
    checkOutAt,
    standardStartMinute,
    standardEndMinute,
  } = params;

  const baseResult = {
    date,
    representativeStatus: null,
    isWorkday: effectiveWorkday.isWorkday,
    dayType: effectiveWorkday.dayType,
    isLate: false,
    isEarlyLeave: false,
    isAbsent: false,
    isNotClockedIn: false,
    leaveType,
    checkInAt,
    checkOutAt,
    dayName: effectiveWorkday.name,
  };

  if (date < hiredOn) return { ...baseResult, isWorkday: false, reason: '입사 전' };
  if (resignationDate && date > resignationDate) return { ...baseResult, isWorkday: false, reason: '퇴사 후' };

  const inLeave = leavePeriods.some(p => p.startedOn <= date && (!p.endedOn || date <= p.endedOn));
  if (inLeave) return { ...baseResult, isWorkday: false, reason: '휴직 기간' };

  if (!effectiveWorkday.isWorkday) {
    if (checkInAt || checkOutAt) return { ...baseResult, reason: '휴일 출근 기록 있음' };
    return baseResult;
  }

  if (leaveType) {
    return {
      ...baseResult,
      representativeStatus: leaveType,
      isLate: false,
      isEarlyLeave: false,
      isAbsent: false,
    };
  }

  if (checkInAt) {
    const j = calculateAttendanceStatus({ standardStartMinute, standardEndMinute, checkInAt, checkOutAt, leaveType: null });
    return {
      ...baseResult,
      representativeStatus: j.representativeStatus,
      isLate: j.isLate,
      isEarlyLeave: j.isEarlyLeave,
      isAbsent: false,
    };
  }

  if (date === today) {
    return { ...baseResult, isNotClockedIn: true, isAbsent: false, representativeStatus: null, reason: '미출근' };
  }
  if (date > today) {
    return { ...baseResult, isAbsent: false, representativeStatus: null, reason: '예정 근무일' };
  }

  return { ...baseResult, isAbsent: true, representativeStatus: 'ABSENT', reason: '결근' };
}

console.log('====================================================');
console.log('Phase 5 핵심 근무일 & 결근 판정 알고리즘 검증 시작');
console.log('====================================================\n');

let passCount = 0;
let failCount = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`[PASS] ${message}`);
    passCount++;
  } else {
    console.error(`[FAIL] ${message}`);
    failCount++;
  }
}

// ─────────────────────────────────────────────────────────────
// 1. 섹션 34: 근무일 판정 검증 (8개)
// ─────────────────────────────────────────────────────────────
console.log('--- [섹션 34: 근무일 판정 8개 검증] ---');

// 1. 월요일 (2026-09-28) -> 근무일
const r1 = evaluateWorkday('2026-09-28', null);
assert(r1.isWorkday === true && r1.dayType === 'NORMAL_WORKDAY', '1. 월요일 -> 정상 근무일 (isWorkday=true)');

// 2. 금요일 (2026-10-02) -> 근무일
const r2 = evaluateWorkday('2026-10-02', null);
assert(r2.isWorkday === true && r2.dayType === 'NORMAL_WORKDAY', '2. 금요일 -> 정상 근무일 (isWorkday=true)');

// 3. 토요일 (2026-09-26) -> 휴일
const r3 = evaluateWorkday('2026-09-26', null);
assert(r3.isWorkday === false && r3.dayType === 'WEEKEND', '3. 토요일 -> 휴일 (isWorkday=false)');

// 4. 일요일 (2026-09-27) -> 휴일
const r4 = evaluateWorkday('2026-09-27', null);
assert(r4.isWorkday === false && r4.dayType === 'WEEKEND', '4. 일요일 -> 휴일 (isWorkday=false)');

// 5. 평일 공휴일 (2026-10-05 월요일 개천절 대체공휴일) -> 휴일
const r5 = evaluateWorkday('2026-10-05', { dayType: 'PUBLIC_HOLIDAY', name: '대체공휴일' });
assert(r5.isWorkday === false && r5.dayType === 'PUBLIC_HOLIDAY', '5. 평일 공휴일 -> 휴일 (isWorkday=false)');

// 6. 평일 회사 휴무일 (2026-12-31 목요일 종무일) -> 휴일
const r6 = evaluateWorkday('2026-12-31', { dayType: 'COMPANY_HOLIDAY', name: '회사 종무일' });
assert(r6.isWorkday === false && r6.dayType === 'COMPANY_HOLIDAY', '6. 평일 회사 휴무일 -> 휴일 (isWorkday=false)');

// 7. 토요일 대체근무일 (2026-10-10 토요일) -> 근무일
const r7 = evaluateWorkday('2026-10-10', { dayType: 'SUBSTITUTE_WORKDAY', name: '특별 대체근무' });
assert(r7.isWorkday === true && r7.dayType === 'SUBSTITUTE_WORKDAY', '7. 토요일 대체근무일 -> 근무일 (isWorkday=true)');

// 8. 공휴일을 대체근무일로 Override한 경우 -> 근무일
const r8 = evaluateWorkday('2026-10-09', { dayType: 'SUBSTITUTE_WORKDAY', name: '한글날 비상근무' });
assert(r8.isWorkday === true && r8.dayType === 'SUBSTITUTE_WORKDAY', '8. 공휴일 대체근무일 Override -> 근무일 (isWorkday=true)');


// ─────────────────────────────────────────────────────────────
// 2. 섹션 35: 결근 판정 15개 검증
// 기준: 오늘 날짜 = 2026-09-26
// ─────────────────────────────────────────────────────────────
console.log('\n--- [섹션 35: 결근 판정 15개 검증] ---');
const TODAY = '2026-09-26';
const standardUser = {
  hiredOn: '2026-01-01',
  resignationDate: null,
  leavePeriods: [],
  standardStartMinute: 540,
  standardEndMinute: 1080,
};

// 1. 과거 평일 + 출퇴근 없음 + 연차 없음 -> 결근
const a1 = evaluateDailyAttendance({
  ...standardUser,
  date: '2026-09-25', // 금요일 (추석 당일 아님 가정하거나 일반 평일)
  today: TODAY,
  effectiveWorkday: { date: '2026-09-25', dayType: 'NORMAL_WORKDAY', isWorkday: true, name: null },
  leaveType: null,
  checkInAt: null,
  checkOutAt: null,
});
assert(a1.isAbsent === true && a1.representativeStatus === 'ABSENT', '1. 과거 평일 + 출퇴근 없음 + 연차 없음 -> 결근 (ABSENT)');

// 2. 과거 토요일 + 기록 없음 -> 결근 아님
const a2 = evaluateDailyAttendance({
  ...standardUser,
  date: '2026-09-19', // 과거 토요일
  today: TODAY,
  effectiveWorkday: { date: '2026-09-19', dayType: 'WEEKEND', isWorkday: false, name: '토요일' },
  leaveType: null,
  checkInAt: null,
  checkOutAt: null,
});
assert(a2.isAbsent === false && a2.representativeStatus === null, '2. 과거 토요일 + 기록 없음 -> 결근 아님');

// 3. 과거 일요일 + 기록 없음 -> 결근 아님
const a3 = evaluateDailyAttendance({
  ...standardUser,
  date: '2026-09-20', // 과거 일요일
  today: TODAY,
  effectiveWorkday: { date: '2026-09-20', dayType: 'WEEKEND', isWorkday: false, name: '일요일' },
  leaveType: null,
  checkInAt: null,
  checkOutAt: null,
});
assert(a3.isAbsent === false && a3.representativeStatus === null, '3. 과거 일요일 + 기록 없음 -> 결근 아님');

// 4. 과거 공휴일 + 기록 없음 -> 결근 아님
const a4 = evaluateDailyAttendance({
  ...standardUser,
  date: '2026-08-15', // 광복절
  today: TODAY,
  effectiveWorkday: { date: '2026-08-15', dayType: 'PUBLIC_HOLIDAY', isWorkday: false, name: '광복절' },
  leaveType: null,
  checkInAt: null,
  checkOutAt: null,
});
assert(a4.isAbsent === false && a4.representativeStatus === null, '4. 과거 공휴일 + 기록 없음 -> 결근 아님');

// 5. 회사 휴무일 + 기록 없음 -> 결근 아님
const a5 = evaluateDailyAttendance({
  ...standardUser,
  date: '2026-09-21',
  today: TODAY,
  effectiveWorkday: { date: '2026-09-21', dayType: 'COMPANY_HOLIDAY', isWorkday: false, name: '창립기념일' },
  leaveType: null,
  checkInAt: null,
  checkOutAt: null,
});
assert(a5.isAbsent === false && a5.representativeStatus === null, '5. 회사 휴무일 + 기록 없음 -> 결근 아님');

// 6. 대체근무일 + 기록 없음 -> 결근
const a6 = evaluateDailyAttendance({
  ...standardUser,
  date: '2026-09-12', // 토요일 대체근무일
  today: TODAY,
  effectiveWorkday: { date: '2026-09-12', dayType: 'SUBSTITUTE_WORKDAY', isWorkday: true, name: '대체근무일' },
  leaveType: null,
  checkInAt: null,
  checkOutAt: null,
});
assert(a6.isAbsent === true && a6.representativeStatus === 'ABSENT', '6. 대체근무일 + 기록 없음 -> 결근 (ABSENT)');

// 7. 평일 + 1일 연차 -> 결근 아님
const a7 = evaluateDailyAttendance({
  ...standardUser,
  date: '2026-09-22',
  today: TODAY,
  effectiveWorkday: { date: '2026-09-22', dayType: 'NORMAL_WORKDAY', isWorkday: true, name: null },
  leaveType: 'FULL_DAY',
  checkInAt: null,
  checkOutAt: null,
});
assert(a7.isAbsent === false && a7.representativeStatus === 'FULL_DAY', '7. 평일 + 1일 연차 -> 결근 아님 (대표상태 FULL_DAY)');

// 8. 평일 + 반차 -> 결근 아님
const a8 = evaluateDailyAttendance({
  ...standardUser,
  date: '2026-09-23',
  today: TODAY,
  effectiveWorkday: { date: '2026-09-23', dayType: 'NORMAL_WORKDAY', isWorkday: true, name: null },
  leaveType: 'HALF_DAY',
  checkInAt: null,
  checkOutAt: null,
});
assert(a8.isAbsent === false && a8.representativeStatus === 'HALF_DAY', '8. 평일 + 반차 -> 결근 아님 (대표상태 HALF_DAY)');

// 9. 평일 + 반반차 -> 결근 아님
const a9 = evaluateDailyAttendance({
  ...standardUser,
  date: '2026-09-24',
  today: TODAY,
  effectiveWorkday: { date: '2026-09-24', dayType: 'NORMAL_WORKDAY', isWorkday: true, name: null },
  leaveType: 'QUARTER_DAY',
  checkInAt: null,
  checkOutAt: null,
});
assert(a9.isAbsent === false && a9.representativeStatus === 'QUARTER_DAY', '9. 평일 + 반반차 -> 결근 아님 (대표상태 QUARTER_DAY)');

// 10. 평일 + 시차 -> 결근 아님
const a10 = evaluateDailyAttendance({
  ...standardUser,
  date: '2026-09-25',
  today: TODAY,
  effectiveWorkday: { date: '2026-09-25', dayType: 'NORMAL_WORKDAY', isWorkday: true, name: null },
  leaveType: 'HOURLY',
  checkInAt: null,
  checkOutAt: null,
});
assert(a10.isAbsent === false && a10.representativeStatus === 'HOURLY', '10. 평일 + 시차 -> 결근 아님 (대표상태 HOURLY)');

// 11. 휴직기간 평일 + 기록 없음 -> 결근 아님
const a11 = evaluateDailyAttendance({
  ...standardUser,
  date: '2026-09-15',
  today: TODAY,
  leavePeriods: [{ startedOn: '2026-09-01', endedOn: '2026-09-30' }],
  effectiveWorkday: { date: '2026-09-15', dayType: 'NORMAL_WORKDAY', isWorkday: true, name: null },
  leaveType: null,
  checkInAt: null,
  checkOutAt: null,
});
assert(a11.isAbsent === false && a11.isWorkday === false && a11.reason === '휴직 기간', '11. 휴직기간 평일 + 기록 없음 -> 결근 아님 (휴직 사유)');

// 12. 입사일 이전 -> 결근 아님
const a12 = evaluateDailyAttendance({
  ...standardUser,
  hiredOn: '2026-09-20',
  date: '2026-09-15', // 입사 전
  today: TODAY,
  effectiveWorkday: { date: '2026-09-15', dayType: 'NORMAL_WORKDAY', isWorkday: true, name: null },
  leaveType: null,
  checkInAt: null,
  checkOutAt: null,
});
assert(a12.isAbsent === false && a12.isWorkday === false && a12.reason === '입사 전', '12. 입사일 이전 -> 결근 아님 (입사 전 사유)');

// 13. 퇴사일 이후 -> 결근 아님
const a13 = evaluateDailyAttendance({
  ...standardUser,
  resignationDate: '2026-09-10',
  date: '2026-09-15', // 퇴사 후
  today: TODAY,
  effectiveWorkday: { date: '2026-09-15', dayType: 'NORMAL_WORKDAY', isWorkday: true, name: null },
  leaveType: null,
  checkInAt: null,
  checkOutAt: null,
});
assert(a13.isAbsent === false && a13.isWorkday === false && a13.reason === '퇴사 후', '13. 퇴사일 이후 -> 결근 아님 (퇴사 후 사유)');

// 14. 오늘 근무일 + 미출근 -> 미출근 (결근 아님)
const a14 = evaluateDailyAttendance({
  ...standardUser,
  date: TODAY, // 오늘 (2026-09-26)
  today: TODAY,
  effectiveWorkday: { date: TODAY, dayType: 'NORMAL_WORKDAY', isWorkday: true, name: null },
  leaveType: null,
  checkInAt: null,
  checkOutAt: null,
});
assert(a14.isAbsent === false && a14.isNotClockedIn === true, '14. 오늘 근무일 + 미출근 -> 미출근 (isNotClockedIn=true, isAbsent=false)');

// 15. 미래 근무일 -> 결근 아님
const a15 = evaluateDailyAttendance({
  ...standardUser,
  date: '2026-09-30', // 미래
  today: TODAY,
  effectiveWorkday: { date: '2026-09-30', dayType: 'NORMAL_WORKDAY', isWorkday: true, name: null },
  leaveType: null,
  checkInAt: null,
  checkOutAt: null,
});
assert(a15.isAbsent === false && a15.representativeStatus === null, '15. 미래 근무일 -> 결근 아님 (예정일)');

console.log('\n====================================================');
console.log(`테스트 결과: 총 ${passCount + failCount}개 중 통과: ${passCount}개, 실패: ${failCount}개`);
console.log('====================================================');

if (failCount > 0) process.exit(1);
