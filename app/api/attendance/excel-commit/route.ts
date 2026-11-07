/**
 * POST /api/attendance/excel-commit — 검증 완료 데이터 DB 반영 (Phase 8)
 */
import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import {
  commitAttendanceExcelImport,
  type CommitRowSelection,
} from '@/lib/attendance-excel';

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user || user.role !== 'ADMIN') {
    return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });
  }

  let body: {
    fileName: string;
    fileSizeBytes: number;
    rows: CommitRowSelection[];
  };

  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: '요청 본문 형식이 올바르지 않습니다.' }, { status: 400 });
  }

  const { fileName, fileSizeBytes, rows } = body;
  if (!fileName || !rows || !Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: '반영할 근태 데이터가 없습니다.' }, { status: 400 });
  }

  try {
    const commitResult = await commitAttendanceExcelImport({
      fileName,
      fileSizeBytes: fileSizeBytes || 0,
      rows,
      actorId: user.employeeId,
    });

    if (!commitResult.ok) {
      return NextResponse.json({ error: commitResult.error }, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      result: commitResult.result,
    });
  } catch (err) {
    console.error('Error committing Excel attendance import:', err);
    return NextResponse.json(
      { error: '근태 데이터를 DB에 반영하는 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
