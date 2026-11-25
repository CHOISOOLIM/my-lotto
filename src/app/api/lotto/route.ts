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
    // 1순위: 동행복권 공식 API 직접 호출 (가장 정확한 실시간 원본)
    try {
      const dhRes = await fetch(
        `https://www.dhlottery.co.kr/common.do?method=getLottoNumber&drwNo=${drwNo}`,
        {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          },
          cache: 'no-store',
        }
      );
      if (dhRes.ok) {
        const dhData = await dhRes.json();
        if (dhData && dhData.returnValue === 'success') {
          const sortedNums = [
            dhData.drwtNo1,
            dhData.drwtNo2,
            dhData.drwtNo3,
            dhData.drwtNo4,
            dhData.drwtNo5,
            dhData.drwtNo6,
          ].sort((a, b) => a - b);

          // DB에 잘못된 더미 데이터가 있었다면 실제 데이터로 덮어쓰기(교정)
          await supabase.from('lotto_draws').upsert({
            draw_no: dhData.drwNo,
            draw_date: dhData.drwNoDate,
            numbers: sortedNums,
            bonus_no: dhData.bnusNo,
          });

          return NextResponse.json({
            drawNo: dhData.drwNo,
            drawDate: dhData.drwNoDate,
            numbers: sortedNums,
            bonus: dhData.bnusNo,
          });
        }
      }
    } catch {
      // 동행복권 API 차단/지연 시 2순위로 이동
    }

    // 2순위: 검증된 공개 미러 JSON 조회 및 DB 교정
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

    // 3순위: 외부 통신 실패 시 최후의 수단으로 DB 조회
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

    return NextResponse.json({ error: '해당 회차 데이터를 찾을 수 없습니다.' }, { status: 404 });
  } catch (err) {
    const message = err instanceof Error ? err.message : '조회 중 오류 발생';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}