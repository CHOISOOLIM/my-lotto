import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// 특정 회차의 1·2등 당첨 판매점 수집 헬퍼
async function syncWinningStores(supabase: any, drawNo: number) {
  const ranks = [1, 2];
  const collected: any[] = [];

  for (const rank of ranks) {
    try {
      const url = `https://www.dhlottery.co.kr/wnprchsplcsrch/selectLtWnShp.do?srchWnShpRnk=${rank}&srchLtEpsd=${drawNo}&srchShpLctn=`;
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
          Referer: 'https://www.dhlottery.co.kr/wnprchsplcsrch/home',
          'X-Requested-With': 'XMLHttpRequest',
        },
        cache: 'no-store',
      });
      if (!res.ok) continue;

      const json = await res.json();
      const list = json?.data?.list || [];

      for (const item of list) {
        const storeName = (item.shpNm || '').trim();
        const address = (item.shpAddr || item.rdnm || '').trim();
        if (!storeName || !address) continue;

        let lat = item.shpLat ? parseFloat(item.shpLat) : null;
        let lng = item.shpLot ? parseFloat(item.shpLot) : null;

        // 동행복권 좌표 누락 시 카카오 로컬 API로 보완
        if ((!lat || !lng) && process.env.KAKAO_REST_API_KEY) {
          try {
            const kRes = await fetch(
              `https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(
                address
              )}`,
              {
                headers: {
                  Authorization: `KakaoAK ${process.env.KAKAO_REST_API_KEY}`,
                },
              }
            );
            const kJson = await kRes.json();
            if (kJson.documents && kJson.documents.length > 0) {
              lat = parseFloat(kJson.documents[0].y);
              lng = parseFloat(kJson.documents[0].x);
            }
          } catch {
            // 좌표 보완 실패 시 null 유지
          }
        }

        collected.push({
          draw_no: drawNo,
          rank,
          store_name: storeName,
          method: rank === 1 ? item.atmtPsvYnTxt || null : null,
          address,
          lat,
          lng,
        });
      }
    } catch {
      // 개별 등수 조회 지연 시 다음 등수 진행
    }
  }

  if (collected.length === 0) return 0;

  // 중복 제거
  const uniqueMap = new Map<string, any>();
  for (const row of collected) {
    const key = `${row.draw_no}_${row.rank}_${row.store_name}_${row.address}`;
    if (!uniqueMap.has(key)) uniqueMap.set(key, row);
  }
  const deduped = Array.from(uniqueMap.values());

  await supabase
    .from('winning_stores')
    .upsert(deduped, { onConflict: 'draw_no,rank,store_name,address' });

  return deduped.length;
}

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (
    process.env.CRON_SECRET &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  try {
    const { data: latestRow, error: fetchError } = await supabase
      .from('lotto_draws')
      .select('draw_no')
      .order('draw_no', { ascending: false })
      .limit(1)
      .single();

    if (fetchError && fetchError.code !== 'PGRST116') {
      throw fetchError;
    }

    const latestInDb = latestRow ? latestRow.draw_no : 0;

    const mirrorRes = await fetch(
      'https://smok95.github.io/lotto/results/all.json',
      { cache: 'no-store' }
    );

    if (!mirrorRes.ok) {
      return NextResponse.json(
        { ok: false, error: '데이터 소스에 연결할 수 없습니다.' },
        { status: 502 }
      );
    }

    const allDraws: Array<{
      draw_no: number;
      date: string;
      numbers: number[];
      bonus_no: number;
    }> = await mirrorRes.json();

    const newDraws = allDraws
      .filter((d) => d.draw_no > latestInDb)
      .sort((a, b) => a.draw_no - b.draw_no);

    if (newDraws.length === 0) {
      // 새 당첨번호는 없더라도 최신 회차 판매점이 아직 비어 있다면 보충 수집
      let backfilledCount = 0;
      if (latestInDb > 0) {
        const { count } = await supabase
          .from('winning_stores')
          .select('id', { count: 'exact', head: true })
          .eq('draw_no', latestInDb);

        if (!count || count === 0) {
          backfilledCount = await syncWinningStores(supabase, latestInDb);
        }
      }

      return NextResponse.json({
        ok: true,
        message:
          backfilledCount > 0
            ? `최신 ${latestInDb}회 판매점 ${backfilledCount}곳 보충 업데이트 완료`
            : '이미 최신 회차까지 반영되어 있습니다.',
        latestInDb,
      });
    }

    const rowsToUpsert = newDraws.map((draw) => ({
      draw_no: draw.draw_no,
      draw_date: draw.date.slice(0, 10),
      numbers: [...draw.numbers].sort((a, b) => a - b),
      bonus_no: draw.bonus_no,
    }));

    const { error: upsertError } = await supabase
      .from('lotto_draws')
      .upsert(rowsToUpsert, { onConflict: 'draw_no' });

    if (upsertError) throw upsertError;

    const lastDrawNo = rowsToUpsert[rowsToUpsert.length - 1].draw_no;

    // 새로 추가된 회차들의 1·2등 당첨 판매점도 함께 수집
    let totalStoresSynced = 0;
    for (const row of rowsToUpsert) {
      totalStoresSynced += await syncWinningStores(supabase, row.draw_no);
    }

    return NextResponse.json({
      ok: true,
      message: `총 ${rowsToUpsert.length}개 회차(최신 ${lastDrawNo}회) 및 당첨 판매점 ${totalStoresSynced}곳 업데이트 완료`,
      latestInDb: lastDrawNo,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '업데이트 중 오류 발생';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}