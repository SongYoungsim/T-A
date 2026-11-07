import { redirect } from 'next/navigation';
import { env } from 'cloudflare:workers';
import { getCurrentUser } from '@/lib/auth';
import { runSystemIntegrityCheck } from '@/lib/integrity';
import { SettingsView } from './settings-view';

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== 'ADMIN') {
    redirect('/login');
  }

  // 1. D1 메타데이터 및 현황 조회
  let totalEmployees = 0;
  let totalAttendance = 0;
  let totalAuditLogs = 0;
  let latestImport: { fileName: string; status: string; createdAt: string } | null = null;
  let latestAudit: { action: string; feature: string; createdAt: string } | null = null;
  let dbStatus: '정상' | '점검 필요' = '정상';

  try {
    const empCount = await env.DB.prepare('SELECT count(*) as cnt FROM employees').first<{ cnt: number }>();
    totalEmployees = empCount?.cnt ?? 0;

    const attCount = await env.DB.prepare('SELECT count(*) as cnt FROM attendance').first<{ cnt: number }>();
    totalAttendance = attCount?.cnt ?? 0;

    const auditCount = await env.DB.prepare('SELECT count(*) as cnt FROM audit_logs').first<{ cnt: number }>();
    totalAuditLogs = auditCount?.cnt ?? 0;

    const lastImportRow = await env.DB.prepare(
      `SELECT file_name as fileName, status, created_at as createdAt
       FROM attendance_import_batches
       ORDER BY created_at DESC LIMIT 1`
    ).first<{ fileName: string; status: string; createdAt: string }>();
    if (lastImportRow) {
      latestImport = lastImportRow;
    }

    const lastAuditRow = await env.DB.prepare(
      `SELECT action, entity_type as feature, created_at as createdAt
       FROM audit_logs
       ORDER BY created_at DESC LIMIT 1`
    ).first<{ action: string; feature: string; createdAt: string }>();
    if (lastAuditRow) {
      latestAudit = lastAuditRow;
    }
  } catch (err) {
    console.error('DB Status Query Failed:', err);
    dbStatus = '점검 필요';
  }

  // 2. 초기 데이터 정합성 검사 (Read-Only)
  const initialIntegrity = await runSystemIntegrityCheck();

  const isProduction = process.env.NODE_ENV === 'production' || env.APP_ENV === 'production';
  const environment = isProduction ? 'PRODUCTION' : 'DEVELOPMENT';
  const dbName = isProduction ? 'hr-attendance-prod' : 'hr-attendance-dev';

  return (
    <SettingsView
      systemInfo={{
        environment,
        dbStatus,
        dbName,
        schemaVersion: 'Phase 10 (0007_phase8_excel_import.sql)',
        totalEmployees,
        totalAttendance,
        totalAuditLogs,
        latestImport,
        latestAudit,
      }}
      initialIntegrity={initialIntegrity}
    />
  );
}