/**
 * lib/error-logger.ts
 * Phase 10: 안전한 운영 에러 로깅 및 클라이언트 응답 헬퍼
 *
 * 원칙:
 * 1. 클라이언트(사용자/직원)에게 내부 SQL, 스택트레이스, DB ID 등 기술정보를 절대 노출하지 않습니다.
 * 2. 추적 가능한 고유 Error ID(ERR-XXXXX)를 발급하여 관리자/서버 로그와 연결합니다.
 * 3. 비밀번호, 토큰, 세션, 쿠키 등 민감정보는 서버 로그에서도 마스킹합니다.
 */

import { NextResponse } from 'next/server';

export interface SafeErrorLogEntry {
  errorId: string;
  timestamp: string;
  feature: string;
  errorType: string;
  message: string;
  context?: Record<string, unknown>;
}

const SENSITIVE_KEYS = new Set([
  'password',
  'passwordHash',
  'token',
  'sessionToken',
  'secret',
  'cookie',
  'cookies',
  'setupSecret',
]);

function maskSensitiveData(data: unknown): unknown {
  if (data === null || data === undefined) return data;
  if (typeof data !== 'object') return data;
  if (Array.isArray(data)) return data.map(maskSensitiveData);

  const masked: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
    if (SENSITIVE_KEYS.has(k) || SENSITIVE_KEYS.has(k.toLowerCase())) {
      masked[k] = '********';
    } else {
      masked[k] = maskSensitiveData(v);
    }
  }
  return masked;
}

export function logServerError(params: {
  feature: string;
  error: unknown;
  context?: Record<string, unknown>;
}): string {
  const errorId = `ERR-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
  const timestamp = new Date().toISOString();
  const errorObj = params.error instanceof Error ? params.error : new Error(String(params.error));

  const logEntry: SafeErrorLogEntry = {
    errorId,
    timestamp,
    feature: params.feature,
    errorType: errorObj.name || 'ServerError',
    message: errorObj.message,
    context: params.context ? (maskSensitiveData(params.context) as Record<string, unknown>) : undefined,
  };

  // Cloudflare Workers 콘솔 및 런타임 표준 출력 로깅
  console.error(
    `[SERVER_ERROR] [${logEntry.timestamp}] [${logEntry.errorId}] [${logEntry.feature}] ${logEntry.message}`,
    logEntry.context ? JSON.stringify(logEntry.context) : ''
  );

  return errorId;
}

export function createSafeErrorResponse(params: {
  feature: string;
  error: unknown;
  status?: number;
  userMessage?: string;
  context?: Record<string, unknown>;
}) {
  const errorId = logServerError({
    feature: params.feature,
    error: params.error,
    context: params.context,
  });

  const status = params.status || 500;
  const message = params.userMessage || '처리 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.';

  return NextResponse.json(
    {
      error: message,
      errorId,
    },
    { status }
  );
}
