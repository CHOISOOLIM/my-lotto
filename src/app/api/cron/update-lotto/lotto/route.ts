import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const drwNo = Number(searchParams.get('drwNo'));

  if (!drwNo || drwNo < 1) {
    return NextResponse.json({ error: '유효하지 않은 회차입니다.' }, { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  try {
    // 1순위: Supabase DB(lotto_draws)에서 회차 조회
    const { data: dbRow } = await supabase
      .from('lotto_draws')
      .select('draw_no, draw_date, numbers, bonus_no')
      .eq('draw_no', drwNo)
      .single();

    if (dbRow) {
      return NextResponse.json({
        drawNo: dbRow.draw_no,
        drawDate: dbRow.draw_date,
        numbers: dbRow.numbers,
        bonus: dbRow.bonus_no,
      });
    }

    // 2순위: DB에 없는 회차일 경우 미러 JSON에서 즉시 조회 후 DB에 자동 저장
    const mirrorRes = await fetch('https://smok95.github.io/lotto/results/all.json', {
      cache: 'no-store',
    });

    if (mirrorRes.ok) {
      const allDraws: Array<{
        draw_no: number;
        date: string;
        numbers: number[];
        bonus_no: number;
      }> = await mirrorRes.json();

      const found = allDraws.find((d) => d.draw_no === drwNo);
      if (found) {
        const sortedNums = [...found.numbers].sort((a, b) => a - b);
        const drawDate = found.date.slice(0, 10);

        await supabase.from('lotto_draws').upsert({
          draw_no: found.draw_no,
          draw_date: drawDate,
          numbers: sortedNums,
          bonus_no: found.bonus_no,
        });

        return NextResponse.json({
          drawNo: found.draw_no,
          drawDate,
          numbers: sortedNums,
          bonus: found.bonus_no,
        });
      }
    }

    return NextResponse.json({ error: '해당 회차 데이터를 찾을 수 없습니다.' }, { status: 404 });
  } catch (err) {
    const message = err instanceof Error ? err.message : '조회 중 오류 발생';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}