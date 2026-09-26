import { ArrowRight, CheckCircle2, Database, ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function PagePlaceholder({
  title,
  description,
  phase,
  bullets,
}: {
  title: string;
  description: string;
  phase: string;
  bullets: string[];
}) {
  return (
    <div className="space-y-6">
      <div>
        <div className="mb-2 flex items-center gap-2">
          <Badge variant="secondary">{phase}</Badge>
          <span className="text-sm text-muted-foreground">라우팅 및 권한 골격 완료</span>
        </div>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">{title}</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground md:text-base">{description}</p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {[
          { icon: Database, title: '데이터 모델', text: '연관 테이블과 무결성 제약을 스키마에 반영했습니다.' },
          { icon: ShieldCheck, title: '접근 권한', text: 'ADMIN/USER 메뉴와 접근 범위를 분리했습니다.' },
          { icon: CheckCircle2, title: '다음 구현', text: bullets[0] },
        ].map(({ icon: Icon, title: itemTitle, text }) => (
          <Card key={itemTitle} className="shadow-sm">
            <CardHeader className="pb-3">
              <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary"><Icon className="size-5" /></span>
              <CardTitle className="text-base">{itemTitle}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm leading-6 text-muted-foreground">{text}</CardContent>
          </Card>
        ))}
      </div>
      <Card className="shadow-sm">
        <CardHeader><CardTitle className="text-base">구현 예정 항목</CardTitle></CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          {bullets.map((bullet) => (
            <div key={bullet} className="flex items-center gap-3 rounded-xl border bg-muted/30 p-4 text-sm">
              <ArrowRight className="size-4 shrink-0 text-primary" />
              {bullet}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}