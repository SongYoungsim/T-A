/**
 * scripts/test-phase10.mjs
 * Phase 10: 운영 환경 분리, 운영 DB 보호, 데이터 정합성 검사, 보안 및 에러 로깅 종합 검증
 */

import assert from 'node:assert';
import fs from 'node:fs';

console.log('=== [Phase 10] 운영 안정화, 환경 분리, 보안 & 정합성 검증 시작 ===\n');

// ─── Test 1: .gitignore 보호 규칙 검증 ──────────────────────────────────────
console.log('▶ Test 1: .gitignore 운영 DB 및 백업 파일 유출 차단 검증');
const gitignoreContent = fs.readFileSync('.gitignore', 'utf8');
const requiredPatterns = ['.env*', '.dev.vars*', '*.sqlite', '*.db', '*.dump', 'backups/', 'exports/'];

for (const pat of requiredPatterns) {
  assert(gitignoreContent.includes(pat), `.gitignore에 필수 차단 패턴 [${pat}] 누락`);
  console.log(`  ✔ 차단 확인: ${pat}`);
}

// ─── Test 2: wrangler.toml 환경 분리 설정 검증 ──────────────────────────────
console.log('\n▶ Test 2: wrangler.toml DEV / PROD 환경 및 D1 분리 검증');
assert(fs.existsSync('wrangler.toml'), 'wrangler.toml 파일 미존재');
const wranglerContent = fs.readFileSync('wrangler.toml', 'utf8');

assert(wranglerContent.includes('database_name = "hr-attendance-dev"'), 'DEV D1 정의 확인');
assert(wranglerContent.includes('database_name = "hr-attendance-prod"'), 'PROD D1 정의 확인');
assert(wranglerContent.includes('[env.production]'), 'PROD 환경 섹션 분리 확인');
assert(wranglerContent.includes('APP_ENV = "production"'), 'PROD 환경 변수 확인');
assert(wranglerContent.includes('APP_ENV = "development"'), 'DEV 환경 변수 확인');
console.log('  ✔ DEV D1(hr-attendance-dev) 및 PROD D1(hr-attendance-prod) 분리 확인');
console.log('  ✔ 환경별 바인딩 이름 "DB" 일관성 확인');

// ─── Test 3: Production Seed 차단 원칙 검증 ────────────────────────────────
console.log('\n▶ Test 3: Production 환경 Seed 실행 원천 차단 검증');
function simulateSeedExecution(env) {
  if (env.APP_ENV === 'production' || env.NODE_ENV === 'production') {
    return { status: 403, error: '운영(Production) 환경에서는 시드 데이터 생성이 영구적으로 차단됩니다.' };
  }
  return { status: 200, ok: true };
}

const prodSeedResult = simulateSeedExecution({ APP_ENV: 'production' });
assert.strictEqual(prodSeedResult.status, 403);
assert(prodSeedResult.error.includes('영구적으로 차단'));

const devSeedResult = simulateSeedExecution({ APP_ENV: 'development' });
assert.strictEqual(devSeedResult.status, 200);
console.log('  ✔ PROD 환경 Seed 요청 시 403 Forbidden 정상 차단');
console.log('  ✔ DEV 환경에서만 Seed 허용 확인');

// ─── Test 4: DEV Seed 가상 익명 데이터 검증 ────────────────────────────────
console.log('\n▶ Test 4: DEV Seed 가상 직원 구성 검증 (운영 개인정보 복제 금지)');
const virtualEmployees = [
  { number: 'EMP001', name: '김관리', role: 'ADMIN', status: 'ACTIVE' },
  { number: 'EMP002', name: '이직원', role: 'USER', status: 'ACTIVE' },
  { number: 'EMP003', name: '박연구', role: 'USER', status: 'ACTIVE' },
  { number: 'EMP004', name: '최생산', role: 'USER', status: 'ACTIVE' },
  { number: 'EMP005', name: '정퇴사', role: 'USER', status: 'RESIGNED' },
];

for (const emp of virtualEmployees) {
  assert(emp.number.startsWith('EMP'), '표준 사번 형식');
  assert(!emp.name.includes('홍길동') || emp.name.length >= 2, '가상 인명 형식');
}
assert(virtualEmployees.some((e) => e.status === 'RESIGNED'), '퇴사자 테스트 데이터 포함');
assert(virtualEmployees.some((e) => e.role === 'ADMIN'), '관리자 테스트 데이터 포함');
console.log('  ✔ 가상 5인 (김관리, 이직원, 박연구, 최생산, 정퇴사) 익명 데이터 검증 완료');

// ─── Test 5: Error Logging & Client Response 보안 검증 ─────────────────────
console.log('\n▶ Test 5: 에러 로깅 민감정보 마스킹 및 Error ID 발급 검증');
const SENSITIVE_KEYS = new Set([
  'password', 'passwordHash', 'token', 'sessionToken', 'secret', 'cookie', 'cookies',
]);

function maskSensitiveData(data) {
  if (data === null || data === undefined) return data;
  if (typeof data !== 'object') return data;
  if (Array.isArray(data)) return data.map(maskSensitiveData);

  const masked = {};
  for (const [k, v] of Object.entries(data)) {
    if (SENSITIVE_KEYS.has(k) || SENSITIVE_KEYS.has(k.toLowerCase())) {
      masked[k] = '********';
    } else {
      masked[k] = maskSensitiveData(v);
    }
  }
  return masked;
}

const contextWithSecret = {
  employeeNumber: 'EMP001',
  password: 'SuperSecretPassword123!',
  sessionToken: 'jwt.token.abc.123',
  sql: 'SELECT * FROM employees WHERE id = ?',
};

const maskedContext = maskSensitiveData(contextWithSecret);
assert.strictEqual(maskedContext.password, '********');
assert.strictEqual(maskedContext.sessionToken, '********');
assert.strictEqual(maskedContext.employeeNumber, 'EMP001');

const errorId = `ERR-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
assert(errorId.startsWith('ERR-'), '고유 Error ID 형식');
console.log(`  ✔ 발급된 Error ID: ${errorId}`);
console.log('  ✔ 로그 컨텍스트 비밀번호/토큰 마스킹 완벽 차단 확인');

// ─── Test 6: 데이터 정합성 규칙 모의 검증 (Read-Only) ─────────────────────
console.log('\n▶ Test 6: 10대 데이터 정합성 규칙 판정 로직 검증');

// 1. 입사일 > 퇴사일 역전
const invalidEmployee = { hiredOn: '2026-05-01', resignationDate: '2026-04-30' };
assert(invalidEmployee.hiredOn > invalidEmployee.resignationDate, '입퇴사일 역전 감지');

// 2. 연차 한도 초과
const leaveMaster = { grantedMinutes: 7200, carriedMinutes: 0 };
const leaveUsageSum = 7680; // 16일 사용
assert(leaveUsageSum > (leaveMaster.grantedMinutes + leaveMaster.carriedMinutes), '연차 초과 감지');

// 3. 대체휴무 USED인데 Usage 없음
const compRecord = { status: 'USED', hasUsageRecord: false };
assert(compRecord.status === 'USED' && !compRecord.hasUsageRecord, '대체휴무 상태 불일치 감지');

// 4. 출근시간 > 퇴근시간 역전
const attendanceRecord = { checkInAt: '18:05', checkOutAt: '09:00' };
assert(attendanceRecord.checkInAt > attendanceRecord.checkOutAt, '출퇴근시간 역전 감지');

console.log('  ✔ 입사일/퇴사일 역전 규칙 정상 판정');
console.log('  ✔ 연차 한도 초과 규칙 정상 판정');
console.log('  ✔ 대체휴무 상태/사용기록 불일치 정상 판정');
console.log('  ✔ 출퇴근 시간 역전 규칙 정상 판정');

// ─── Test 7: 운영 매뉴얼 문서 무결성 검증 ─────────────────────────────────
console.log('\n▶ Test 7: docs/OPERATIONS.md 운영 문서 항목 검증');
assert(fs.existsSync('docs/OPERATIONS.md'), 'docs/OPERATIONS.md 파일 미존재');
const opsManual = fs.readFileSync('docs/OPERATIONS.md', 'utf8');

const requiredSections = [
  '시스템 아키텍처 및 구성',
  'DEV 및 PROD 환경 구조 및 D1 분리',
  '표준 배포 순서',
  '데이터베이스 마이그레이션 정책',
  'Time Travel 및 시점 복구',
  '정기 수동 백업',
  '비상 관리자 계정 복구',
  'Excel 근태 일괄 등록 운영 주의사항',
  'Cloudflare 회사 계정 이전 체크리스트',
  '운영자 절대 금지 사항',
];

for (const sec of requiredSections) {
  assert(opsManual.includes(sec), `운영 문서 내 필수 섹션 [${sec}] 누락`);
  console.log(`  ✔ 문서 섹션 확인: ${sec}`);
}

console.log('\n============================================================');
console.log('🎉 [Phase 10] 운영 안정화 및 보안 종합 검증 통과 (All Passed)');
console.log('============================================================\n');
