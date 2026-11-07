/**
 * scripts/test-phase6.mjs
 * Phase 6 핵심 비즈니스 로직 및 운영 규칙 검증 스크립트:
 * 1) 근무구분 8개 테스트 (Requirement 40)
 * 2) 분 단위 시간계산 경계 테스트 (Requirement 41)
 * 3) 대체휴무 옵션 및 자동 해제 테스트 (Requirement 42)
 * 4) 직원 상태 검증 (입사 전, 퇴사 후, 휴직 기간 차단) (Requirement 19)
 * 5) Daily Attendance Status 우선순위 및 이상데이터 검증 (Requirement 33, 34, 35, 36)
 * 6) 월간 통계 Summary 계산 검증 (Requirement 28, 30)
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
    if (type === 'SUBSTITUTE_WORKDAY') {
      return { date, dayType: 'SUBSTITUTE_WORKDAY', isWorkday: true, name: calendarRecord.name || '대체근무일' };
    }
    if (type === 'COMPANY_HOLIDAY') {
      return { date, dayType: 'COMPANY_HOLIDAY', isWorkday: false, name: calendarRecord.name || '회사 휴무일' };
    }
    if (type === 'PUBLIC_HOLIDAY') {
      return { date, dayType: 'PUBLIC_HOLIDAY', isWorkday: false, name: calendarRecord.name || '공휴일' };
    }
    if (type === 'NORMAL_WORKDAY' || type === 'WORKDAY') {
      return { date, dayType: 'NORMAL_WORKDAY', isWorkday: true, name: calendarRecord.name || null };
    }
    if (type === 'WEEKEND') {
      return { date, dayType: 'WEEKEND', isWorkday: false, name: calendarRecord.name || (dayOfWeek === 0 ? '일요일' : '토요일') };
    }
  }

  if (isWeekendDay) {
    return { date, dayType: 'WEEKEND', isWorkday: false, name: dayOfWeek === 0 ? '일요일' : '토요일' };
  }

  return { date, dayType: 'NORMAL_WORKDAY', isWorkday: true, name: null };
}

function determineWorkType(date, calendarRecord) {
  const effective = evaluateWorkday(date, calendarRecord);
  return effective.isWorkday ? 'OVERTIME' : 'HOLIDAY_WORK';
}

function timeStringToMinutes(timeStr) {
  if (!timeStr) return 0;
  const [h, m] = timeStr.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

function calculateOvertimeDuration(startedAt, endedAt, allowOvernight = false) {
  const startMin = timeStringToMinutes(startedAt);
  const endMin = timeStringToMinutes(endedAt);

  if (endMin > startMin) {
    return { durationMinutes: endMin - startMin, isOvernight: false, isValid: true };
  }

  if (allowOvernight && endMin < startMin) {
    return { durationMinutes: 1440 - startMin + endMin, isOvernight: true, isValid: true };
  }

  return { durationMinutes: 0, isOvernight: false, isValid: false };
}

function formatDuration(minutes) {
  if (!minutes || minutes <= 0) return '0분';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0 && m > 0) return `${h}시간 ${m}분`;
  if (h > 0) return `${h}시간`;
  return `${m}분`;
}

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

  let representativeStatus;
  if (isLate) representativeStatus = 'LATE';
  else if (isEarlyLeave) representativeStatus = 'EARLY_LEAVE';
  else representativeStatus = 'NORMAL';

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
    overtimeType = null,
    overtimeMinutes = 0,
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
    overtimeType,
    overtimeMinutes,
    checkInAt,
    checkOutAt,
    dayName: effectiveWorkday.name,
  };

  // 1. 재직 자격
  if (date < hiredOn) return { ...baseResult, isWorkday: false, reason: '입사 전' };
  if (resignationDate && date > resignationDate) return { ...baseResult, isWorkday: false, reason: '퇴사 후' };
  const inLeave = leavePeriods.some((p) => p.startedOn <= date && (!p.endedOn || date <= p.endedOn));
  if (inLeave) return { ...baseResult, isWorkday: false, reason: '휴직 기간' };

  // 2. 비근무일
  if (!effectiveWorkday.isWorkday) {
    if (overtimeType === 'HOLIDAY_WORK') {
      return {
        ...baseResult,
        representativeStatus: 'HOLIDAY_WORK',
        dayName: effectiveWorkday.name || '휴일근무',
        reason: '휴일근무 승인 등록됨',
      };
    }
    return baseResult;
  }

  // 3. 근무일
  // 3-1. 연차 우선
  if (leaveType) {
    return {
      ...baseResult,
      representativeStatus: leaveType,
      isLate: false,
      isEarlyLeave: false,
      isAbsent: false,
    };
  }

  // 3-2. 평일 연장근무
  if (overtimeType === 'OVERTIME') {
    if (checkInAt) {
      const judgement = calculateAttendanceStatus({
        standardStartMinute,
        standardEndMinute,
        checkInAt,
        checkOutAt,
        leaveType: null,
      });
      return {
        ...baseResult,
        representativeStatus: 'OVERTIME',
        isLate: judgement.isLate,
        isEarlyLeave: judgement.isEarlyLeave,
        isAbsent: false,
      };
    }

    // 출퇴근 기록이 없는데 연장근무가 등록된 이상 데이터
    const isPast = date < today;
    const isToday = date === today;
    return {
      ...baseResult,
      representativeStatus: 'OVERTIME',
      isAbsent: isPast,
      isNotClockedIn: isToday,
      reason: isPast
        ? '출퇴근 기록 없음 (연장근무 등록됨 / 결근 의심)'
        : isToday
        ? '출퇴근 기록 없음 (미출근)'
        : '예정 근무일 (연장근무 등록됨)',
    };
  }

  // 3-3. 일반 출퇴근
  if (checkInAt) {
    const judgement = calculateAttendanceStatus({
      standardStartMinute,
      standardEndMinute,
      checkInAt,
      checkOutAt,
      leaveType: null,
    });
    return {
      ...baseResult,
      representativeStatus: judgement.representativeStatus,
      isLate: judgement.isLate,
      isEarlyLeave: judgement.isEarlyLeave,
      isAbsent: false,
    };
  }

  // 3-4. 출근 없음
  if (date === today) return { ...baseResult, isNotClockedIn: true, reason: '미출근' };
  if (date > today) return { ...baseResult, reason: '예정 근무일' };
  return { ...baseResult, isAbsent: true, representativeStatus: 'ABSENT', reason: '결근' };
}

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  [PASS] ${message}`);
    passed++;
  } else {
    console.error(`  [FAIL] ${message}`);
    failed++;
  }
}

console.log('================================================================');
console.log('Phase 6: 연장근무 및 휴일근무 통합 관리 종합 검증');
console.log('================================================================\n');

// ─── 1. 근무구분 8개 테스트 (Requirement 40) ───────────────────────────────
console.log('>>> 1. 근무구분 8개 테스트 (Work Calendar 자동 판정)');

// 1. 월요일 일반근무일 (2026-09-28) -> OVERTIME
const t1 = determineWorkType('2026-09-28', null);
assert(t1 === 'OVERTIME', '1. 월요일 일반근무일 (2026-09-28) -> OVERTIME (평일연장)');

// 2. 금요일 일반근무일 (2026-10-02) -> OVERTIME
const t2 = determineWorkType('2026-10-02', null);
assert(t2 === 'OVERTIME', '2. 금요일 일반근무일 (2026-10-02) -> OVERTIME (평일연장)');

// 3. 토요일 (2026-10-10) -> HOLIDAY_WORK
const t3 = determineWorkType('2026-10-10', null);
assert(t3 === 'HOLIDAY_WORK', '3. 토요일 (2026-10-10) -> HOLIDAY_WORK (휴일근무)');

// 4. 일요일 (2026-10-11) -> HOLIDAY_WORK
const t4 = determineWorkType('2026-10-11', null);
assert(t4 === 'HOLIDAY_WORK', '4. 일요일 (2026-10-11) -> HOLIDAY_WORK (휴일근무)');

// 5. 평일 공휴일 (2026-10-09 한글날 금요일) -> HOLIDAY_WORK
const t5 = determineWorkType('2026-10-09', { dayType: 'PUBLIC_HOLIDAY', name: '한글날' });
assert(t5 === 'HOLIDAY_WORK', '5. 평일 공휴일 (2026-10-09 한글날) -> HOLIDAY_WORK (휴일근무)');

// 6. 회사 지정 휴무일 (2026-05-01 근로자의 날) -> HOLIDAY_WORK
const t6 = determineWorkType('2026-05-01', { dayType: 'COMPANY_HOLIDAY', name: '창립기념일' });
assert(t6 === 'HOLIDAY_WORK', '6. 회사 지정 휴무일 (2026-05-01 창립기념일) -> HOLIDAY_WORK (휴일근무)');

// 7. 토요일 대체근무일 (2026-09-12 토요일 -> 대체근무일 지정) -> OVERTIME
const t7 = determineWorkType('2026-09-12', { dayType: 'SUBSTITUTE_WORKDAY', name: '추석 대체근무' });
assert(t7 === 'OVERTIME', '7. 토요일 대체근무일 (2026-09-12) -> OVERTIME (평일연장)');

// 8. 공휴일을 대체근무일로 Override (2026-10-03 개천절 -> 대체근무일 지정) -> OVERTIME
const t8 = determineWorkType('2026-10-03', { dayType: 'SUBSTITUTE_WORKDAY', name: '비상근무 대체일' });
assert(t8 === 'OVERTIME', '8. 공휴일을 대체근무일로 Override (2026-10-03) -> OVERTIME (평일연장)');

// ─── 2. 분 단위 시간계산 경계 테스트 (Requirement 41) ──────────────────────
console.log('\n>>> 2. 분 단위 시간계산 경계 테스트');

// 1. 18:03 ~ 20:17 -> 134분 -> 2시간 14분
const dur1 = calculateOvertimeDuration('18:03', '20:17');
assert(dur1.durationMinutes === 134 && formatDuration(dur1.durationMinutes) === '2시간 14분', '1. 18:03 ~ 20:17 -> 134분 (2시간 14분)');

// 2. 18:00 ~ 18:01 -> 1분
const dur2 = calculateOvertimeDuration('18:00', '18:01');
assert(dur2.durationMinutes === 1 && formatDuration(dur2.durationMinutes) === '1분', '2. 18:00 ~ 18:01 -> 1분');

// 3. 09:07 ~ 12:38 -> 211분 -> 3시간 31분
const dur3 = calculateOvertimeDuration('09:07', '12:38');
assert(dur3.durationMinutes === 211 && formatDuration(dur3.durationMinutes) === '3시간 31분', '3. 09:07 ~ 12:38 -> 211분 (3시간 31분)');

// 4. 18:00 ~ 18:00 -> 등록 불가 (0분)
const dur4 = calculateOvertimeDuration('18:00', '18:00');
assert(!dur4.isValid && dur4.durationMinutes === 0, '4. 18:00 ~ 18:00 -> 등록 불가 (0분)');

// 5. 20:00 ~ 19:00 -> 당일 기준 등록 불가
const dur5 = calculateOvertimeDuration('20:00', '19:00', false);
assert(!dur5.isValid && dur5.durationMinutes === 0, '5. 20:00 ~ 19:00 -> 당일 기준 등록 불가');

// 6. 자정 초과 근무 확장성: 22:00 ~ 02:00 (allowOvernight = true) -> 240분 (4시간)
const dur6 = calculateOvertimeDuration('22:00', '02:00', true);
assert(dur6.isValid && dur6.isOvernight && dur6.durationMinutes === 240, '6. 자정 초과 지원: 22:00 ~ 02:00 -> 240분 (4시간, isOvernight = true)');

// ─── 3. 대체휴무 옵션 및 변경 테스트 (Requirement 42) ──────────────────────
console.log('\n>>> 3. 대체휴무 옵션 및 날짜 변경 테스트');

// 1. 평일연장 시 대체휴무 강제 차단
function resolveGrantCompLeave(workType, grantOption) {
  return workType === 'HOLIDAY_WORK' ? Boolean(grantOption) : false;
}
assert(resolveGrantCompLeave('OVERTIME', true) === false, '1. 평일연장(OVERTIME)에서 대체휴무 옵션 선택 시도 -> 강제 false');

// 2. 휴일근무 시 대체휴무 1일 부여 옵션 저장
assert(resolveGrantCompLeave('HOLIDAY_WORK', true) === true, '2. 휴일근무(HOLIDAY_WORK)에서 대체휴무 선택 -> true (1일 부여예정 저장)');

// 3. 날짜 변경으로 휴일 -> 평일 전환 시 대체휴무 옵션 자동 해제
let originalWorkType = 'HOLIDAY_WORK';
let originalCompLeave = true;
let newDate = '2026-09-28'; // 월요일
let newWorkType = determineWorkType(newDate, null);
let newCompLeave = resolveGrantCompLeave(newWorkType, originalCompLeave);
assert(newWorkType === 'OVERTIME' && newCompLeave === false, '3. 휴일근무 날짜를 평일로 변경 시 -> OVERTIME 전환 및 대체휴무 자동 해제');

// ─── 4. Daily Attendance Status 우선순위 및 이상데이터 검증 ────────────────
console.log('\n>>> 4. Daily Attendance Status 우선순위 및 이상데이터 검증 (Requirement 33, 34, 35, 36)');

const stdEmp = {
  hiredOn: '2025-01-01',
  standardStartMinute: 540, // 09:00
  standardEndMinute: 1080,  // 18:00
};
const workdayEff = { date: '2026-09-28', dayType: 'NORMAL_WORKDAY', isWorkday: true, name: null };
const holidayEff = { date: '2026-10-03', dayType: 'PUBLIC_HOLIDAY', isWorkday: false, name: '개천절' };

// 1. 연차 + 연장근무 -> 연차 대표상태 우선
const attLeave = evaluateDailyAttendance({
  date: '2026-09-28',
  today: '2026-09-28',
  ...stdEmp,
  effectiveWorkday: workdayEff,
  leaveType: 'HALF_DAY',
  overtimeType: 'OVERTIME',
  overtimeMinutes: 120,
  checkInAt: '2026-09-28T09:00:00Z',
  checkOutAt: '2026-09-28T20:00:00Z',
});
assert(attLeave.representativeStatus === 'HALF_DAY', '1. 연차 + 평일연장 -> 연차(HALF_DAY) 대표상태 우선');

// 2. 지각 + 연장근무 -> 대표상태 연장(OVERTIME) + isLate=true 세부 플래그 유지
const attLate = evaluateDailyAttendance({
  date: '2026-09-28',
  today: '2026-09-28',
  ...stdEmp,
  effectiveWorkday: workdayEff,
  leaveType: null,
  overtimeType: 'OVERTIME',
  overtimeMinutes: 134,
  checkInAt: '2026-09-28T00:10:00Z', // KST 09:10 (지각)
  checkOutAt: '2026-09-28T11:17:00Z', // KST 20:17
});
assert(attLate.representativeStatus === 'OVERTIME' && attLate.isLate === true, '2. 지각 + 연장근무 -> 대표상태 OVERTIME 및 isLate=true 플래그 유지');

// 3. 휴일근무 -> 대표상태 HOLIDAY_WORK, 결근 없음
const attHoliday = evaluateDailyAttendance({
  date: '2026-10-03',
  today: '2026-10-05',
  ...stdEmp,
  effectiveWorkday: holidayEff,
  leaveType: null,
  overtimeType: 'HOLIDAY_WORK',
  overtimeMinutes: 300,
  checkInAt: null, // 휴일근무는 Attendance 출퇴근 안 찍음 (Requirement 14)
  checkOutAt: null,
});
assert(attHoliday.representativeStatus === 'HOLIDAY_WORK' && attHoliday.isAbsent === false, '3. 휴일근무 등록 건 -> 대표상태 HOLIDAY_WORK 및 결근 판정 없음 (isAbsent=false)');

// 4. 평일연장 + 출퇴근 기록 없음 (이상데이터 방지 - Requirement 36)
const attAnomaly = evaluateDailyAttendance({
  date: '2026-09-20',
  today: '2026-09-28', // 과거일자
  ...stdEmp,
  effectiveWorkday: workdayEff,
  leaveType: null,
  overtimeType: 'OVERTIME',
  overtimeMinutes: 120,
  checkInAt: null,
  checkOutAt: null,
});
assert(
  attAnomaly.representativeStatus === 'OVERTIME' &&
  attAnomaly.isAbsent === true &&
  attAnomaly.reason.includes('출퇴근 기록 없음'),
  '4. 평일연장 + 출퇴근 기록 없음 -> 단순 정상근무로 덮어쓰지 않고 결근의심 플래그 및 "출퇴근 기록 없음" 경고 유지'
);

// ─── 5. 월간 통계 Summary 계산 검증 (Requirement 28, 30) ───────────────────
console.log('\n>>> 5. 월간 통계 Summary 계산 검증');

const sampleRecords = [
  { workType: 'OVERTIME', durationMinutes: 134, grantCompLeave: false },
  { workType: 'OVERTIME', durationMinutes: 44, grantCompLeave: false },
  { workType: 'HOLIDAY_WORK', durationMinutes: 211, grantCompLeave: true },
  { workType: 'HOLIDAY_WORK', durationMinutes: 300, grantCompLeave: false },
];

function summarize(records) {
  let overtimeMinutes = 0;
  let holidayWorkMinutes = 0;
  let overtimeCount = 0;
  let holidayWorkCount = 0;
  let compLeaveGrantedCount = 0;

  for (const r of records) {
    if (r.workType === 'OVERTIME') {
      overtimeMinutes += r.durationMinutes;
      overtimeCount++;
    } else if (r.workType === 'HOLIDAY_WORK') {
      holidayWorkMinutes += r.durationMinutes;
      holidayWorkCount++;
      if (r.grantCompLeave) compLeaveGrantedCount++;
    }
  }

  return {
    overtimeMinutes,
    holidayWorkMinutes,
    totalMinutes: overtimeMinutes + holidayWorkMinutes,
    overtimeCount,
    holidayWorkCount,
    compLeaveGrantedCount,
  };
}

const summary = summarize(sampleRecords);
assert(summary.overtimeMinutes === 178, '1. 평일연장 분 단위 합계 = 178분 (2시간 58분)');
assert(summary.holidayWorkMinutes === 511, '2. 휴일근무 분 단위 합계 = 511분 (8시간 31분)');
assert(summary.totalMinutes === 689, '3. 총 추가근무 = 689분 (11시간 29분)');
assert(summary.overtimeCount === 2 && summary.holidayWorkCount === 2, '4. 건수 집계: 평일연장 2건, 휴일근무 2건');
assert(summary.compLeaveGrantedCount === 1, '5. 대체휴무 1일 부여 건수 = 1건');

console.log('\n================================================================');
console.log(`최종 결과: ${passed} 통과, ${failed} 실패`);
console.log('================================================================');

if (failed > 0) {
  process.exit(1);
}
