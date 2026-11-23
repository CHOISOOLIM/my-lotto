import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

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
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
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

    let nextDrawNo = latestRow ? latestRow.draw_no + 1 : 1;
    const insertedDraws: number[] = [];

    while (true) {
      const res = await fetch(
        `https://www.dhlottery.co.kr/common.do?method=getLottoNumber&drwNo=${nextDrawNo}`,
        {
          cache: 'no-store',
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
            Accept: 'application/json, text/javascript, */*; q=0.01',
            'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
            Referer: 'https://www.dhlottery.co.kr/gameResult.do?method=byWin',
            'X-Requested-With': 'XMLHttpRequest',
          },
        }
      );

      const rawText = await res.text();

      // 동행복권이 HTML(점검 페이지 또는 해외 IP 차단 페이지)을 반환한 경우
      if (rawText.trim().startsWith('<')) {
        return NextResponse.json({
          ok: false,
          blocked: true,
          message:
            '동행복권 서버가 해외 클라우드 IP 접근을 일시 차단했습니다. Vercel 리전을 서울(icn1)로 설정하면 해결됩니다.',
          latestInDb: latestRow?.draw_no ?? 0,
        });
      }

      const json = JSON.parse(rawText);

      if (json.returnValue !== 'success') {
        break;
      }

      const numbers = [
        json.drwtNo1,
        json.drwtNo2,
        json.drwtNo3,
        json.drwtNo4,
        json.drwtNo5,
        json.drwtNo6,
      ].sort((a, b) => a - b);

      const { error: insertError } = await supabase.from('lotto_draws').upsert({
        draw_no: json.drwNo,
        draw_date: json.drwNoDate,
        numbers,
        bonus_no: json.bnusNo,
      });

      if (insertError) throw insertError;

      insertedDraws.push(json.drwNo);
      nextDrawNo++;
    }

    return NextResponse.json({
      ok: true,
      message:
        insertedDraws.length > 0
          ? `${insertedDraws.join(', ')}회차 업데이트 완료`
          : '이미 최신 회차까지 반영되어 있습니다.',
      latestInDb: nextDrawNo - 1,
      updated: insertedDraws,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '업데이트 중 오류 발생';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}