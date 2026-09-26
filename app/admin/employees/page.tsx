import { EmployeeManager } from '@/components/employee-manager';
import { listEmployees } from '@/lib/employees';

export const dynamic = 'force-dynamic';

export default async function EmployeesPage() {
  const employees = await listEmployees();
  return <EmployeeManager initialEmployees={employees} />;
}