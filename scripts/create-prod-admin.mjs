import { randomBytes, pbkdf2Sync, randomUUID } from 'node:crypto';
import readline from 'node:readline';

const ITERATIONS = 100_000;
const KEY_BYTES = 32;

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function ask(question) {
  return new Promise((resolve) => rl.question(question, (answer) => resolve(answer.trim())));
}

function sql(value) {
  if (value === null) return 'NULL';
  return `'${String(value).replaceAll("'", "''")}'`;
}

console.log('\n=== Production 최초 ADMIN 생성 준비 ===\n');
console.log('※ 이 프로그램은 DB에 직접 접속하지 않습니다.');
console.log('※ 입력값을 이용해 운영 DB용 SQL 파일만 생성합니다.\n');

const employeeNumber = await ask('관리자 사번: ');
const fullName = await ask('관리자 이름: ');
const department = await ask('부서명: ');
const jobTitle = await ask('직급/직책: ');
const hiredOn = await ask('입사일 (YYYY-MM-DD): ');
const password = await ask('초기 비밀번호 (12자 이상): ');

if (!employeeNumber || !fullName || !department || !jobTitle || !hiredOn) {
  console.error('\n필수 입력값이 비어 있습니다.');
  rl.close();
  process.exit(1);
}

if (password.length < 12) {
  console.error('\n비밀번호는 12자 이상이어야 합니다.');
  rl.close();
  process.exit(1);
}

if (!/^\d{4}-\d{2}-\d{2}$/.test(hiredOn)) {
  console.error('\n입사일은 YYYY-MM-DD 형식이어야 합니다.');
  rl.close();
  process.exit(1);
}

const employeeId = randomUUID();
const accountId = randomUUID();
const salt = randomBytes(16);

const hash = pbkdf2Sync(
  password,
  salt,
  ITERATIONS,
  KEY_BYTES,
  'sha256',
);

const passwordHash = hash.toString('base64');
const passwordSalt = salt.toString('base64');
const now = new Date().toISOString();

const output = `

INSERT INTO employees (
  id,
  employee_number,
  full_name,
  department,
  job_title,
  hired_on,
  employment_status,
  role,
  standard_start_minute,
  standard_end_minute,
  terminated_on,
  resignation_date,
  created_at,
  updated_at
) VALUES (
  ${sql(employeeId)},
  ${sql(employeeNumber)},
  ${sql(fullName)},
  ${sql(department)},
  ${sql(jobTitle)},
  ${sql(hiredOn)},
  'ACTIVE',
  'ADMIN',
  540,
  1080,
  NULL,
  NULL,
  ${sql(now)},
  ${sql(now)}
);

INSERT INTO user_accounts (
  id,
  employee_id,
  password_hash,
  password_salt,
  password_iterations,
  login_enabled,
  last_login_at,
  created_at,
  updated_at
) VALUES (
  ${sql(accountId)},
  ${sql(employeeId)},
  ${sql(passwordHash)},
  ${sql(passwordSalt)},
  ${ITERATIONS},
  1,
  NULL,
  ${sql(now)},
  ${sql(now)}
);

`;

const { writeFile } = await import('node:fs/promises');
await writeFile('./scripts/prod-admin.sql', output, 'utf8');

password.fill?.();

console.log('\nSQL 파일 생성 완료: scripts/prod-admin.sql');
console.log('아직 Production DB에는 적용되지 않았습니다.');

rl.close();