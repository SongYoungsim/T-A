import type { Metadata } from 'next';
import { Noto_Sans_KR } from 'next/font/google';
import './globals.css';

const notoSansKr = Noto_Sans_KR({
  variable: '--font-app-sans',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'T&A HR 근태관리',
  description: '사내 연차, 근태, 연장근무, 대체휴무 통합 관리',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body className={`${notoSansKr.variable} antialiased`}>{children}</body>
    </html>
  );
}