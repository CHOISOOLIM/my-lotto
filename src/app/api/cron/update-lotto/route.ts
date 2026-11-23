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

    const latestInDb = latestRow ? latestRow.draw_no : 0;
    const insertedDraws: number[] = [];

    // 1순위: 클라우드 IP 차단이 없는 공개 로또 JSON 미러 조회
    const mirrorRes = await fetch(
      'https://smok95.github.io/lotto/results/all.json',
      { cache: 'no-store' }
    );

    if (mirrorRes.ok) {
      const allDraws: Array<{
        draw_no: number;
        date: string;
        numbers: number[];
        bonus_no: number;
      }> = await mirrorRes.json();

      const newDraws = allDraws
        .filter((d) => d.draw_no > latestInDb)
        .sort((a, b) => a.draw_no - b.draw_no);

      for (const draw of newDraws) {
        const sortedNums = [...draw.numbers].sort((a, b) => a - b);
        const drawDate = draw.date.slice(0, 10);

        const { error: insertError } = await supabase.from('lotto_draws').upsert({
          draw_no: draw.draw_no,
          draw_date: drawDate,
          numbers: sortedNums,
          bonus_no: draw.bonus_no,
        });

        if (insertError) throw insertError;
        insertedDraws.push(draw.draw_no);
      }

      return NextResponse.json({
        ok: true,
        source: 'mirror',
        message:
          insertedDraws.length > 0
            ? `${insertedDraws.join(', ')}회차 업데이트 완료`
            : '이미 최신 회차까지 반영되어 있습니다.',
        latestInDb:
          insertedDraws.length > 0
            ? insertedDraws[insertedDraws.length - 1]
            : latestInDb,
        updated: insertedDraws,
      });
    }

    return NextResponse.json(
      { ok: false, error: '데이터 소스에 연결할 수 없습니다.' },
      { status: 502 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : '업데이트 중 오류 발생';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}