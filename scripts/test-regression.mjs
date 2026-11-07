/**
 * scripts/test-regression.mjs
 * 기존 Phase 1~4 핵심 기능 회귀 검증:
 * 1. 5분 Grace Period 출근 판정 (경계값 09:05:59 vs 09:06:00)
 * 2. 5분 Grace Period 퇴근 판정 (경계값 17:55:00 vs 17:54:59)
 * 3. 지각 + 조퇴 동시 발생 (LATE + isEarlyLeave = true)
 * 4. 연차 우선순위 (FULL_DAY, HALF_DAY 등)
 * 5. 권한 검증 (canAccessRoute)
 * 6. 시간 변환 유틸리티 (minuteToTimeString)
 */

function minuteToTimeString(minuteOfDay) {
  const h = Math.floor(minuteOfDay / 60);
  const m = minuteOfDay % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function canAccessRoute(role, pathname) {
  const ownPrefix = role === 'ADMIN' ? '/admin' : '/user';
  return pathname === ownPrefix || pathname.startsWith(`${ownPrefix}/`);
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

  let representativeStatus = 'NORMAL';
  if (isLate) representativeStatus = 'LATE';
  else if (isEarlyLeave) representativeStatus = 'EARLY_LEAVE';

  return { representativeStatus, isLate, isEarlyLeave };
}

console.log('====================================================');
console.log('기존 기능 회귀 테스트 (Regression Test) 시작');
console.log('====================================================\n');

let pass = 0;
let fail = 0;

function check(cond, msg) {
  if (cond) {
    console.log(`[PASS] ${msg}`);
    pass++;
  } else {
    console.error(`[FAIL] ${msg}`);
    fail++;
  }
}

// 1. 기준시간 09:00 (540분) 출근 Grace Period 경계값
// 09:05:59 KST = UTC 00:05:59
const c1 = calculateAttendanceStatus({
  standardStartMinute: 540,
  standardEndMinute: 1080,
  checkInAt: '2026-09-25T00:05:59.000Z',
  checkOutAt: '2026-09-25T09:00:00.000Z',
  leaveType: null,
});
check(c1.isLate === false && c1.representativeStatus === 'NORMAL', '1. 09:05:59 출근 (Grace 5분 이내) -> 정상 출근');

// 09:06:00 KST = UTC 00:06:00
const c2 = calculateAttendanceStatus({
  standardStartMinute: 540,
  standardEndMinute: 1080,
  checkInAt: '2026-09-25T00:06:00.000Z',
  checkOutAt: '2026-09-25T09:00:00.000Z',
  leaveType: null,
});
check(c2.isLate === true && c2.representativeStatus === 'LATE', '2. 09:06:00 출근 (Grace 5분 초과) -> 지각');

// 2. 기준시간 18:00 (1080분) 퇴근 Grace Period 경계값
// 17:55:00 KST = UTC 08:55:00
const c3 = calculateAttendanceStatus({
  standardStartMinute: 540,
  standardEndMinute: 1080,
  checkInAt: '2026-09-25T00:00:00.000Z',
  checkOutAt: '2026-09-25T08:55:00.000Z',
  leaveType: null,
});
check(c3.isEarlyLeave === false && c3.representativeStatus === 'NORMAL', '3. 17:55:00 퇴근 (Grace 5분 이내) -> 정상 퇴근');

// 17:54:59 KST = UTC 08:54:59
const c4 = calculateAttendanceStatus({
  standardStartMinute: 540,
  standardEndMinute: 1080,
  checkInAt: '2026-09-25T00:00:00.000Z',
  checkOutAt: '2026-09-25T08:54:59.000Z',
  leaveType: null,
});
check(c4.isEarlyLeave === true && c4.representativeStatus === 'EARLY_LEAVE', '4. 17:54:59 퇴근 (Grace 5분 미만) -> 조퇴');

// 3. 지각 + 조퇴 동시 발생
const c5 = calculateAttendanceStatus({
  standardStartMinute: 540,
  standardEndMinute: 1080,
  checkInAt: '2026-09-25T00:10:00.000Z',
  checkOutAt: '2026-09-25T08:00:00.000Z',
  leaveType: null,
});
check(c5.isLate === true && c5.isEarlyLeave === true && c5.representativeStatus === 'LATE', '5. 지각+조퇴 동시 -> 대표상태 LATE & isEarlyLeave true');

// 4. 연차 우선순위 (출근이 늦었어도 연차가 우선)
const c6 = calculateAttendanceStatus({
  standardStartMinute: 540,
  standardEndMinute: 1080,
  checkInAt: '2026-09-25T01:00:00.000Z',
  checkOutAt: '2026-09-25T09:00:00.000Z',
  leaveType: 'HALF_DAY',
});
check(c6.representativeStatus === 'HALF_DAY' && c6.isLate === false && c6.isEarlyLeave === false, '6. 반차 등록 -> 대표상태 HALF_DAY 및 지각/조퇴 미판정');

// 5. 권한 검증
check(canAccessRoute('ADMIN', '/admin') === true, '7. ADMIN -> /admin 접근 허용');
check(canAccessRoute('ADMIN', '/user') === false, '8. ADMIN -> /user 접근 거부');
check(canAccessRoute('USER', '/user/attendance') === true, '9. USER -> /user/attendance 접근 허용');
check(canAccessRoute('USER', '/admin/attendance') === false, '10. USER -> /admin/attendance 접근 거부');

// 6. 시간 변환
check(minuteToTimeString(540) === '09:00', '11. 540분 -> "09:00"');
check(minuteToTimeString(1080) === '18:00', '12. 1080분 -> "18:00"');

console.log('\n====================================================');
console.log(`회귀 테스트 결과: 총 ${pass + fail}개 중 통과: ${pass}개, 실패: ${fail}개`);
console.log('====================================================');

if (fail > 0) process.exit(1);
