import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

// .env.local 환경변수 로드
const envPath = path.resolve(process.cwd(), '.env.local');
const envContent = fs.readFileSync(envPath, 'utf-8');
const envVars = {};
envContent.split(/\r?\n/).forEach((line) => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) envVars[match[1].trim()] = match[2].trim();
});

const SUPABASE_URL = envVars.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY =
  envVars.SUPABASE_SERVICE_ROLE_KEY || envVars.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const KAKAO_KEY = envVars.KAKAO_REST_API_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ .env.local에 Supabase 키가 누락되었습니다.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// 타임아웃 + 자동 재시도 fetch 헬퍼 (최대 3회 시도)
async function fetchWithRetry(url, options = {}, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000); // 15초 대기
    try {
      const res = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timer);
      return res;
    } catch (err) {
      clearTimeout(timer);
      if (attempt === retries) throw err;
      await new Promise((r) => setTimeout(r, 1500 * attempt)); // 1.5초, 3초 후 재시도
    }
  }
}

// 좌표 누락 시 카카오 로컬 API 백업 변환
const coordCache = new Map();

async function getFallbackCoords(address) {
  if (!address || !KAKAO_KEY) return { lat: null, lng: null };
  if (coordCache.has(address)) return coordCache.get(address);

  try {
    const res = await fetchWithRetry(
      `https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(
        address
      )}`,
      { headers: { Authorization: `KakaoAK ${KAKAO_KEY}` } }
    );
    const json = await res.json();
    if (json.documents && json.documents.length > 0) {
      const coords = {
        lat: parseFloat(json.documents[0].y),
        lng: parseFloat(json.documents[0].x),
      };
      coordCache.set(address, coords);
      return coords;
    }
  } catch (e) {}

  const empty = { lat: null, lng: null };
  coordCache.set(address, empty);
  return empty;
}

// 특정 회차(drwNo)의 등수별(1등/2등) 당첨 판매점 JSON API 조회
async function fetchStoresByDrawAndRank(drwNo, rank) {
  const url = `https://www.dhlottery.co.kr/wnprchsplcsrch/selectLtWnShp.do?srchWnShpRnk=${rank}&srchLtEpsd=${drwNo}&srchShpLctn=`;

  try {
    const res = await fetchWithRetry(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        Referer: 'https://www.dhlottery.co.kr/wnprchsplcsrch/home',
        'X-Requested-With': 'XMLHttpRequest',
      },
    });

    const json = await res.json();
    const list = json?.data?.list || [];

    const results = [];
    for (const item of list) {
      const storeName = (item.shpNm || '').trim();
      const address = (item.shpAddr || item.rdnm || '').trim();
      if (!storeName || !address) continue;

      let lat = item.shpLat ? parseFloat(item.shpLat) : null;
      let lng = item.shpLot ? parseFloat(item.shpLot) : null;

      if (!lat || !lng) {
        const fb = await getFallbackCoords(address);
        lat = fb.lat;
        lng = fb.lng;
      }

      results.push({
        draw_no: drwNo,
        rank,
        store_name: storeName,
        method: rank === 1 ? item.atmtPsvYnTxt || null : null,
        address,
        lat,
        lng,
      });
    }

    return results;
  } catch (err) {
    console.warn(`⚠️ ${drwNo}회 (${rank}등) 조회 지연/실패:`, err.message);
    return [];
  }
}

async function main() {
  const { data: latest } = await supabase
    .from('lotto_draws')
    .select('draw_no')
    .order('draw_no', { ascending: false })
    .limit(1)
    .single();

  const endDraw = latest?.draw_no || 1251;
  const startDraw = Math.max(1, endDraw - 29);

  console.log(`🚀 제 ${startDraw}회 ~ ${endDraw}회 1·2등 당첨 판매점 수집 시작...`);

  for (let drw = startDraw; drw <= endDraw; drw++) {
    const rank1 = await fetchStoresByDrawAndRank(drw, 1);
    const rank2 = await fetchStoresByDrawAndRank(drw, 2);
    const combined = [...rank1, ...rank2];

    if (combined.length === 0) {
      console.log(`- ${drw}회: 데이터 없음 건너뜀`);
      continue;
    }

    const uniqueMap = new Map();
    for (const row of combined) {
      const key = `${row.draw_no}_${row.rank}_${row.store_name}_${row.address}`;
      if (!uniqueMap.has(key)) uniqueMap.set(key, row);
    }
    const deduped = Array.from(uniqueMap.values());

    const { error } = await supabase
      .from('winning_stores')
      .upsert(deduped, { onConflict: 'draw_no,rank,store_name,address' });

    if (error) {
      console.error(`❌ ${drw}회 저장 오류:`, error.message);
    } else {
      console.log(
        `✅ ${drw}회: 1등 ${rank1.length}곳, 2등 ${rank2.length}곳 (총 ${deduped.length}곳) 저장 완료`
      );
    }

    // 동행복권 서버 차단 방지용 0.8초 대기
    await new Promise((r) => setTimeout(r, 800));
  }

  console.log('🎉 최근 30회차 당첨 판매점 데이터 구축 완료!');
}

main();