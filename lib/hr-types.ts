export type EmployeeRole = 'ADMIN' | 'USER';
export type EmploymentStatus = 'ACTIVE' | 'LEAVE' | 'RESIGNED';

export type LeavePeriod = {
  id: string;
  startedOn: string;
  endedOn: string | null;
  reason: string | null;
};

export type EmployeeRecord = {
  id: string;
  employeeNumber: string;
  fullName: string;
  department: string;
  jobTitle: string;
  hiredOn: string;
  employmentStatus: EmploymentStatus;
  role: EmployeeRole;
  standardStartMinute: number;
  standardEndMinute: number;
  terminatedOn: string | null;
  accountEnabled: boolean;
  lastLoginAt: string | null;
  leavePeriods?: LeavePeriod[];
};

export type CurrentUser = {
  employeeId: string;
  accountId: string;
  employeeNumber: string;
  fullName: string;
  department: string;
  jobTitle: string;
  employmentStatus: EmploymentStatus;
  role: EmployeeRole;
};