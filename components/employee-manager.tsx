'use client';

import { useMemo, useState } from 'react';
import {
  CalendarRange, KeyRound, LoaderCircle, Plus, Search, UserCheck, Users,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import type { EmployeeRecord, EmploymentStatus } from '@/lib/hr-types';

const statusLabel = {
  ACTIVE: '재직',
  LEAVE: '휴직',
  RESIGNED: '퇴사',
} as const;

const statusVariant = {
  ACTIVE: 'outline',
  LEAVE: 'secondary',
  RESIGNED: 'destructive',
} as const;

function minuteToTime(value: number) {
  const hour = Math.floor(value / 60).toString().padStart(2, '0');
  const minute = (value % 60).toString().padStart(2, '0');
  return `${hour}:${minute}`;
}

function Field({
  label,
  name,
  defaultValue,
  type = 'text',
  required = true,
  disabled = false,
  minLength,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  type?: string;
  required?: boolean;
  disabled?: boolean;
  minLength?: number;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={name}>{label}{required && <span className="ml-1 text-rose-600">*</span>}</Label>
      <Input
        id={name}
        name={name}
        type={type}
        defaultValue={defaultValue}
        required={required}
        disabled={disabled}
        minLength={minLength}
        className="h-10"
      />
    </div>
  );
}

export function EmployeeManager({
  initialEmployees,
}: {
  initialEmployees: EmployeeRecord[];
}) {
  const [employees, setEmployees] = useState(initialEmployees);
  const [query, setQuery] = useState('');
  const [department, setDepartment] = useState('');
  const [status, setStatus] = useState('');
  const [role, setRole] = useState('');
  const [includeResigned, setIncludeResigned] = useState(false);
  const [selected, setSelected] = useState<EmployeeRecord | null>(null);
  const [open, setOpen] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const departments = useMemo(
    () => Array.from(new Set(employees.map((employee) => employee.department))).sort(),
    [employees],
  );

  const visibleEmployees = useMemo(() => {
    const search = query.trim().toLowerCase();
    return employees.filter((employee) => {
      if (!includeResigned && employee.employmentStatus === 'RESIGNED') return false;
      if (
        search &&
        !employee.employeeNumber.toLowerCase().includes(search) &&
        !employee.fullName.toLowerCase().includes(search)
      ) return false;
      if (department && employee.department !== department) return false;
      if (status && employee.employmentStatus !== status) return false;
      if (role && employee.role !== role) return false;
      return true;
    });
  }, [employees, query, department, status, role, includeResigned]);

  async function refresh() {
    const response = await fetch('/api/employees', { cache: 'no-store' });
    const result = (await response.json()) as { employees: EmployeeRecord[] };
    if (response.ok) setEmployees(result.employees);
  }

  function createEmployee() {
    setSelected(null);
    setOpen(true);
  }

  async function editEmployee(employee: EmployeeRecord) {
    setSelected(employee);
    setOpen(true);
    setLoadingDetail(true);
    const response = await fetch(`/api/employees/${employee.id}`, { cache: 'no-store' });
    const result = (await response.json()) as { employee?: EmployeeRecord };
    if (response.ok && result.employee) setSelected(result.employee);
    setLoadingDetail(false);
  }

  const activeCount = employees.filter((item) => item.employmentStatus === 'ACTIVE').length;
  const leaveCount = employees.filter((item) => item.employmentStatus === 'LEAVE').length;
  const adminCount = employees.filter((item) => item.role === 'ADMIN').length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-medium text-primary">Employee Master</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight md:text-3xl">사원관리</h1>
          <p className="mt-2 text-sm text-muted-foreground">직원 정보와 계정, 개인별 기준 근무시간을 관리합니다.</p>
        </div>
        <Button onClick={createEmployee} className="h-11 sm:w-auto">
          <Plus className="size-4" />직원 등록
        </Button>
      </div>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: '전체 직원', value: employees.length, icon: Users },
          { label: '재직', value: activeCount, icon: UserCheck },
          { label: '휴직', value: leaveCount, icon: CalendarRange },
          { label: '관리자', value: adminCount, icon: KeyRound },
        ].map(({ label, value, icon: Icon }) => (
          <Card key={label} className="border-0 shadow-sm">
            <CardContent className="flex items-center gap-4 p-4">
              <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
                <Icon className="size-5" />
              </span>
              <div><p className="text-xs text-muted-foreground">{label}</p><p className="text-xl font-bold">{value}<span className="ml-1 text-xs font-medium">명</span></p></div>
            </CardContent>
          </Card>
        ))}
      </section>

      <Card className="border-0 shadow-sm">
        <CardContent className="p-4 md:p-5">
          <div className="grid gap-3 lg:grid-cols-[minmax(220px,1fr)_repeat(3,minmax(130px,auto))]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="사번 또는 성명 검색" className="h-10 pl-9" />
            </div>
            <select aria-label="부서 필터" value={department} onChange={(event) => setDepartment(event.target.value)} className="h-10 rounded-lg border bg-white px-3 text-sm">
              <option value="">전체 부서</option>
              {departments.map((item) => <option key={item}>{item}</option>)}
            </select>
            <select aria-label="재직상태 필터" value={status} onChange={(event) => setStatus(event.target.value)} className="h-10 rounded-lg border bg-white px-3 text-sm">
              <option value="">전체 상태</option>
              <option value="ACTIVE">재직</option>
              <option value="LEAVE">휴직</option>
              <option value="RESIGNED">퇴사</option>
            </select>
            <select aria-label="권한 필터" value={role} onChange={(event) => setRole(event.target.value)} className="h-10 rounded-lg border bg-white px-3 text-sm">
              <option value="">전체 권한</option>
              <option value="ADMIN">ADMIN</option>
              <option value="USER">USER</option>
            </select>
          </div>
          <label className="mt-4 flex w-fit cursor-pointer items-center gap-2 text-sm text-muted-foreground">
            <input type="checkbox" checked={includeResigned} onChange={(event) => setIncludeResigned(event.target.checked)} className="size-4 rounded border" />
            퇴사자 포함
          </label>
        </CardContent>
      </Card>

      <Card className="border-0 shadow-sm">
        <CardContent className="p-0">
          <div className="hidden lg:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-5">사번</TableHead><TableHead>성명</TableHead><TableHead>부서</TableHead>
                  <TableHead>직급</TableHead><TableHead>입사일</TableHead><TableHead>기준 출근</TableHead>
                  <TableHead>기준 퇴근</TableHead><TableHead>재직상태</TableHead><TableHead>권한</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleEmployees.map((employee) => (
                  <TableRow key={employee.id} onClick={() => editEmployee(employee)} className="cursor-pointer">
                    <TableCell className="pl-5 font-medium">{employee.employeeNumber}</TableCell>
                    <TableCell>{employee.fullName}</TableCell><TableCell>{employee.department}</TableCell>
                    <TableCell>{employee.jobTitle}</TableCell><TableCell>{employee.hiredOn}</TableCell>
                    <TableCell>{minuteToTime(employee.standardStartMinute)}</TableCell>
                    <TableCell>{minuteToTime(employee.standardEndMinute)}</TableCell>
                    <TableCell><Badge variant={statusVariant[employee.employmentStatus]}>{statusLabel[employee.employmentStatus]}</Badge></TableCell>
                    <TableCell><Badge variant={employee.role === 'ADMIN' ? 'default' : 'outline'}>{employee.role}</Badge></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="grid gap-3 p-3 sm:grid-cols-2 lg:hidden">
            {visibleEmployees.map((employee) => (
              <button key={employee.id} type="button" onClick={() => editEmployee(employee)} className="rounded-xl border bg-white p-4 text-left transition hover:border-primary/40 hover:shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div><p className="font-semibold">{employee.fullName}</p><p className="mt-1 text-xs text-muted-foreground">{employee.employeeNumber} · {employee.department}</p></div>
                  <Badge variant={statusVariant[employee.employmentStatus]}>{statusLabel[employee.employmentStatus]}</Badge>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-y-2 text-sm">
                  <span className="text-muted-foreground">직급</span><span className="text-right">{employee.jobTitle}</span>
                  <span className="text-muted-foreground">기준 근무</span><span className="text-right">{minuteToTime(employee.standardStartMinute)}–{minuteToTime(employee.standardEndMinute)}</span>
                  <span className="text-muted-foreground">권한</span><span className="text-right">{employee.role}</span>
                </div>
              </button>
            ))}
          </div>

          {visibleEmployees.length === 0 && (
            <div className="py-16 text-center text-sm text-muted-foreground">조건에 맞는 직원이 없습니다.</div>
          )}
        </CardContent>
      </Card>

      <EmployeeDialog
        key={selected?.id ?? 'new'}
        open={open}
        employee={selected}
        loadingDetail={loadingDetail}
        onOpenChange={setOpen}
        onSaved={async () => {
          await refresh();
          setOpen(false);
        }}
        onDetailChanged={async () => {
          await refresh();
          if (selected) await editEmployee(selected);
        }}
      />
    </div>
  );
}

function EmployeeDialog({
  open,
  employee,
  loadingDetail,
  onOpenChange,
  onSaved,
  onDetailChanged,
}: {
  open: boolean;
  employee: EmployeeRecord | null;
  loadingDetail: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => Promise<void>;
  onDetailChanged: () => Promise<void>;
}) {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState<EmploymentStatus>(employee?.employmentStatus ?? 'ACTIVE');
  const [resetPassword, setResetPassword] = useState('');

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('');
    setPending(true);
    const form = new FormData(event.currentTarget);
    const payload = {
      employeeNumber: form.get('employeeNumber'),
      fullName: form.get('fullName'),
      department: form.get('department'),
      jobTitle: form.get('jobTitle'),
      hiredOn: form.get('hiredOn'),
      employmentStatus: form.get('employmentStatus'),
      role: form.get('role'),
      standardStartTime: form.get('standardStartTime'),
      standardEndTime: form.get('standardEndTime'),
      accountEnabled: form.get('accountEnabled') === 'on',
      initialPassword: form.get('initialPassword'),
    };
    const response = await fetch(employee ? `/api/employees/${employee.id}` : '/api/employees', {
      method: employee ? 'PATCH' : 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const result = (await response.json()) as { error?: string };
    setPending(false);
    if (!response.ok) {
      setMessage(result.error ?? '저장하지 못했습니다.');
      return;
    }
    await onSaved();
  }

  async function resetAccountPassword() {
    if (!employee) return;
    setMessage('');
    setPending(true);
    const response = await fetch(`/api/employees/${employee.id}/password-reset`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ newPassword: resetPassword }),
    });
    const result = (await response.json()) as { error?: string };
    setPending(false);
    if (!response.ok) {
      setMessage(result.error ?? '비밀번호를 초기화하지 못했습니다.');
      return;
    }
    setResetPassword('');
    setMessage('임시 비밀번호로 초기화했습니다. 기존 세션은 모두 종료됩니다.');
    await onDetailChanged();
  }

  async function addLeavePeriod(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!employee) return;
    setMessage('');
    setPending(true);
    const form = new FormData(event.currentTarget);
    const response = await fetch(`/api/employees/${employee.id}/leave-periods`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(Object.fromEntries(form)),
    });
    const result = (await response.json()) as { error?: string };
    setPending(false);
    if (!response.ok) {
      setMessage(result.error ?? '휴직기간을 저장하지 못했습니다.');
      return;
    }
    event.currentTarget.reset();
    setMessage('휴직기간을 저장했습니다.');
    await onDetailChanged();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{employee ? '직원 상세 및 수정' : '직원 등록'}</DialogTitle>
          <DialogDescription>{employee ? '사번은 생성 후 변경할 수 없습니다.' : '필수 정보를 입력하고 필요하면 로그인 계정을 함께 생성하세요.'}</DialogDescription>
        </DialogHeader>

        {loadingDetail ? (
          <div className="grid min-h-64 place-items-center"><LoaderCircle className="size-6 animate-spin text-primary" /></div>
        ) : (
          <>
            <form className="space-y-5" onSubmit={save}>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="사번" name="employeeNumber" defaultValue={employee?.employeeNumber} disabled={Boolean(employee)} />
                <Field label="성명" name="fullName" defaultValue={employee?.fullName} />
                <Field label="부서" name="department" defaultValue={employee?.department} />
                <Field label="직급" name="jobTitle" defaultValue={employee?.jobTitle} />
                <Field label="입사일" name="hiredOn" type="date" defaultValue={employee?.hiredOn} />
                <div className="space-y-2">
                  <Label htmlFor="employmentStatus">재직상태 *</Label>
                  <select id="employmentStatus" name="employmentStatus" value={status} onChange={(event) => setStatus(event.target.value as EmploymentStatus)} className="h-10 w-full rounded-lg border bg-white px-3 text-sm">
                    <option value="ACTIVE">재직</option><option value="LEAVE">휴직</option><option value="RESIGNED">퇴사</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="role">권한 *</Label>
                  <select id="role" name="role" defaultValue={employee?.role ?? 'USER'} className="h-10 w-full rounded-lg border bg-white px-3 text-sm">
                    <option value="USER">USER</option><option value="ADMIN">ADMIN</option>
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="기준 출근" name="standardStartTime" type="time" defaultValue={minuteToTime(employee?.standardStartMinute ?? 540)} />
                  <Field label="기준 퇴근" name="standardEndTime" type="time" defaultValue={minuteToTime(employee?.standardEndMinute ?? 1080)} />
                </div>
              </div>

              <div className="rounded-xl border bg-muted/30 p-4">
                <label className="flex items-start gap-3 text-sm">
                  <input name="accountEnabled" type="checkbox" defaultChecked={employee ? employee.accountEnabled : true} className="mt-0.5 size-4" />
                  <span><strong>로그인 계정 활성화</strong><span className="mt-1 block text-xs leading-5 text-muted-foreground">퇴사 처리 시 자동으로 비활성화되고 모든 세션이 종료됩니다.</span></span>
                </label>
                {!employee && <div className="mt-4"><Field label="초기 비밀번호" name="initialPassword" type="password" minLength={12} /><p className="mt-1 text-xs text-muted-foreground">12자 이상으로 설정하세요. 비밀번호 원문은 저장되지 않습니다.</p></div>}
              </div>

              {message && <p role="alert" className={`rounded-lg px-3 py-2 text-sm ${message.includes('했습니다') ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>{message}</p>}

              <div className="flex justify-end gap-2 border-t pt-4">
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>취소</Button>
                <Button disabled={pending}>{pending && <LoaderCircle className="size-4 animate-spin" />}{employee ? '변경사항 저장' : '직원 등록'}</Button>
              </div>
            </form>

            {employee && (
              <div className="space-y-5 border-t pt-5">
                <div>
                  <h3 className="font-semibold">비밀번호 초기화</h3>
                  <p className="mt-1 text-xs text-muted-foreground">기존 비밀번호는 조회할 수 없습니다. 초기화하면 기존 세션이 모두 종료됩니다.</p>
                  <div className="mt-3 flex gap-2">
                    <Input type="password" value={resetPassword} onChange={(event) => setResetPassword(event.target.value)} placeholder="새 임시 비밀번호 12자 이상" minLength={12} />
                    <Button type="button" variant="outline" onClick={resetAccountPassword} disabled={pending || resetPassword.length < 12}>초기화</Button>
                  </div>
                </div>

                {(status === 'LEAVE' || employee.leavePeriods?.length) && (
                  <div>
                    <h3 className="font-semibold">휴직기간</h3>
                    <div className="mt-3 space-y-2">
                      {employee.leavePeriods?.map((period) => (
                        <div key={period.id} className="rounded-lg border bg-muted/30 p-3 text-sm">
                          <strong>{period.startedOn} – {period.endedOn ?? '종료일 미정'}</strong>
                          {period.reason && <p className="mt-1 text-muted-foreground">{period.reason}</p>}
                        </div>
                      ))}
                    </div>
                    <form className="mt-3 grid gap-3 rounded-xl border p-4 sm:grid-cols-2" onSubmit={addLeavePeriod}>
                      <Field label="휴직 시작일" name="startedOn" type="date" />
                      <Field label="휴직 종료일" name="endedOn" type="date" required={false} />
                      <div className="sm:col-span-2"><Field label="메모" name="reason" required={false} /></div>
                      <Button className="sm:col-span-2" type="submit" variant="secondary" disabled={pending}>휴직기간 저장</Button>
                    </form>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}