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
      return NextResponse.json({
        ok: true,
        message: '이미 최신 회차까지 반영되어 있습니다.',
        latestInDb,
      });
    }

    // 1,200여 건을 한 번의 쿼리로 일괄(Bulk) 저장 -> 1초 이내 완료
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

    return NextResponse.json({
      ok: true,
      message: `총 ${rowsToUpsert.length}개 회차(1회~${lastDrawNo}회) 일괄 업데이트 완료`,
      latestInDb: lastDrawNo,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '업데이트 중 오류 발생';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}