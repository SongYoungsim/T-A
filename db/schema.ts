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
  employmentStatus: text('employment_status', { enum: ['ACTIVE', 'ON_LEAVE', 'TERMINATED'] }).notNull().default('ACTIVE'),
  role: text('role', { enum: ['ADMIN', 'USER'] }).notNull().default('USER'),
  standardStartMinute: integer('standard_start_minute').notNull().default(540),
  standardEndMinute: integer('standard_end_minute').notNull().default(1080),
  terminatedOn: text('terminated_on'),
  ...timestamps,
}, (table) => [
  index('idx_employees_status_department').on(table.employmentStatus, table.department),
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
  grantedHours: integer('granted_hours').notNull().default(0),
  carriedHours: integer('carried_hours').notNull().default(0),
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
  hours: integer('hours').notNull(),
  registeredBy: text('registered_by').notNull().references(() => employees.id, { onDelete: 'restrict' }),
  ...timestamps,
}, (table) => [
  uniqueIndex('uq_leave_usage_employee_date').on(table.employeeId, table.leaveDate),
  index('idx_leave_usage_master').on(table.leaveMasterId),
]);

export const attendance = sqliteTable('attendance', {
  id: text('id').primaryKey(),
  employeeId: text('employee_id').notNull().references(() => employees.id, { onDelete: 'restrict' }),
  workDate: text('work_date').notNull(),
  checkInAt: text('check_in_at'),
  checkOutAt: text('check_out_at'),
  source: text('source', { enum: ['WEB', 'EXCEL', 'ADMIN_EDIT'] }).notNull().default('WEB'),
  representativeStatus: text('representative_status'),
  ...timestamps,
}, (table) => [
  uniqueIndex('uq_attendance_employee_date').on(table.employeeId, table.workDate),
  index('idx_attendance_work_date').on(table.workDate),
]);

export const workCalendar = sqliteTable('work_calendar', {
  calendarDate: text('calendar_date').primaryKey(),
  dayType: text('day_type', { enum: ['WORKDAY', 'WEEKEND', 'PUBLIC_HOLIDAY', 'COMPANY_HOLIDAY', 'SUBSTITUTE_WORKDAY'] }).notNull(),
  name: text('name'),
  createdBy: text('created_by').references(() => employees.id, { onDelete: 'set null' }),
  ...timestamps,
}, (table) => [index('idx_work_calendar_day_type').on(table.dayType)]);

export const overtimeWorks = sqliteTable('overtime_works', {
  id: text('id').primaryKey(),
  employeeId: text('employee_id').notNull().references(() => employees.id, { onDelete: 'restrict' }),
  workDate: text('work_date').notNull(),
  startedAt: text('started_at').notNull(),
  endedAt: text('ended_at').notNull(),
  durationMinutes: integer('duration_minutes').notNull(),
  description: text('description').notNull(),
  workType: text('work_type', { enum: ['OVERTIME', 'HOLIDAY_WORK'] }).notNull(),
  createdBy: text('created_by').notNull().references(() => employees.id, { onDelete: 'restrict' }),
  ...timestamps,
}, (table) => [
  index('idx_overtime_employee_date').on(table.employeeId, table.workDate),
  index('idx_overtime_work_date_type').on(table.workDate, table.workType),
]);

export const compensatoryLeaves = sqliteTable('compensatory_leaves', {
  id: text('id').primaryKey(),
  employeeId: text('employee_id').notNull().references(() => employees.id, { onDelete: 'restrict' }),
  sourceOvertimeId: text('source_overtime_id').notNull().unique().references(() => overtimeWorks.id, { onDelete: 'restrict' }),
  issuedOn: text('issued_on').notNull(),
  expiresOn: text('expires_on').notNull(),
  status: text('status', { enum: ['AVAILABLE', 'USED', 'EXPIRED'] }).notNull().default('AVAILABLE'),
  issuedBy: text('issued_by').notNull().references(() => employees.id, { onDelete: 'restrict' }),
  ...timestamps,
}, (table) => [
  index('idx_comp_leave_employee_status_expiry').on(table.employeeId, table.status, table.expiresOn),
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
