import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { cancelCompensatoryLeaveUsage } from '@/lib/compensatory-leave';
import { createSafeErrorResponse } from '@/lib/error-logger';

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== 'ADMIN') {
      return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });
    }

    const body = (await request.json()) as {
      compensatoryLeaveId?: string;
      reason?: string;
    };

    if (!body.compensatoryLeaveId) {
      return NextResponse.json({ error: '대체휴무 식별자가 필요합니다.' }, { status: 400 });
    }

    const result = await cancelCompensatoryLeaveUsage({
      compensatoryLeaveId: body.compensatoryLeaveId,
      actorId: user.employeeId,
      reason: body.reason,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return createSafeErrorResponse({
      feature: '대체휴무사용취소',
      error,
      userMessage: '대체휴무 사용 취소 중 오류가 발생했습니다.',
    });
  }
}
