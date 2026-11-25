import type { Metadata } from 'next';
import './globals.css';
import { Analytics } from "@vercel/analytics/next";

export const metadata: Metadata = {
  metadataBase: new URL('https://my-lotto-iota.vercel.app'),
  title: '목표 등수 선택형 AI 로또 분석기 | 당첨 번호 조회 · QR 대조',
  description:
    '역대 당첨 데이터 통계 가중치 기반 목표 등수별 로또 번호 추출기 및 회차별 당첨 번호 조회·QR 코드 대조 서비스',
  openGraph: {
    title: '목표 등수 선택형 AI 로또 분석기',
    description:
      '1등부터 5등까지 원하는 목표 등수에 맞춰 통계 가중치 번호를 추출하고, 구매 용지 QR 코드로 당첨 여부를 한 번에 확인하세요.',
    url: 'https://my-lotto-iota.vercel.app',
    siteName: 'AI 로또 분석기',
    locale: 'ko_KR',
    type: 'website',
  },
  other: {
    'google-adsense-account': 'ca-pub-7260186338959787',
    'naver-site-verification': '00ac148d8489f5ad522e644d319f67f641351e84',
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
        <Analytics />
            </body>
    </html>
  );
}