'use client';

import React, { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type TargetRank = 1 | 2 | 3 | 4 | 5;

interface RankConfig {
  rank: TargetRank;
  title: string;
  badge: string;
  desc: string;
  strategy: string;
}

const RANK_CONFIGS: RankConfig[] = [
  {
    rank: 1,
    title: '1등 대박 노리기',
    badge: '고위험 · 초고배당',
    desc: '역대 최다 출현 번호 + 최근 10회 미출현 이월수 황금비율 조합',
    strategy: '합계 120~155 구간 · 홀짝 3:3 또는 4:2 집중 필터'
  },
  {
    rank: 2,
    title: '2등 아슬아슬 전략',
    badge: '고배당 · 보너스 공략',
    desc: '역대 보너스 번호 최다 출현 구간 및 연번(연속번호) 1쌍 포함',
    strategy: '보너스 빈출 번호 1개 고정 + 고저 3:3 밸런스'
  },
  {
    rank: 3,
    title: '3등 현실적 당첨',
    badge: '중위험 · 안정형',
    desc: '최근 30회차 핫(Hot) 번호 위주 + 끝수 중복 최소화',
    strategy: '최근 30회 빈출 상위 20개 번호 가중치 적용'
  },
  {
    rank: 4,
    title: '4등 본전 이상 확보',
    badge: '저위험 · 적중률 우선',
    desc: '전체 회차 평균 출현율 상위 번호 중심의 안정적 분산 배치',
    strategy: '1~45번 구간별(10단위) 균등 1~2개씩 배분'
  },
  {
    rank: 5,
    title: '5등 소소한 행운 (5,000원)',
    badge: '초안정 · 다중 적중',
    desc: '가장 자주 등장하는 핵심 축 번호 2개를 고정해 3개 적중 극대화',
    strategy: '역대 최다 출현 TOP 10 번호 중 2개 필수 포함'
  }
];
// 제휴 링크 설정 (쿠팡 파트너스 단축 URL로 교체해 사용)
const AFFILIATE_ITEMS = [
  {
    tag: '행운 아이템 추천',
    title: '순금 도금 황금 두꺼비 & 금전운 부적 카드',
    desc: '지갑 속에 쏙 들어가는 재물운 부적 · 로또 용지 보관용',
    url: 'https://link.coupang.com/a/여기에_파트너스_링크_입력',
    badge: '로또 구매자 인기 1위'
  },
  {
    tag: '당첨 기원 굿즈',
    title: '고급 가죽 로또 용지 전용 지갑 홀더',
    desc: '구겨짐 없이 깔끔하게 보관하는 행운의 용지 케이스',
    url: 'https://link.coupang.com/a/여기에_파트너스_링크_입력',
    badge: '가성비 추천'
  }
];

export default function LottoGeneratorPage() {
  const [selectedRank, setSelectedRank] = useState<TargetRank>(1);
  const [gameCount, setGameCount] = useState<number>(5);
  const [generatedGames, setGeneratedGames] = useState<number[][]>([]);
  const [freqMap, setFreqMap] = useState<Record<number, number>>({});
  const [bonusFreqMap, setBonusFreqMap] = useState<Record<number, number>>({});
  const [totalDraws, setTotalDraws] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    async function loadStats() {
      const { data, error } = await supabase
        .from('lotto_draws')
        .select('numbers, bonus_no')
        .order('draw_no', { ascending: false });

      if (!error && data) {
        setTotalDraws(data.length);
        const fMap: Record<number, number> = {};
        const bMap: Record<number, number> = {};
        for (let i = 1; i <= 45; i++) {
          fMap[i] = 0;
          bMap[i] = 0;
        }
        data.forEach((row) => {
          if (Array.isArray(row.numbers)) {
            row.numbers.forEach((n: number) => {
              fMap[n] = (fMap[n] || 0) + 1;
            });
          }
          if (row.bonus_no) {
            bMap[row.bonus_no] = (bMap[row.bonus_no] || 0) + 1;
          }
        });
        setFreqMap(fMap);
        setBonusFreqMap(bMap);
      }
      setLoading(false);
    }
    loadStats();
  }, []);

  const getBallColor = (num: number) => {
    if (num <= 10) return 'bg-amber-400 text-slate-900 border-amber-500';
    if (num <= 20) return 'bg-sky-500 text-white border-sky-600';
    if (num <= 30) return 'bg-rose-500 text-white border-rose-600';
    if (num <= 40) return 'bg-slate-600 text-white border-slate-700';
    return 'bg-emerald-500 text-white border-emerald-600';
  };

  const pickWeightedNumber = (pool: number[], weights: Record<number, number>, exclude: Set<number>) => {
    const candidates = pool.filter((n) => !exclude.has(n));
    let totalWeight = 0;
    candidates.forEach((n) => {
      totalWeight += Math.max(weights[n] || 1, 1);
    });
    let r = Math.random() * totalWeight;
    for (const n of candidates) {
      r -= Math.max(weights[n] || 1, 1);
      if (r <= 0) return n;
    }
    return candidates[candidates.length - 1];
  };

  const generateOneGame = (rank: TargetRank): number[] => {
    const allNums = Array.from({ length: 45 }, (_, i) => i + 1);
    const sortedByFreq = [...allNums].sort((a, b) => (freqMap[b] || 0) - (freqMap[a] || 0));
    const sortedByBonus = [...allNums].sort((a, b) => (bonusFreqMap[b] || 0) - (bonusFreqMap[a] || 0));

    for (let attempt = 0; attempt < 100; attempt++) {
      const picked = new Set<number>();

      if (rank === 1) {
        // 1등: 상위 빈출 + 하위 미출현 혼합, 합계 115~160 필터
        while (picked.size < 6) {
          picked.add(pickWeightedNumber(allNums, freqMap, picked));
        }
      } else if (rank === 2) {
        // 2등: 보너스 빈출 번호 1개 포함 + 연번 1쌍 유도
        const bonusPick = sortedByBonus[Math.floor(Math.random() * 10)];
        picked.add(bonusPick);
        if (bonusPick < 45 && Math.random() < 0.6) picked.add(bonusPick + 1);
        while (picked.size < 6) {
          picked.add(pickWeightedNumber(allNums, freqMap, picked));
        }
      } else if (rank === 3) {
        // 3등: 빈출 상위 25개 중심 가중치 강화
        const boosted: Record<number, number> = {};
        allNums.forEach((n) => {
          boosted[n] = Math.pow(freqMap[n] || 1, 1.5);
        });
        while (picked.size < 6) {
          picked.add(pickWeightedNumber(allNums, boosted, picked));
        }
      } else if (rank === 4) {
        // 4등: 10단위 구간별 고른 분포
        const buckets = [
          allNums.slice(0, 10),
          allNums.slice(10, 20),
          allNums.slice(20, 30),
          allNums.slice(30, 40),
          allNums.slice(40, 45)
        ];
        buckets.forEach((b) => {
          picked.add(pickWeightedNumber(b, freqMap, picked));
        });
        while (picked.size < 6) {
          picked.add(pickWeightedNumber(allNums, freqMap, picked));
        }
      } else {
        // 5등: 최다 출현 TOP 10 중 2개 고정 후 나머지 가중치 추출
        const top10 = sortedByFreq.slice(0, 10);
        while (picked.size < 2) {
          picked.add(top10[Math.floor(Math.random() * top10.length)]);
        }
        while (picked.size < 6) {
          picked.add(pickWeightedNumber(allNums, freqMap, picked));
        }
      }

      const arr = Array.from(picked).sort((a, b) => a - b);
      const sum = arr.reduce((a, b) => a + b, 0);
      const odd = arr.filter((n) => n % 2 !== 0).length;

      if (rank === 1 && (sum < 115 || sum > 160 || odd < 2 || odd > 4)) {
        continue;
      }
      return arr;
    }

    return [3, 11, 19, 27, 34, 42];
  };

  const handleGenerate = () => {
    const games: number[][] = [];
    for (let i = 0; i < gameCount; i++) {
      games.push(generateOneGame(selectedRank));
    }
    setGeneratedGames(games);
  };

  const currentConfig = RANK_CONFIGS.find((c) => c.rank === selectedRank)!;

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 py-8 px-4">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* 상단 헤더 */}
        <header className="text-center space-y-2">
          <div className="inline-block px-3 py-1 rounded-full bg-indigo-500/20 border border-indigo-400/30 text-indigo-300 text-xs font-semibold">
            역대 {totalDraws > 0 ? `${totalDraws.toLocaleString()}회차` : '전체'} 당첨 데이터 실시간 분석 엔진
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight bg-gradient-to-r from-amber-300 via-yellow-200 to-indigo-300 bg-clip-text text-transparent">
            목표 등수 선택형 AI 로또 분석기
          </h1>
          <p className="text-slate-400 text-sm">
            원하는 목표 등수를 선택하면 해당 구간 당첨 통계 가중치를 적용해 번호를 추출합니다.
          </p>
        </header>

        {/* 상단 광고 슬롯 (AdSense / 제휴 배너 영역) */}
        <div className="w-full rounded-xl border border-dashed border-slate-700 bg-slate-900/60 p-3 text-center text-xs text-slate-500">
          [상단 광고 배너 영역 · Google AdSense 728x90 / 반응형]
        </div>

        {/* 1. 목표 등수 선택 카드 */}
        <section className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-xl">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-white">1. 목표 등수 선택</h2>
            <span className="text-xs text-amber-400 font-medium">{currentConfig.badge}</span>
          </div>

          <div className="grid grid-cols-5 gap-2">
            {RANK_CONFIGS.map((item) => {
              const active = selectedRank === item.rank;
              return (
                <button
                  key={item.rank}
                  onClick={() => setSelectedRank(item.rank)}
                  className={`py-3 px-2 rounded-xl font-bold text-sm transition-all border ${
                    active
                      ? 'bg-indigo-600 border-indigo-400 text-white shadow-lg shadow-indigo-500/30 scale-105'
                      : 'bg-slate-800/80 border-slate-700 text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  {item.rank}등
                </button>
              );
            })}
          </div>

          <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 space-y-1">
            <div className="font-semibold text-indigo-300 text-sm">{currentConfig.title}</div>
            <p className="text-xs text-slate-300">{currentConfig.desc}</p>
            <p className="text-[11px] text-slate-400 pt-1">적용 필터: {currentConfig.strategy}</p>
          </div>

          {/* 게임 수 선택 및 추출 버튼 */}
          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <select
              value={gameCount}
              onChange={(e) => setGameCount(Number(e.target.value))}
              className="bg-slate-800 border border-slate-700 text-white rounded-xl px-4 py-3 text-sm font-medium focus:outline-none focus:border-indigo-500"
            >
              <option value={1}>1게임 (1,000원)</option>
              <option value={3}>3게임 (3,000원)</option>
              <option value={5}>5게임 (5,000원 · 1장)</option>
              <option value={10}>10게임 (10,000원 · 2장)</option>
            </select>

            <button
              onClick={handleGenerate}
              disabled={loading}
              className="flex-1 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-extrabold py-3.5 px-6 rounded-xl shadow-lg shadow-amber-500/20 transition-all active:scale-95 disabled:opacity-50"
            >
              {loading ? 'DB 통계 불러오는 중...' : `${selectedRank}등 맞춤 번호 ${gameCount}게임 추출하기`}
            </button>
          </div>
        </section>

        {/* 추출 결과 영역 */}
        {generatedGames.length > 0 && (
          <section className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-white">
                추출된 {selectedRank}등 맞춤 번호
              </h3>
              <button
                onClick={() => {
                  const text = generatedGames
                    .map((g, idx) => `${String.fromCharCode(65 + idx)}조: ${g.join(', ')}`)
                    .join('\n');
                  navigator.clipboard.writeText(text);
                  alert('추출된 번호가 클립보드에 복사되었습니다!');
                }}
                className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-1.5 rounded-lg border border-slate-700"
              >
                전체 번호 복사
              </button>
            </div>

            <div className="space-y-3">
              {generatedGames.map((nums, idx) => {
                const sum = nums.reduce((a, b) => a + b, 0);
                const odd = nums.filter((n) => n % 2 !== 0).length;
                return (
                  <div
                    key={idx}
                    className="flex flex-wrap items-center justify-between gap-2 bg-slate-950/80 border border-slate-800/90 rounded-xl p-3.5"
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-6 text-xs font-bold text-slate-400">
                        {String.fromCharCode(65 + idx)}
                      </span>
                      <div className="flex items-center gap-1.5 sm:gap-2">
                        {nums.map((n) => (
                          <span
                            key={n}
                            className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center font-extrabold text-sm sm:text-base border-b-2 shadow-md ${getBallColor(
                              n
                            )}`}
                          >
                            {n}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="text-[11px] text-slate-400 ml-auto">
                      합계 {sum} · 홀짝 {odd}:{6 - odd}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

{/* 하단 수익화 / 쿠팡 파트너스 제휴 슬롯 */}
        <section className="bg-slate-900/90 border border-amber-500/30 rounded-2xl p-5 space-y-3 shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-amber-400">
              🍀 당첨 기원 행운 아이템 큐레이션
            </span>
            <span className="text-[10px] text-slate-500">제휴 추천</span>
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
                  <span className="text-[10px] font-semibold text-indigo-300">{item.tag}</span>
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