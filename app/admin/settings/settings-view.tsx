'use client';

import React, { useState } from 'react';
import {
  Settings,
  Server,
  Database,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  Clock,
  RefreshCw,
  FileSpreadsheet,
  FileText,
  Lock,
  ExternalLink,
  ChevronRight,
  Info,
} from 'lucide-react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { IntegrityCheckResult } from '@/lib/integrity';

interface SystemSettingsProps {
  systemInfo: {
    environment: 'DEVELOPMENT' | 'PRODUCTION';
    dbStatus: '정상' | '점검 필요';
    dbName: string;
    schemaVersion: string;
    totalEmployees: number;
    totalAttendance: number;
    totalAuditLogs: number;
    latestImport: {
      fileName: string;
      status: string;
      createdAt: string;
    } | null;
    latestAudit: {
      action: string;
      feature: string;
      createdAt: string;
    } | null;
  };
  initialIntegrity: IntegrityCheckResult;
}

export function SettingsView({ systemInfo, initialIntegrity }: SystemSettingsProps) {
  const [integrityResult, setIntegrityResult] = useState<IntegrityCheckResult>(initialIntegrity);
  const [isChecking, setIsChecking] = useState(false);
  const [activeTab, setActiveTab] = useState<'status' | 'integrity' | 'security' | 'recovery'>('status');

  const handleRunIntegrityCheck = async () => {
    setIsChecking(true);
    try {
      const res = await fetch('/api/admin/system/integrity');
      if (res.ok) {
        const data = await res.json() as IntegrityCheckResult;
        setIntegrityResult(data);
      }
    } catch (err) {
      console.error('정합성 검사 실패:', err);
    } finally {
      setIsChecking(false);
    }
  };

  const formatDateTime = (isoStr: string) => {
    try {
      const d = new Date(isoStr);
      return d.toLocaleString('ko-KR', {
        timeZone: 'Asia/Seoul',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
    } catch {
      return isoStr;
    }
  };

  return (
    <div className="space-y-6">
      {/* 타이틀 */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Settings className="h-7 w-7 text-indigo-600" />
            시스템 운영 및 보안 관리
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            환경 설정, 데이터베이스 상태, 데이터 정합성 검사 및 재해복구(DR) 가이드를 확인합니다.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge
            variant="outline"
            className="border-indigo-300 bg-indigo-50 text-indigo-700 font-semibold"
          >
            Version 1.0 (Release Candidate)
          </Badge>
          <Badge
            variant={systemInfo.environment === 'PRODUCTION' ? 'default' : 'outline'}
            className={
              systemInfo.environment === 'PRODUCTION'
                ? 'bg-emerald-600 text-white font-mono'
                : 'border-amber-400 bg-amber-50 text-amber-800 font-mono'
            }
          >
            {systemInfo.environment}
          </Badge>
          <Badge
            variant="outline"
            className="border-emerald-300 bg-emerald-50 text-emerald-700 flex items-center gap-1 font-medium"
          >
            <CheckCircle2 className="h-3 w-3 text-emerald-600" />
            DB: {systemInfo.dbStatus}
          </Badge>
        </div>
      </div>

      {/* 상단 탭 */}
      <div className="flex border-b border-border space-x-1 sm:space-x-4">
        <button
          onClick={() => setActiveTab('status')}
          className={`py-2 px-3 text-xs sm:text-sm font-semibold border-b-2 transition-colors ${
            activeTab === 'status'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          시스템 현황
        </button>
        <button
          onClick={() => setActiveTab('integrity')}
          className={`py-2 px-3 text-xs sm:text-sm font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
            activeTab === 'integrity'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          데이터 정합성 점검
          {integrityResult.failedChecks > 0 && (
            <Badge variant="destructive" className="h-4 px-1 text-[10px]">
              {integrityResult.failedChecks}
            </Badge>
          )}
        </button>
        <button
          onClick={() => setActiveTab('security')}
          className={`py-2 px-3 text-xs sm:text-sm font-semibold border-b-2 transition-colors ${
            activeTab === 'security'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          보안 및 권한 점검
        </button>
        <button
          onClick={() => setActiveTab('recovery')}
          className={`py-2 px-3 text-xs sm:text-sm font-semibold border-b-2 transition-colors ${
            activeTab === 'recovery'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          백업 및 장애 복구 가이드
        </button>
      </div>

      {/* ─── TAB 1: 시스템 현황 ────────────────────────────────────────────── */}
      {activeTab === 'status' && (
        <div className="space-y-6">
          {/* 주요 지표 그리드 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="shadow-sm">
              <CardContent className="p-5">
                <div className="flex items-center justify-between text-muted-foreground">
                  <span className="text-xs font-semibold">현재 런타임 환경</span>
                  <Server className="h-4 w-4 text-indigo-500" />
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-2xl font-bold tracking-tight text-foreground">
                    {systemInfo.environment}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {systemInfo.environment === 'PRODUCTION'
                    ? 'Cloudflare Workers PROD 배포'
                    : '로컬 개발 및 테스트 환경'}
                </p>
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardContent className="p-5">
                <div className="flex items-center justify-between text-muted-foreground">
                  <span className="text-xs font-semibold">D1 Database 연결</span>
                  <Database className="h-4 w-4 text-emerald-500" />
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-2xl font-bold tracking-tight text-emerald-600">
                    {systemInfo.dbStatus}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground truncate" title={systemInfo.dbName}>
                  DB 식별자: {systemInfo.dbName}
                </p>
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardContent className="p-5">
                <div className="flex items-center justify-between text-muted-foreground">
                  <span className="text-xs font-semibold">적용 스키마 버전</span>
                  <ShieldCheck className="h-4 w-4 text-blue-500" />
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-lg font-bold tracking-tight text-foreground truncate">
                    {systemInfo.schemaVersion}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Phase 1~10 무결점 스키마
                </p>
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardContent className="p-5">
                <div className="flex items-center justify-between text-muted-foreground">
                  <span className="text-xs font-semibold">총 데이터 누적 현황</span>
                  <Clock className="h-4 w-4 text-purple-500" />
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-xl font-bold tracking-tight text-foreground">
                    {systemInfo.totalAttendance.toLocaleString()}
                  </span>
                  <span className="text-xs text-muted-foreground">건 근태</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  직원 {systemInfo.totalEmployees}명 · 감사로그 {systemInfo.totalAuditLogs}건
                </p>
              </CardContent>
            </Card>
          </div>

          {/* 최근 운영 이벤트 요약 카드 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-bold flex items-center gap-2">
                  <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
                  최근 Excel 일괄 등록 내역
                </CardTitle>
                <CardDescription>가장 최근 실행된 출퇴근 일괄 업로드 내역입니다.</CardDescription>
              </CardHeader>
              <CardContent>
                {systemInfo.latestImport ? (
                  <div className="p-3 bg-muted/40 rounded-lg space-y-1.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-foreground truncate">
                        {systemInfo.latestImport.fileName}
                      </span>
                      <Badge variant="outline" className="text-[10px]">
                        {systemInfo.latestImport.status}
                      </Badge>
                    </div>
                    <div className="text-muted-foreground">
                      반영일시: {formatDateTime(systemInfo.latestImport.createdAt)}
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground py-4 text-center">
                    등록된 Excel 업로드 이력이 없습니다.
                  </p>
                )}
                <div className="mt-3">
                  <Link href="/admin/attendance">
                    <Button variant="ghost" size="sm" className="w-full text-xs gap-1">
                      근태 관리에서 Excel 업로드 실행
                      <ChevronRight className="h-3.5 w-3.5" />
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-bold flex items-center gap-2">
                  <FileText className="h-4 w-4 text-indigo-600" />
                  최근 관리자 변경 내역 (감사로그)
                </CardTitle>
                <CardDescription>시스템 내 데이터 수정 및 승인 최신 기록입니다.</CardDescription>
              </CardHeader>
              <CardContent>
                {systemInfo.latestAudit ? (
                  <div className="p-3 bg-muted/40 rounded-lg space-y-1.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-foreground">
                        {systemInfo.latestAudit.feature}
                      </span>
                      <Badge variant="secondary" className="text-[10px]">
                        {systemInfo.latestAudit.action}
                      </Badge>
                    </div>
                    <div className="text-muted-foreground">
                      처리일시: {formatDateTime(systemInfo.latestAudit.createdAt)}
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground py-4 text-center">
                    기록된 감사로그가 없습니다.
                  </p>
                )}
                <div className="mt-3">
                  <Link href="/admin/audit-logs">
                    <Button variant="ghost" size="sm" className="w-full text-xs gap-1">
                      감사로그 전체 조회하기
                      <ChevronRight className="h-3.5 w-3.5" />
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* ─── TAB 2: 데이터 정합성 점검 (Read-Only) ───────────────────────── */}
      {activeTab === 'integrity' && (
        <div className="space-y-4">
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <CardTitle className="text-base font-bold flex items-center gap-2">
                    <ShieldCheck className="h-5 w-5 text-indigo-600" />
                    데이터 무결성 및 정합성 정밀 점검
                  </CardTitle>
                  <CardDescription className="mt-1">
                    운영 데이터를 변경하지 않는 Read-Only 방식으로 10개 핵심 정합성 규칙을 검사합니다.
                  </CardDescription>
                </div>

                <Button
                  onClick={handleRunIntegrityCheck}
                  disabled={isChecking}
                  size="sm"
                  className="gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs h-9"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${isChecking ? 'animate-spin' : ''}`} />
                  {isChecking ? '정합성 점검 중...' : '지금 재점검 실행'}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {/* 점검 요약 바 */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3 bg-muted/40 rounded-lg text-xs mb-4">
                <div>
                  <span className="text-muted-foreground block">총 검사항목</span>
                  <span className="text-base font-bold text-foreground">
                    {integrityResult.totalChecks}개 규칙
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground block">정상 통과</span>
                  <span className="text-base font-bold text-emerald-600">
                    {integrityResult.passedChecks}개
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground block">주의 / 확인 필요</span>
                  <span className="text-base font-bold text-amber-600">
                    {integrityResult.issues.filter((i) => i.severity === 'WARNING').length}건
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground block">심각 오류 (ERROR)</span>
                  <span className="text-base font-bold text-rose-600">
                    {integrityResult.issues.filter((i) => i.severity === 'ERROR').length}건
                  </span>
                </div>
              </div>

              {/* 검사 결과 목록 */}
              {integrityResult.issues.length === 0 ? (
                <div className="p-8 text-center bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200 rounded-lg">
                  <CheckCircle2 className="h-8 w-8 text-emerald-600 mx-auto mb-2" />
                  <p className="text-sm font-bold text-emerald-800 dark:text-emerald-300">
                    모든 데이터 정합성 규칙을 정상 통과했습니다.
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    중복 사번, 중복 근태, 연차 한도 초과, 외래키 고아 데이터 등이 감지되지 않았습니다.
                  </p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {integrityResult.issues.map((issue) => (
                    <div
                      key={issue.id}
                      className={`p-3.5 rounded-lg border text-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 ${
                        issue.severity === 'ERROR'
                          ? 'bg-rose-50/50 border-rose-200 dark:bg-rose-950/20'
                          : 'bg-amber-50/50 border-amber-200 dark:bg-amber-950/20'
                      }`}
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <Badge
                            variant={issue.severity === 'ERROR' ? 'destructive' : 'secondary'}
                            className="text-[10px] font-bold"
                          >
                            {issue.severity}
                          </Badge>
                          <span className="font-bold text-foreground text-sm">
                            {issue.title}
                          </span>
                          <span className="text-muted-foreground">({issue.category})</span>
                        </div>
                        <p className="text-muted-foreground">{issue.description}</p>
                      </div>

                      {issue.actionUrl && (
                        <div className="shrink-0">
                          <Link href={issue.actionUrl}>
                            <Button size="sm" variant="outline" className="h-7 text-xs bg-white">
                              해당 화면에서 확인
                              <ExternalLink className="h-3 w-3 ml-1" />
                            </Button>
                          </Link>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* 안내 문구 */}
              <div className="mt-4 flex items-center gap-2 p-3 bg-muted/30 rounded-lg text-xs text-muted-foreground border">
                <Info className="h-4 w-4 text-indigo-500 shrink-0" />
                <span>
                  시스템은 감지된 이상데이터를 자동으로 수정/삭제하지 않습니다. 관리자가 원본 화면으로 이동하여 사유를 확인한 후 직접 보정해 주십시오. (Req 33 준수)
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ─── TAB 3: 보안 및 권한 점검 ──────────────────────────────────────── */}
      {activeTab === 'security' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <Lock className="h-4 w-4 text-indigo-600" />
                계정 및 인증 보안 정책
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-xs">
              <div className="p-3 bg-muted/40 rounded-lg space-y-1">
                <span className="font-semibold text-foreground block">비밀번호 단방향 암호화</span>
                <p className="text-muted-foreground">
                  PBKDF2-HMAC-SHA256, 100,000회 반복, 유니크 Salt 16바이트 적용. 평문 비밀번호는 일체 저장되거나 로그에 기록되지 않습니다.
                </p>
              </div>

              <div className="p-3 bg-muted/40 rounded-lg space-y-1">
                <span className="font-semibold text-foreground block">세션 토큰 보안</span>
                <p className="text-muted-foreground">
                  32바이트 암호화 난수 토큰, SHA-256 해시 저장, HttpOnly, Secure, SameSite=Lax 쿠키, 7일 후 자동 만료.
                </p>
              </div>

              <div className="p-3 bg-muted/40 rounded-lg space-y-1">
                <span className="font-semibold text-foreground block">로그인 오류 메시지 표준화</span>
                <p className="text-muted-foreground">
                  사번 미존재와 비밀번호 불일치 시 내부 원인을 구분하지 않고 "사번 또는 비밀번호가 올바르지 않습니다"로 일반화하여 계정 열거 공격을 차단합니다.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 text-purple-600" />
                서버사이드 권한 통제 (RBAC)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-xs">
              <div className="p-3 bg-muted/40 rounded-lg space-y-1">
                <span className="font-semibold text-foreground block">ADMIN 전용 API 서버 검증</span>
                <p className="text-muted-foreground">
                  UI 버튼 숨김에 의존하지 않고, 모든 `/api/admin/*`, `/api/reports/*`, `/api/audit-logs` 등 서버 엔드포인트에서 `requireAdmin()`을 통해 비인가 호출을 403 차단합니다.
                </p>
              </div>

              <div className="p-3 bg-muted/40 rounded-lg space-y-1">
                <span className="font-semibold text-foreground block">직원 본인정보 격리</span>
                <p className="text-muted-foreground">
                  USER 권한 API는 클라이언트가 전달한 사번을 신뢰하지 않고, 반드시 세션에서 복원된 `currentUser.employeeId`만을 기준으로 데이터를 조회·등록합니다.
                </p>
              </div>

              <div className="p-3 bg-muted/40 rounded-lg space-y-1">
                <span className="font-semibold text-foreground block">SQL Injection & XSS 방지</span>
                <p className="text-muted-foreground">
                  D1 Prepared Statement 파라미터 바인딩(? 바인딩) 및 React JSX 자동 이스케이프를 적용하여 스크립트 삽입 공격을 방어합니다.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ─── TAB 4: 백업 및 장애 복구 가이드 ───────────────────────────────── */}
      {activeTab === 'recovery' && (
        <Card className="shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <Server className="h-5 w-5 text-indigo-600" />
              재해복구(DR) 및 운영 가이드
            </CardTitle>
            <CardDescription>
              사고 발생 시 운영 DB를 보호하고 복구하기 위한 표준 지침입니다. (Web 상 자동 복구 버튼 미제공 원칙)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-xs">
            <div className="p-4 bg-muted/40 rounded-lg space-y-2 border">
              <h4 className="font-bold text-sm text-foreground flex items-center gap-1.5">
                <span>1. Cloudflare D1 Time Travel 복구 절차</span>
                <Badge variant="outline" className="text-[10px]">최대 7일 이내</Badge>
              </h4>
              <p className="text-muted-foreground">
                Cloudflare D1은 시점 복구(Time Travel)를 기본 지원합니다. 관리자 실수로 데이터 손상이 발생한 경우 다음 절차를 따릅니다:
              </p>
              <ol className="list-decimal list-inside space-y-1 text-muted-foreground pl-1">
                <li>즉시 신규 데이터 등록 및 배포 작업을 일시 중단합니다.</li>
                <li>사고 발생 직전의 안전한 시점(Timestamp 또는 Bookmark)을 확인합니다.</li>
                <li>Wrangler CLI를 통해 복구 명령을 실행합니다:</li>
              </ol>
              <pre className="p-2.5 bg-background rounded border font-mono text-[11px] text-foreground overflow-x-auto">
                npx wrangler d1 time-travel restore hr-attendance-prod --timestamp=&quot;2026-09-27T08:00:00Z&quot;
              </pre>
            </div>

            <div className="p-4 bg-muted/40 rounded-lg space-y-2 border">
              <h4 className="font-bold text-sm text-foreground">
                2. 정기 수동 백업 (SQL Dump)
              </h4>
              <p className="text-muted-foreground">
                월말 마감 전 또는 대규모 스키마 마이그레이션 전에는 다음 명령어로 안전하게 로컬 암호화 스토리지에 Dump 파일을 생성합니다:
              </p>
              <pre className="p-2.5 bg-background rounded border font-mono text-[11px] text-foreground overflow-x-auto">
                npx wrangler d1 export hr-attendance-prod --output=&quot;./backups/prod-backup-$(date +%Y%m%d).sql&quot;
              </pre>
              <p className="text-muted-foreground text-[11px]">
                * 생성된 백업 파일은 절대 GitHub 등 공개 저장소에 커밋하지 않습니다. (.gitignore 자동 차단 적용됨)
              </p>
            </div>

            <div className="p-4 bg-rose-50/50 dark:bg-rose-950/20 border border-rose-200 rounded-lg space-y-1.5 text-rose-900 dark:text-rose-200">
              <h4 className="font-bold text-sm flex items-center gap-1.5">
                <AlertTriangle className="h-4 w-4 text-rose-600" />
                운영자 절대 금지 사항 (10대 원칙)
              </h4>
              <ul className="list-disc list-inside space-y-0.5 text-xs text-rose-800 dark:text-rose-300">
                <li>운영 D1 Database를 Reset하거나 DROP TABLE을 실행하지 않습니다.</li>
                <li>Production 환경에서 테스트 Seed 스크립트를 실행하지 않습니다. (자동 차단됨)</li>
                <li>DEV Worker가 Production D1 Database를 연결하도록 설정하지 않습니다.</li>
                <li>검증되지 않은 Migration을 Production에 직접 적용하지 않습니다.</li>
                <li>실제 직원 비밀번호나 개인정보를 개발/테스트 DB로 복제하지 않습니다.</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
