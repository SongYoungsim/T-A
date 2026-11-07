'use client';

import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { AuditLogQueryItem } from '@/lib/hr-types';
import { ShieldCheck, ArrowRight, Code, Eye, EyeOff } from 'lucide-react';

interface AuditDetailDialogProps {
  log: AuditLogQueryItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AuditDetailDialog({ log, open, onOpenChange }: AuditDetailDialogProps) {
  const [showRawJson, setShowRawJson] = useState(false);

  if (!log) return null;

  const formattedCreatedAt = (() => {
    try {
      const d = new Date(log.createdAt);
      return d.toLocaleString('ko-KR', {
        timeZone: 'Asia/Seoul',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      });
    } catch {
      return log.createdAt;
    }
  })();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-indigo-600" />
            <DialogTitle className="text-xl font-bold">감사로그 상세 내역</DialogTitle>
          </div>
          <DialogDescription>
            시스템 변경 이력과 Before / After 상세 정보입니다. (조회 전용)
          </DialogDescription>
        </DialogHeader>

        {/* 기본 메타데이터 그리드 */}
        <div className="grid grid-cols-2 gap-3 p-4 bg-muted/40 rounded-lg text-sm border">
          <div>
            <span className="text-xs text-muted-foreground block">처리일시</span>
            <span className="font-semibold text-foreground">{formattedCreatedAt}</span>
          </div>
          <div>
            <span className="text-xs text-muted-foreground block">처리자</span>
            <span className="font-semibold text-foreground">
              {log.actorName} {log.actorEmployeeNumber ? `(${log.actorEmployeeNumber})` : ''}
            </span>
          </div>
          <div>
            <span className="text-xs text-muted-foreground block">기능 / 작업</span>
            <div className="flex items-center gap-1.5 mt-0.5">
              <Badge variant="outline" className="text-xs font-normal">
                {log.feature}
              </Badge>
              <Badge variant="secondary" className="text-xs font-medium">
                {log.actionLabel}
              </Badge>
            </div>
          </div>
          <div>
            <span className="text-xs text-muted-foreground block">대상 직원 / 대상일</span>
            <span className="font-medium text-foreground">
              {log.targetEmployeeName ? (
                <>
                  {log.targetEmployeeName}
                  {log.targetEmployeeNumber ? ` (${log.targetEmployeeNumber})` : ''}
                </>
              ) : (
                <span className="text-muted-foreground">-</span>
              )}
              {log.targetDate ? ` • ${log.targetDate}` : ''}
            </span>
          </div>

          {log.reason && (
            <div className="col-span-2 pt-2 border-t mt-1">
              <span className="text-xs text-muted-foreground block">처리 사유</span>
              <p className="text-sm font-medium text-foreground bg-background p-2 rounded border mt-0.5 whitespace-pre-wrap">
                {log.reason}
              </p>
            </div>
          )}
        </div>

        {/* 변경 내역 (Before vs After) */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold flex items-center gap-1.5">
              <span>데이터 변경 내역</span>
              <span className="text-xs font-normal text-muted-foreground">
                (민감정보 자동 마스킹 적용)
              </span>
            </h4>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs gap-1 text-muted-foreground"
              onClick={() => setShowRawJson(!showRawJson)}
            >
              {showRawJson ? (
                <>
                  <EyeOff className="h-3.5 w-3.5" />
                  요약 보기
                </>
              ) : (
                <>
                  <Code className="h-3.5 w-3.5" />
                  JSON 보기
                </>
              )}
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* 변경 전 */}
            <div className="p-3 bg-red-50/50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 rounded-lg">
              <div className="text-xs font-bold text-red-700 dark:text-red-400 mb-1.5 flex items-center gap-1">
                <span>[변경 전 (Before)]</span>
              </div>
              {showRawJson ? (
                <pre className="text-xs bg-background p-2.5 rounded border overflow-x-auto max-h-48 text-muted-foreground font-mono">
                  {log.beforeJson || '기록 없음 (신규 생성)'}
                </pre>
              ) : (
                <div className="text-sm text-foreground bg-background/80 p-2.5 rounded border min-h-[60px] whitespace-pre-wrap font-sans">
                  {log.beforeSummary || '기록 없음 (신규 생성)'}
                </div>
              )}
            </div>

            {/* 변경 후 */}
            <div className="p-3 bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900 rounded-lg">
              <div className="text-xs font-bold text-emerald-700 dark:text-emerald-400 mb-1.5 flex items-center gap-1">
                <span>[변경 후 (After)]</span>
              </div>
              {showRawJson ? (
                <pre className="text-xs bg-background p-2.5 rounded border overflow-x-auto max-h-48 text-muted-foreground font-mono">
                  {log.afterJson || '기록 없음 (삭제됨)'}
                </pre>
              ) : (
                <div className="text-sm text-foreground bg-background/80 p-2.5 rounded border min-h-[60px] whitespace-pre-wrap font-sans">
                  {log.afterSummary || '기록 없음 (삭제됨)'}
                </div>
              )}
            </div>
          </div>
        </div>

        <DialogFooter className="pt-2 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            닫기
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
