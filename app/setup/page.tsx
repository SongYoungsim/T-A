import Image from 'next/image';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SetupForm } from '@/components/setup-form';

export const dynamic = 'force-dynamic';

export default function SetupPage() {
  return (
    <main className="flex min-h-svh items-center justify-center bg-[#f6f8fb] px-4 py-10">
      <Card className="w-full max-w-lg shadow-lg">
        <CardHeader className="space-y-3">
          <Image src="/logo_icon.png" alt="T&A" width={42} height={42} />
          <CardTitle className="text-2xl">HR 시스템 초기 설정</CardTitle>
        </CardHeader>
        <CardContent><SetupForm /></CardContent>
      </Card>
    </main>
  );
}