import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '목표 등수 선택형 AI 로또 분석기 | 당첨 번호 조회 · QR 대조',
  description:
    '역대 당첨 데이터 통계 가중치 기반 목표 등수별 로또 번호 추출기 및 회차별 당첨 번호 조회·QR 코드 대조 서비스',
  other: {
    'google-adsense-account': 'ca-pub-7260186338959787',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <head>
        <script
          async
          src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-7260186338959787"
          crossOrigin="anonymous"
        />
      </head>
      <body className="bg-[#070b14] text-slate-100 antialiased">
        {children}
      </body>
    </html>
  );
}