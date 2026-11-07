import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { runSystemIntegrityCheck } from '@/lib/integrity';
import { createSafeErrorResponse } from '@/lib/error-logger';

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== 'ADMIN') {
      return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });
    }

    const report = await runSystemIntegrityCheck();
    return NextResponse.json(report);
  } catch (error) {
    return createSafeErrorResponse({
      feature: '시스템정합성검사',
      error,
      userMessage: '데이터 정합성 검사 중 오류가 발생했습니다.',
    });
  }
}
