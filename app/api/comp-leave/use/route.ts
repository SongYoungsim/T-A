import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { useCompensatoryLeave } from '@/lib/compensatory-leave';
import { createSafeErrorResponse } from '@/lib/error-logger';

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== 'ADMIN') {
      return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });
    }

    const body = (await request.json()) as {
      employeeId?: string;
      compensatoryLeaveId?: string;
      usedOn?: string;
    };

    if (!body.employeeId || !body.compensatoryLeaveId || !body.usedOn) {
      return NextResponse.json({ error: '직원, 대체휴무 및 사용일자는 필수입니다.' }, { status: 400 });
    }

    const result = await useCompensatoryLeave({
      employeeId: body.employeeId,
      compensatoryLeaveId: body.compensatoryLeaveId,
      usedOn: body.usedOn,
      actorId: user.employeeId,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ ok: true, usageId: result.usageId });
  } catch (error) {
    return createSafeErrorResponse({
      feature: '대체휴무사용등록',
      error,
      userMessage: '대체휴무 사용 등록 중 오류가 발생했습니다.',
    });
  }
}
