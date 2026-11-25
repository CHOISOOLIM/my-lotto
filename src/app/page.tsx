'use client';

import React, { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import LottoChecker from '@/components/LottoChecker';
import WinningStoresFinder from '@/components/WinningStoresFinder';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type TargetRank = 1 | 2 | 3 | 4 | 5;

interface RankConfig {
  rank: TargetRank;
  title: string;
  badge: string;
  subtitle: string;
  detail: string;
  filterNote: string;
}

interface LatestDraw {
  draw_no: number;
  draw_date: string;
  numbers: number[];
  bonus_no: number;
}

const RANK_CONFIGS: Record<TargetRank, RankConfig> = {
  1: {
    rank: 1,
    title: '1등',
    badge: '고위험 · 초고배당',
    subtitle: '1등 대박 노리기',
    detail: '역대 최다 출현 번호 + 최근 10회 미출현 이월수 황금비율 조합',
    filterNote: '적용 필터: 합계 120~155 구간 · 홀짝 3:3 또는 4:2 집중 필터',
  },
  2: {
    rank: 2,
    title: '2등',
    badge: '고배당 · 보너스 적중',
    subtitle: '2등 보너스볼 정밀 공략',
    detail: '최근 20회차 보너스볼 출현 빈도 상위권 + 주력 번호 교차 배합',
    filterNote: '적용 필터: 연속번호 1쌍 허용 · 끝수 중복 2개 이하 필터',
  },
  3: {
    rank: 3,
    title: '3등',
    badge: '중위험 · 실속 당첨',
    subtitle: '3등 5개 적중 밸런스',
    detail: '최근 15회차 핫넘버 중심 + 번호대(1~45) 균등 분산 알고리즘',
    filterNote: '적용 필터: 5개 구간 중 최소 4개 구간 분산 · 고저 3:3 필터',
  },
  4: {
    rank: 4,
    title: '4등',
    badge: '안정형 · 5만원 목표',
    subtitle: '4등 고정 당첨 확률 극대화',
    detail: '직전 5회차 출현 흐름 반영 + 빈출 쌍(동반 출현) 가중치 적용',
    filterNote: '적용 필터: 최근 빈출 구간 가중치 1.5배 적용',
  },
  5: {
    rank: 5,
    title: '5등',
    badge: '저위험 · 본전 회수형',
    subtitle: '5등 3개 적중 최다 커버리지',
    detail: '역대 누적 출현 상위 20개 핵심 번호군에서 조합 분산 추출',
    filterNote: '적용 필터: 게임 간 번호 겹침 최소화 커버리지 알고리즘',
  },
};

// 개발자 후원용 쿠팡 파트너스 추천 상품 (제주삼다수 & 삼양 불닭볶음면 확정)
const AFFILIATE_ITEMS = [
  {
    tag: '개발자 추천템 01',
    title: '제주삼다수 그린 생수 (로켓배송)',
    desc: '매일 마시는 필수 생수, 로켓배송으로 편하게 받아보세요',
    url: 'https://link.coupang.com/a/iVFBkwn06S',
    badge: '생필품 필수',
  },
  {
    tag: '개발자 추천템 02',
    title: '삼양 불닭볶음면 (로켓프레시)',
    desc: '스트레스 풀리는 화끈한 매운맛, 간편하게 주문하세요',
    url: 'https://link.coupang.com/a/iVFNf2jg5Y',
    badge: '인기 간편식',
  },
];

function getBallColor(num: number): string {
  if (num <= 10) return 'bg-amber-400 text-slate-950';
  if (num <= 20) return 'bg-sky-400 text-slate-950';
  if (num <= 30) return 'bg-rose-400 text-white';
  if (num <= 40) return 'bg-slate-400 text-slate-950';
  return 'bg-emerald-400 text-slate-950';
}

export default function Home() {
  const [selectedRank, setSelectedRank] = useState<TargetRank>(1);
  const [gameCount, setGameCount] = useState<number>(5);
  const [generatedGames, setGeneratedGames] = useState<number[][]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [latestDraw, setLatestDraw] = useState<LatestDraw | null>(null);

  const currentConfig = RANK_CONFIGS[selectedRank];

  useEffect(() => {
    async function fetchLatestDraw() {
      const { data } = await supabase
        .from('lotto_draws')
        .select('draw_no, draw_date, numbers, bonus_no')
        .order('draw_no', { ascending: false })
        .limit(1)
        .single();

      if (data) {
        setLatestDraw(data as LatestDraw);
      }
    }
    fetchLatestDraw();
  }, []);

  async function handleGenerate() {
    setIsLoading(true);
    setCopiedIdx(null);

    try {
      const { data: draws } = await supabase
        .from('lotto_draws')
        .select('numbers, bonus_no')
        .order('draw_no', { ascending: false })
        .limit(100);

      const freqMap = new Map<number, number>();
      for (let i = 1; i <= 45; i++) freqMap.set(i, 1);

      if (draws && draws.length > 0) {
        draws.forEach((row, idx) => {
          const recencyWeight = idx < 15 ? 2 : 1;
          (row.numbers as number[]).forEach((n) => {
            freqMap.set(n, (freqMap.get(n) || 1) + recencyWeight);
          });
          if (selectedRank === 2 && row.bonus_no) {
            freqMap.set(row.bonus_no, (freqMap.get(row.bonus_no) || 1) + 3);
          }
        });
      }

      const pool: number[] = [];
      freqMap.forEach((weight, num) => {
        const count =
          selectedRank === 5
            ? Math.min(weight, 6)
            : selectedRank === 1
            ? Math.max(1, 10 - Math.min(weight, 8))
            : weight;
        for (let k = 0; k < count; k++) {
          pool.push(num);
        }
      });

      const games: number[][] = [];
      for (let g = 0; g < gameCount; g++) {
        let attempts = 0;
        let validSet: number[] = [];

        while (attempts < 40) {
          attempts++;
          const picked = new Set<number>();
          while (picked.size < 6) {
            const randNum = pool[Math.floor(Math.random() * pool.length)];
            picked.add(randNum);
          }
          const sorted = Array.from(picked).sort((a, b) => a - b);
          const sum = sorted.reduce((acc, cur) => acc + cur, 0);
          const oddCount = sorted.filter((n) => n % 2 === 1).length;

          if (selectedRank === 1) {
            if (sum >= 115 && sum <= 165 && (oddCount === 3 || oddCount === 4 || oddCount === 2)) {
              validSet = sorted;
              break;
            }
          } else {
            validSet = sorted;
            break;
          }
          validSet = sorted;
        }
        games.push(validSet);
      }

      setGeneratedGames(games);
    } finally {
      setIsLoading(false);
    }
  }

  function handleCopyGame(nums: number[], idx: number) {
    navigator.clipboard.writeText(nums.join(', '));
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 1500);
  }

  return (
    <main className="min-h-screen bg-[#070b14] text-slate-100 py-8 px-4">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* 상단 헤더 */}
        <header className="text-center space-y-2.5">
          <div className="inline-block px-3.5 py-1 rounded-full bg-indigo-950/90 border border-indigo-500/30 text-indigo-300 text-xs font-semibold">
            {latestDraw
              ? `역대 1~${latestDraw.draw_no}회차 당첨 데이터 실시간 분석 엔진`
              : '역대 당첨 데이터 실시간 분석 엔진'}
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-amber-400">
            목표 등수 선택형 AI 로또 분석기
          </h1>
          <p className="text-xs sm:text-sm text-slate-400">
            원하는 목표 등수를 선택하면 해당 구간 당첨 통계 가중치를 적용해 번호를 추출합니다.
          </p>
        </header>

        {/* 직전 주(최신 회차) 1등 당첨번호 배너 */}
        {latestDraw && (
          <section className="bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900 border border-amber-400/30 rounded-2xl p-4 sm:p-5 shadow-lg">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="space-y-0.5 text-center sm:text-left">
                <div className="inline-flex items-center gap-1.5">
                  <span className="px-2 py-0.5 rounded-md bg-amber-400/15 text-amber-300 text-[11px] font-bold">
                    직전 회차 1등 당첨번호
                  </span>
                  <span className="text-[11px] text-slate-400">
                    {latestDraw.draw_date} 추첨
                  </span>
                </div>
                <div className="text-base sm:text-lg font-extrabold text-white">
                  제 <span className="text-amber-400">{latestDraw.draw_no}회</span> 당첨결과
                </div>
              </div>

              <div className="flex items-center justify-center gap-1.5 sm:gap-2">
                {latestDraw.numbers.map((num) => (
                  <span
                    key={num}
                    className={`w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center text-xs sm:text-sm font-extrabold shadow-md ${getBallColor(
                      num
                    )}`}
                  >
                    {num}
                  </span>
                ))}
                <span className="text-slate-400 font-bold text-sm px-0.5">+</span>
                <span
                  title="보너스 번호"
                  className={`w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center text-xs sm:text-sm font-extrabold shadow-md ring-2 ring-amber-400/60 ${getBallColor(
                    latestDraw.bonus_no
                  )}`}
                >
                  {latestDraw.bonus_no}
                </span>
              </div>
            </div>
          </section>
        )}

        {/* 상단 광고 배너 영역 */}
        <div className="w-full border border-dashed border-slate-700/80 bg-slate-900/40 rounded-xl py-3 px-4 text-center">
          <span className="text-[11px] text-slate-500">
            [상단 광고 배너 영역 · Google AdSense 728x90 / 반응형]
          </span>
        </div>

        {/* 1. 목표 등수 선택 및 번호 추출 카드 */}
        <section className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-xl">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-white">1. 목표 등수 선택</h2>
            <span className="text-xs font-semibold text-amber-400">
              {currentConfig.badge}
            </span>
          </div>

          <div className="grid grid-cols-5 gap-2">
            {([1, 2, 3, 4, 5] as TargetRank[]).map((rank) => (
              <button
                key={rank}
                type="button"
                onClick={() => setSelectedRank(rank)}
                className={`py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all border ${
                  selectedRank === rank
                    ? 'bg-indigo-600 border-indigo-400 text-white shadow-lg shadow-indigo-600/30'
                    : 'bg-slate-950/70 border-slate-800 text-slate-400 hover:text-white hover:border-slate-700'
                }`}
              >
                {rank}등
              </button>
            ))}
          </div>

          <div className="bg-slate-950/80 border border-slate-800/90 rounded-xl p-4 space-y-1.5">
            <div className="text-sm font-bold text-indigo-300">
              {currentConfig.subtitle}
            </div>
            <p className="text-xs text-slate-300">{currentConfig.detail}</p>
            <p className="text-[11px] text-slate-500 pt-0.5">
              {currentConfig.filterNote}
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
            <select
              value={gameCount}
              onChange={(e) => setGameCount(Number(e.target.value))}
              className="bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-3 text-xs sm:text-sm text-white font-medium focus:outline-none focus:border-indigo-500"
            >
              <option value={1}>1게임 (1,000원)</option>
              <option value={3}>3게임 (3,000원)</option>
              <option value={5}>5게임 (5,000원 · 1장)</option>
              <option value={10}>10게임 (10,000원 · 2장)</option>
            </select>

            <button
              type="button"
              onClick={handleGenerate}
              disabled={isLoading}
              className="flex-1 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-extrabold text-sm py-3 px-5 rounded-xl shadow-lg shadow-amber-500/25 transition-all"
            >
              {isLoading
                ? '통계 가중치 분석 중...'
                : `${selectedRank}등 맞춤 번호 ${gameCount}게임 추출하기`}
            </button>
          </div>

          {/* 추출 결과 리스트 */}
          {generatedGames.length > 0 && (
            <div className="space-y-2 pt-3 border-t border-slate-800">
              {generatedGames.map((nums, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="text-xs font-bold text-slate-500 w-6">
                      {String.fromCharCode(65 + (idx % 26))}
                    </span>
                    <div className="flex gap-1.5">
                      {nums.map((num) => (
                        <span
                          key={num}
                          className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-xs font-extrabold shadow ${getBallColor(
                            num
                          )}`}
                        >
                          {num}
                        </span>
                      ))}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleCopyGame(nums, idx)}
                    className="text-[11px] px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium transition"
                  >
                    {copiedIdx === idx ? '복사됨!' : '번호 복사'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* 2. 회차별 당첨 번호 조회 & QR / 내 번호 대조기 */}
        <LottoChecker />

        {/* 3. 1·2등 당첨 판매점 조회 */}
      <WinningStoresFinder latestDrawNo={latestDraw?.draw_no} />

        {/* 3. 하단 수익화 / 쿠팡 파트너스 개발자 후원 슬롯 */}
        <section className="bg-slate-900/90 border border-amber-500/30 rounded-2xl p-5 space-y-3 shadow-lg">
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-amber-400">
                ☕ 무료 서비스 유지를 위한 개발자 후원하기
              </span>
              <span className="text-[10px] text-slate-500">제휴 후원</span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              아래 링크를 통해 쿠팡에서 평소 필요한 상품을 구매하시면 추가 비용 없이 개발자의 서버 운영에 큰 도움이 됩니다.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {AFFILIATE_ITEMS.map((item, idx) => (
              <a
                key={idx}
                href={item.url}
                target="_blank"
                rel="noopener noreferrer sponsored"
                className="group block bg-slate-950/90 hover:bg-slate-800/90 border border-slate-800 hover:border-amber-400/50 rounded-xl p-3.5 transition-all"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-semibold text-indigo-300">
                    {item.tag}
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300">
                    {item.badge}
                  </span>
                </div>
                <div className="font-bold text-sm text-white group-hover:text-amber-300 transition-colors">
                  {item.title}
                </div>
                <p className="text-xs text-slate-400 mt-1">{item.desc}</p>
              </a>
            ))}
          </div>

          <p className="text-[10px] text-slate-500 text-center pt-1">
            이 포스팅은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.
          </p>
        </section>
      </div>
    </main>
  );
}