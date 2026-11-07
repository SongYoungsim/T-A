/**
 * POST /api/attendance/excel-preview — Excel 파일 업로드 및 유효성 검증/미리보기 생성 (Phase 8)
 */
import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import {
  generateAttendanceExcelPreview,
  MAX_EXCEL_FILE_SIZE_BYTES,
} from '@/lib/attendance-excel';

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user || user.role !== 'ADMIN') {
    return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file');

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: 'Excel 파일이 첨부되지 않았습니다.' }, { status: 400 });
    }

    const fileName = file.name;
    const lowerName = fileName.toLowerCase();
    if (!lowerName.endsWith('.xlsx')) {
      return NextResponse.json(
        { error: '지원되지 않는 파일 형식입니다. .xlsx 파일만 업로드할 수 있습니다.' },
        { status: 400 }
      );
    }

    if (file.size > MAX_EXCEL_FILE_SIZE_BYTES) {
      return NextResponse.json(
        { error: '파일 크기가 5MB를 초과했습니다. 더 작은 파일로 분할하여 업로드해주세요.' },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();

    const previewResult = await generateAttendanceExcelPreview({
      buffer: arrayBuffer,
      fileName,
    });

    if (!previewResult.ok) {
      return NextResponse.json({ error: previewResult.error }, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      fileName,
      fileSizeBytes: file.size,
      summary: previewResult.summary,
      rows: previewResult.rows,
    });
  } catch (err) {
    console.error('Error generating Excel attendance preview:', err);
    return NextResponse.json({ error: 'Excel 파일을 분석하는 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
