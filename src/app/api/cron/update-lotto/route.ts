import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  // Vercel Cron 보안 검증 (CRON_SECRET 설정 시 동작)
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
    // 1. 현재 DB에 저장된 가장 마지막 회차 번호 조회
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

    // 2. 밀린 회차가 있을 수 있으므로 최신 회차가 나올 때까지 순차 조회
    while (true) {
      const res = await fetch(
        `https://www.dhlottery.co.kr/common.do?method=getLottoNumber&drwNo=${nextDrawNo}`,
        { cache: 'no-store' }
      );
      const json = await res.json();

      // 아직 추첨되지 않은 회차면 중단
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
      updated: insertedDraws,
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err.message || '업데이트 중 오류 발생' },
      { status: 500 }
    );
  }
}