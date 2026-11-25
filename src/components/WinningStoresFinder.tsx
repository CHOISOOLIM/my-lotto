'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface WinningStore {
  id: number;
  draw_no: number;
  rank: 1 | 2;
  store_name: string;
  method: string | null;
  address: string;
  lat: number | null;
  lng: number | null;
}

const REGIONS = ['전체', '서울', '경기', '인천', '부산', '대구', '대전', '광주', '울산', '충남', '충북', '경남', '경북', '전남', '전북', '강원', '제주'];

export default function WinningStoresFinder({ latestDrawNo }: { latestDrawNo?: number }) {
  const [availableDraws, setAvailableDraws] = useState<number[]>([]);
  const [selectedDraw, setSelectedDraw] = useState<number | null>(null);
  const [selectedRank, setSelectedRank] = useState<'ALL' | 1 | 2>('ALL');
  const [selectedRegion, setSelectedRegion] = useState<string>('전체');
  const [keyword, setKeyword] = useState<string>('');
  const [stores, setStores] = useState<WinningStore[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // 저장된 판매점 회차 목록 불러오기
  useEffect(() => {
    async function loadDrawList() {
      const { data } = await supabase
        .from('winning_stores')
        .select('draw_no')
        .order('draw_no', { ascending: false })
        .limit(1000);

      if (data && data.length > 0) {
        const unique = Array.from(new Set(data.map((d) => d.draw_no))).sort((a, b) => b - a);
        setAvailableDraws(unique);
        setSelectedDraw(unique[0]);
      } else if (latestDrawNo) {
        setAvailableDraws([latestDrawNo]);
        setSelectedDraw(latestDrawNo);
      }
    }
    loadDrawList();
  }, [latestDrawNo]);

  // 선택한 회차의 판매점 조회
  useEffect(() => {
    if (!selectedDraw) return;

    async function fetchStores() {
      setIsLoading(true);
      try {
        const { data } = await supabase
          .from('winning_stores')
          .select('*')
          .eq('draw_no', selectedDraw)
          .order('rank', { ascending: true })
          .order('id', { ascending: true });

        setStores((data as WinningStore[]) || []);
      } finally {
        setIsLoading(false);
      }
    }

    fetchStores();
  }, [selectedDraw]);

  const filteredStores = useMemo(() => {
    return stores.filter((s) => {
      if (selectedRank !== 'ALL' && s.rank !== selectedRank) return false;
      if (selectedRegion !== '전체' && !s.address.startsWith(selectedRegion)) return false;
      if (keyword.trim()) {
        const q = keyword.trim().toLowerCase();
        const matchName = s.store_name.toLowerCase().includes(q);
        const matchAddr = s.address.toLowerCase().includes(q);
        if (!matchName && !matchAddr) return false;
      }
      return true;
    });
  }, [stores, selectedRank, selectedRegion, keyword]);

  const rank1Count = useMemo(() => stores.filter((s) => s.rank === 1).length, [stores]);
  const rank2Count = useMemo(() => stores.filter((s) => s.rank === 2).length, [stores]);

  function getKakaoMapUrl(store: WinningStore) {
    if (store.lat && store.lng) {
      return `https://map.kakao.com/link/map/${encodeURIComponent(store.store_name)},${store.lat},${store.lng}`;
    }
    return `https://map.kakao.com/link/search/${encodeURIComponent(store.address + ' ' + store.store_name)}`;
  }

  return (
    <section className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-xl">
      {/* 헤더 및 회차 선택 */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <span>3. 1·2등 당첨 판매점 조회</span>
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 font-semibold">
              명당 찾기
            </span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            회차별 1·2등 배출 판매점 위치와 자동/수동 여부를 확인하세요.
          </p>
        </div>

        {availableDraws.length > 0 && (
          <select
            value={selectedDraw ?? ''}
            onChange={(e) => setSelectedDraw(Number(e.target.value))}
            className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs sm:text-sm text-amber-300 font-bold focus:outline-none focus:border-indigo-500"
          >
            {availableDraws.map((drw) => (
              <option key={drw} value={drw}>
                제 {drw}회 당첨 판매점
              </option>
            ))}
          </select>
        )}
      </div>

      {/* 등수 필터 탭 */}
      <div className="grid grid-cols-3 gap-2">
        <button
          type="button"
          onClick={() => setSelectedRank('ALL')}
          className={`py-2 rounded-xl text-xs font-bold border transition ${
            selectedRank === 'ALL'
              ? 'bg-indigo-600 border-indigo-400 text-white'
              : 'bg-slate-950/70 border-slate-800 text-slate-400 hover:text-white'
          }`}
        >
          전체 ({stores.length})
        </button>
        <button
          type="button"
          onClick={() => setSelectedRank(1)}
          className={`py-2 rounded-xl text-xs font-bold border transition ${
            selectedRank === 1
              ? 'bg-amber-500 border-amber-400 text-slate-950'
              : 'bg-slate-950/70 border-slate-800 text-slate-400 hover:text-white'
          }`}
        >
          1등 배출점 ({rank1Count})
        </button>
        <button
          type="button"
          onClick={() => setSelectedRank(2)}
          className={`py-2 rounded-xl text-xs font-bold border transition ${
            selectedRank === 2
              ? 'bg-sky-500 border-sky-400 text-slate-950'
              : 'bg-slate-950/70 border-slate-800 text-slate-400 hover:text-white'
          }`}
        >
          2등 배출점 ({rank2Count})
        </button>
      </div>

      {/* 지역 빠른 필터 + 상호/주소 검색 */}
      <div className="space-y-2.5">
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {REGIONS.map((reg) => (
            <button
              key={reg}
              type="button"
              onClick={() => setSelectedRegion(reg)}
              className={`shrink-0 px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition ${
                selectedRegion === reg
                  ? 'bg-slate-700 border-slate-500 text-white'
                  : 'bg-slate-950/70 border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              {reg}
            </button>
          ))}
        </div>

        <input
          type="text"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="상호명 또는 동네/도로명 검색 (예: 광명, 가산, 복권명당)"
          className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none"
        />
      </div>

      {/* 판매점 목록 */}
      <div className="max-h-96 overflow-y-auto space-y-2 pr-1">
        {isLoading ? (
          <div className="text-center py-8 text-xs text-slate-400">
            당첨 판매점 정보를 불러오는 중입니다...
          </div>
        ) : filteredStores.length === 0 ? (
          <div className="text-center py-8 text-xs text-slate-500 bg-slate-950/60 rounded-xl border border-slate-800/80">
            조건에 일치하는 당첨 판매점이 없습니다.
          </div>
        ) : (
          filteredStores.map((store) => (
            <div
              key={store.id}
              className="flex items-center justify-between gap-3 bg-slate-950/90 border border-slate-800/90 hover:border-slate-700 rounded-xl p-3 transition"
            >
              <div className="min-w-0 space-y-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-extrabold ${
                      store.rank === 1
                        ? 'bg-amber-400 text-slate-950'
                        : 'bg-sky-400/20 text-sky-300 border border-sky-400/40'
                    }`}
                  >
                    {store.rank}등
                  </span>
                  {store.method && (
                    <span className="px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 text-[10px] font-semibold">
                      {store.method}
                    </span>
                  )}
                  <span className="text-xs sm:text-sm font-bold text-white truncate">
                    {store.store_name}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 truncate">{store.address}</p>
              </div>

              <a
                href={getKakaoMapUrl(store)}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-amber-500 hover:text-slate-950 text-slate-200 text-[11px] font-bold transition"
              >
                지도 보기
              </a>
            </div>
          ))
        )}
      </div>
    </section>
  );
}