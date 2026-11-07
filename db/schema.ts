import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

const timestamps = {
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
};

export const employees = sqliteTable('employees', {
  id: text('id').primaryKey(),
  employeeNumber: text('employee_number').notNull().unique(),
  fullName: text('full_name').notNull(),
  department: text('department').notNull(),
  jobTitle: text('job_title').notNull(),
  hiredOn: text('hired_on').notNull(),
  employmentStatus: text('employment_status', { enum: ['ACTIVE', 'LEAVE', 'RESIGNED'] }).notNull().default('ACTIVE'),
  role: text('role', { enum: ['ADMIN', 'USER'] }).notNull().default('USER'),
  standardStartMinute: integer('standard_start_minute').notNull().default(540),
  standardEndMinute: integer('standard_end_minute').notNull().default(1080),
  terminatedOn: text('terminated_on'),
  resignationDate: text('resignation_date'),
  ...timestamps,
}, (table) => [
  index('idx_employees_status_department').on(table.employmentStatus, table.department),
  index('idx_employees_resignation').on(table.resignationDate),
]);

export const userAccounts = sqliteTable('user_accounts', {
  id: text('id').primaryKey(),
  employeeId: text('employee_id').notNull().unique().references(() => employees.id, { onDelete: 'restrict' }),
  passwordHash: text('password_hash').notNull(),
  passwordSalt: text('password_salt').notNull(),
  passwordIterations: integer('password_iterations').notNull(),
  loginEnabled: integer('login_enabled', { mode: 'boolean' }).notNull().default(true),
  lastLoginAt: text('last_login_at'),
  ...timestamps,
});

export const authSessions = sqliteTable('auth_sessions', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull().references(() => userAccounts.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: text('expires_at').notNull(),
  lastSeenAt: text('last_seen_at').notNull(),
  createdAt: text('created_at').notNull(),
}, (table) => [
  index('idx_auth_sessions_account_expiry').on(table.accountId, table.expiresAt),
]);

export const annualLeaveMasters = sqliteTable('annual_leave_masters', {
  id: text('id').primaryKey(),
  employeeId: text('employee_id').notNull().references(() => employees.id, { onDelete: 'restrict' }),
  year: integer('year').notNull(),
  /** @deprecated use grantedMinutes */
  grantedHours: integer('granted_hours').notNull().default(0),
  /** @deprecated use carriedMinutes */
  carriedHours: integer('carried_hours').notNull().default(0),
  /** 기본 부여연차 (분 단위, Phase 3+) */
  grantedMinutes: integer('granted_minutes').notNull().default(0),
  /** 전년도 이월연차 (분 단위, Phase 3+) */
  carriedMinutes: integer('carried_minutes').notNull().default(0),
  ...timestamps,
}, (table) => [
  uniqueIndex('uq_annual_leave_employee_year').on(table.employeeId, table.year),
]);

export const leaveUsages = sqliteTable('leave_usages', {
  id: text('id').primaryKey(),
  employeeId: text('employee_id').notNull().references(() => employees.id, { onDelete: 'restrict' }),
  leaveMasterId: text('leave_master_id').notNull().references(() => annualLeaveMasters.id, { onDelete: 'restrict' }),
  leaveDate: text('leave_date').notNull(),
  leaveType: text('leave_type', { enum: ['FULL_DAY', 'HALF_DAY', 'QUARTER_DAY', 'HOURLY'] }).notNull(),
  /** @deprecated use minutes */
  hours: integer('hours').notNull().default(0),
  /** 사용 시간 (분 단위, Phase 3+) */
  minutes: integer('minutes').notNull().default(0),
  registeredBy: text('registered_by').notNull().references(() => employees.id, { onDelete: 'restrict' }),
  /** Soft Delete: 취소일시 */
  cancelledAt: text('cancelled_at'),
  /** Soft Delete: 취소한 관리자 */
  cancelledBy: text('cancelled_by').references(() => employees.id, { onDelete: 'set null' }),
  ...timestamps,
}, (table) => [
  uniqueIndex('uq_leave_usage_employee_date').on(table.employeeId, table.leaveDate),
  index('idx_leave_usage_master').on(table.leaveMasterId),
  index('idx_leave_usage_cancelled').on(table.cancelledAt),
]);

export const attendanceImportBatches = sqliteTable('attendance_import_batches', {
  id: text('id').primaryKey(),
  actorEmployeeId: text('actor_employee_id').notNull().references(() => employees.id, { onDelete: 'restrict' }),
  fileName: text('file_name').notNull(),
  fileSizeBytes: integer('file_size_bytes').notNull().default(0),
  totalRows: integer('total_rows').notNull().default(0),
  newCount: integer('new_count').notNull().default(0),
  updatedCount: integer('updated_count').notNull().default(0),
  sameCount: integer('same_count').notNull().default(0),
  warningCount: integer('warning_count').notNull().default(0),
  errorCount: integer('error_count').notNull().default(0),
  status: text('status', { enum: ['COMMITTED', 'FAILED'] }).notNull().default('COMMITTED'),
  summaryJson: text('summary_json'),
  ...timestamps,
}, (table) => [
  index('idx_import_batch_actor').on(table.actorEmployeeId),
  index('idx_import_batch_created').on(table.createdAt),
]);

export const attendance = sqliteTable('attendance', {
  id: text('id').primaryKey(),
  employeeId: text('employee_id').notNull().references(() => employees.id, { onDelete: 'restrict' }),
  workDate: text('work_date').notNull(),
  checkInAt: text('check_in_at'),
  checkOutAt: text('check_out_at'),
  source: text('source', { enum: ['WEB', 'EXCEL', 'ADMIN_EDIT'] }).notNull().default('WEB'),
  /** 대표 근태상태: NORMAL|LATE|EARLY_LEAVE|ABSENT|FULL_DAY|HALF_DAY|QUARTER_DAY|HOURLY */
  representativeStatus: text('representative_status'),
  /** 지각 세부 플래그 (대표상태가 EARLY_LEAVE여도 지각이 함께 발생한 경우 true) */
  isLate: integer('is_late', { mode: 'boolean' }).notNull().default(false),
  /** 조퇴 세부 플래그 (대표상태가 LATE여도 조퇴가 함께 발생한 경우 true) */
  isEarlyLeave: integer('is_early_leave', { mode: 'boolean' }).notNull().default(false),
  /** ADMIN 보정 전 원본 출근시간 (보정 이력 추적) */
  originalCheckInAt: text('original_check_in_at'),
  /** ADMIN 보정 전 원본 퇴근시간 (보정 이력 추적) */
  originalCheckOutAt: text('original_check_out_at'),
  /** Excel 일괄 업로드 Import Batch ID (Phase 8) */
  importBatchId: text('import_batch_id').references(() => attendanceImportBatches.id, { onDelete: 'set null' }),
  ...timestamps,
}, (table) => [
  uniqueIndex('uq_attendance_employee_date').on(table.employeeId, table.workDate),
  index('idx_attendance_work_date').on(table.workDate),
  index('idx_attendance_status').on(table.employeeId, table.representativeStatus),
  index('idx_attendance_employee_date').on(table.employeeId, table.workDate),
  index('idx_attendance_import_batch').on(table.importBatchId),
]);

export const workCalendar = sqliteTable('work_calendar', {
  calendarDate: text('calendar_date').primaryKey(),
  dayType: text('day_type', {
    enum: ['NORMAL_WORKDAY', 'WORKDAY', 'WEEKEND', 'PUBLIC_HOLIDAY', 'COMPANY_HOLIDAY', 'SUBSTITUTE_WORKDAY'],
  }).notNull(),
  name: text('name'),
  isWorkday: integer('is_workday', { mode: 'boolean' }).notNull().default(true),
  memo: text('memo'),
  source: text('source').default('MANUAL'),
  createdBy: text('created_by').references(() => employees.id, { onDelete: 'set null' }),
  ...timestamps,
}, (table) => [
  index('idx_work_calendar_day_type').on(table.dayType),
  index('idx_work_calendar_date_type').on(table.calendarDate, table.dayType),
]);

export const overtimeWorks = sqliteTable('overtime_works', {
  id: text('id').primaryKey(),
  employeeId: text('employee_id').notNull().references(() => employees.id, { onDelete: 'restrict' }),
  workDate: text('work_date').notNull(),
  startedAt: text('started_at').notNull(),
  endedAt: text('ended_at').notNull(),
  durationMinutes: integer('duration_minutes').notNull(),
  description: text('description').notNull(),
  workType: text('work_type', { enum: ['OVERTIME', 'HOLIDAY_WORK'] }).notNull(),
  /** 대체휴무 1일 부여 옵션 (Phase 7 연계) */
  grantCompLeave: integer('grant_comp_leave', { mode: 'boolean' }).notNull().default(false),
  createdBy: text('created_by').notNull().references(() => employees.id, { onDelete: 'restrict' }),
  /** Soft Delete: 취소일시 */
  cancelledAt: text('cancelled_at'),
  /** Soft Delete: 취소한 관리자 */
  cancelledBy: text('cancelled_by').references(() => employees.id, { onDelete: 'set null' }),
  ...timestamps,
}, (table) => [
  index('idx_overtime_employee_date').on(table.employeeId, table.workDate),
  index('idx_overtime_work_date_type').on(table.workDate, table.workType),
  index('idx_overtime_cancelled').on(table.cancelledAt),
]);

export const compensatoryLeaves = sqliteTable('compensatory_leaves', {
  id: text('id').primaryKey(),
  employeeId: text('employee_id').notNull().references(() => employees.id, { onDelete: 'restrict' }),
  sourceOvertimeId: text('source_overtime_id').notNull().unique().references(() => overtimeWorks.id, { onDelete: 'restrict' }),
  issuedOn: text('issued_on').notNull(),
  expiresOn: text('expires_on').notNull(),
  status: text('status', { enum: ['AVAILABLE', 'USED', 'EXPIRED'] }).notNull().default('AVAILABLE'),
  issuedBy: text('issued_by').notNull().references(() => employees.id, { onDelete: 'restrict' }),
  /** Soft Delete / 취소 일시 */
  cancelledAt: text('cancelled_at'),
  /** Soft Delete / 취소한 관리자 */
  cancelledBy: text('cancelled_by').references(() => employees.id, { onDelete: 'set null' }),
  ...timestamps,
}, (table) => [
  index('idx_comp_leave_employee_status_expiry').on(table.employeeId, table.status, table.expiresOn),
  index('idx_comp_leave_cancelled').on(table.cancelledAt),
]);

export const compensatoryLeaveUsages = sqliteTable('compensatory_leave_usages', {
  id: text('id').primaryKey(),
  compensatoryLeaveId: text('compensatory_leave_id').notNull().unique().references(() => compensatoryLeaves.id, { onDelete: 'restrict' }),
  employeeId: text('employee_id').notNull().references(() => employees.id, { onDelete: 'restrict' }),
  usedOn: text('used_on').notNull(),
  registeredBy: text('registered_by').notNull().references(() => employees.id, { onDelete: 'restrict' }),
  ...timestamps,
}, (table) => [
  uniqueIndex('uq_comp_leave_usage_employee_date').on(table.employeeId, table.usedOn),
]);

export const leaveOfAbsencePeriods = sqliteTable('leave_of_absence_periods', {
  id: text('id').primaryKey(),
  employeeId: text('employee_id').notNull().references(() => employees.id, { onDelete: 'restrict' }),
  startedOn: text('started_on').notNull(),
  endedOn: text('ended_on'),
  reason: text('reason'),
  ...timestamps,
}, (table) => [
  index('idx_leave_absence_employee_dates').on(table.employeeId, table.startedOn, table.endedOn),
]);

export const auditLogs = sqliteTable('audit_logs', {
  id: text('id').primaryKey(),
  actorEmployeeId: text('actor_employee_id').references(() => employees.id, { onDelete: 'set null' }),
  targetEmployeeId: text('target_employee_id').references(() => employees.id, { onDelete: 'set null' }),
  entityType: text('entity_type').notNull(),
  entityId: text('entity_id').notNull(),
  action: text('action', { enum: ['CREATE', 'UPDATE', 'DELETE', 'LOGIN'] }).notNull(),
  targetDate: text('target_date'),
  beforeJson: text('before_json'),
  afterJson: text('after_json'),
  reason: text('reason'),
  createdAt: text('created_at').notNull(),
}, (table) => [
  index('idx_audit_entity').on(table.entityType, table.entityId),
  index('idx_audit_target_date').on(table.targetEmployeeId, table.targetDate),
  index('idx_audit_created_at').on(table.createdAt),
]);
