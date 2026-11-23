'use client';

import React, { useState, useRef, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

interface DrawRecord {
  draw_no: number;
  draw_date: string;
  numbers: number[];
  bonus_no: number;
}

interface GameResult {
  label: string;
  userNumbers: number[];
  matchedCount: number;
  bonusMatched: boolean;
  rank: string;
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

function getBallColor(num: number): string {
  if (num <= 10) return 'bg-amber-400 text-slate-950';
  if (num <= 20) return 'bg-sky-400 text-slate-950';
  if (num <= 30) return 'bg-rose-400 text-white';
  if (num <= 40) return 'bg-slate-400 text-slate-950';
  return 'bg-emerald-400 text-slate-950';
}

function evaluateRank(
  userNums: number[],
  winNums: number[],
  bonusNo: number
): { matchedCount: number; bonusMatched: boolean; rank: string } {
  const matchedCount = userNums.filter((n) => winNums.includes(n)).length;
  const bonusMatched = userNums.includes(bonusNo);

  let rank = '낙첨';
  if (matchedCount === 6) rank = '🎉 1등 당첨!';
  else if (matchedCount === 5 && bonusMatched) rank = '🎊 2등 당첨!';
  else if (matchedCount === 5) rank = '✨ 3등 당첨!';
  else if (matchedCount === 4) rank = '🍀 4등 (5만원)';
  else if (matchedCount === 3) rank = '👍 5등 (5천원)';

  return { matchedCount, bonusMatched, rank };
}

export default function LottoChecker() {
  const [activeTab, setActiveTab] = useState<'manual' | 'qr'>('manual');
  const [targetDrawNo, setTargetDrawNo] = useState<string>('');
  const [drawData, setDrawData] = useState<DrawRecord null |>(null);
  const [manualInput, setManualInput] = useState<string>('');
  const [qrTextInput, setQrTextInput] = useState<string>('');
  const [results, setResults] = useState<GameResult[]>([]);
  const [statusMsg, setStatusMsg] = useState<string>('');
  const [isScanning, setIsScanning] = useState<boolean>(false);

  const videoRef = useRef<HTMLVideoElement null |>(null);
  const streamRef = useRef<MediaStream null |>(null);

  // 초기 로드 시 DB의 최신 회차 가져오기
  useEffect(() => {
    async function loadLatestDraw() {
      const { data } = await supabase
        .from('lotto_draws')
        .select('*')
        .order('draw_no', { ascending: false })
        .limit(1)
        .single();

      if (data) {
        setDrawData(data);
        setTargetDrawNo(String(data.draw_no));
      }
    }
    loadLatestDraw();
    return () => stopCamera();
  }, []);

  // 특정 회차 조회
  async function fetchDrawByNo(no: number): Promise<DrawRecord null |> {
    const { data, error } = await supabase
      .from('lotto_draws')
      .select('*')
      .eq('draw_no', no)
      .single();

    if (error || !data) {
      setStatusMsg(`${no}회차 당첨 데이터를 찾을 수 없습니다.`);
      return null;
    }
    setDrawData(data);
    setTargetDrawNo(String(data.draw_no));
    setStatusMsg('');
    return data;
  }

  // 수동 번호 대조 실행
  async function handleManualCheck() {
    const parsedNums = manualInput
      .split(/[^0-9]+/)
      .filter(Boolean)
      .map(Number)
      .filter((n) => n >= 1 && n <= 45);

    const uniqueNums = Array.from(new Set(parsedNums)).slice(0, 6).sort((a, b) => a - b);

    if (uniqueNums.length !== 6) {
      setStatusMsg('1~45 사이의 서로 다른 숫자 6개를 입력해 주세요.');
      return;
    }

    const drawNo = Number(targetDrawNo);
    const currentDraw =
      drawData && drawData.draw_no === drawNo
        ? drawData
        : await fetchDrawByNo(drawNo);

    if (!currentDraw) return;

    const evalRes = evaluateRank(uniqueNums, currentDraw.numbers, currentDraw.bonus_no);
    setResults([
      {
        label: '입력 번호',
        userNumbers: uniqueNums,
        ...evalRes,
      },
    ]);
  }

  // 동행복권 QR URL 파싱 (?v=1251q010512233445q...)
  async function parseAndCheckQrString(raw: string) {
    const match = raw.match(/v=(\d{4})([qmn]\d{12})+/i);
    if (!match) {
      setStatusMsg('올바른 동행복권 QR 코드(또는 URL) 형식이 아닙니다.');
      return;
    }

    const drawNo = Number(match[1]);
    const currentDraw = await fetchDrawByNo(drawNo);
    if (!currentDraw) return;

    const gameMatches = raw.match(/[qmn](\d{12})/gi) || [];
    const labels = ['A', 'B', 'C', 'D', 'E'];

    const checkedGames: GameResult[] = gameMatches.map((block, idx) => {
      const digits = block.slice(1);
      const nums: number[] = [];
      for (let i = 0; i < 12; i += 2) {
        nums.push(Number(digits.slice(i, i + 2)));
      }
      const sorted = nums.sort((a, b) => a - b);
      const evalRes = evaluateRank(sorted, currentDraw.numbers, currentDraw.bonus_no);
      return {
        label: `${labels[idx] || idx + 1}게임`,
        userNumbers: sorted,
        ...evalRes,
      };
    });

    setResults(checkedGames);
    setStatusMsg(`${drawNo}회차 용지 ${checkedGames.length}게임 대조 완료`);
  }

  // 카메라 QR 스캔 시작
  async function startCamera() {
    setStatusMsg('');
    if (!('BarcodeDetector' in window)) {
      setStatusMsg(
        '현재 브라우저는 실시간 카메라 QR 인식을 지원하지 않습니다. 스마트폰 기본 카메라로 QR을 찍어 나온 주소를 아래에 붙여넣어 주세요.'
      );
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      streamRef.current = stream;
      setIsScanning(true);

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      // @ts-expect-error BarcodeDetector browser API
      const detector = new window.BarcodeDetector({ formats: ['qr_code'] });

      const scanLoop = async () => {
        if (!streamRef.current || !videoRef.current) return;
        try {
          const barcodes = await detector.detect(videoRef.current);
          if (barcodes.length > 0 && barcodes[0].rawValue) {
            const scannedText = barcodes[0].rawValue;
            setQrTextInput(scannedText);
            stopCamera();
            await parseAndCheckQrString(scannedText);
            return;
          }
        } catch {
          // 프레임 인식 대기
        }
        requestAnimationFrame(scanLoop);
      };

      requestAnimationFrame(scanLoop);
    } catch {
      setStatusMsg('카메라 권한이 거부되었거나 사용할 수 없는 기기입니다.');
      setIsScanning(false);
    }
  }

  function stopCamera() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setIsScanning(false);
  }

  return (
    <section className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 space-y-5 shadow-xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-bold text-white">
            🔍 당첨 번호 조회 & QR / 내 번호 대조
          </h2>
          <p className="text-xs text-slate-400">
            역대 회차 당첨 번호 확인 및 구매 용지 QR 스캔 대조
          </p>
        </div>

        <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800">
          <button
            type="button"
            onClick={() => {
              stopCamera();
              setActiveTab('manual');
            }}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
              activeTab === 'manual'
                ? 'bg-indigo-600 text-white'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            회차 · 번호 대조
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('qr')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
              activeTab === 'qr'
                ? 'bg-indigo-600 text-white'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            QR 스캔 · 용지 확인
          </button>
        </div>
      </div>

      {/* 기준 회차 당첨 번호 표시 카드 */}
      {drawData && (
        <div className="bg-slate-950/90 border border-slate-800 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-indigo-300">
              제 {drawData.draw_no}회 당첨 번호 ({drawData.draw_date})
            </span>
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                value={targetDrawNo}
                onChange={(e) => setTargetDrawNo(e.target.value)}
                className="w-20 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-right text-white text-xs"
                placeholder="회차"
              />
              <button
                type="button"
                onClick={() => fetchDrawByNo(Number(targetDrawNo))}
                className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium"
              >
                조회
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
            {drawData.numbers.map((num) => (
              <span
                key={num}
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-extrabold shadow ${getBallColor(
                  num
                )}`}
              >
                {num}
              </span>
            ))}
            <span className="text-slate-500 text-xs font-bold mx-1">+</span>
            <span
              className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-extrabold ring-2 ring-indigo-400 ${getBallColor(
                drawData.bonus_no
              )}`}
            >
              {drawData.bonus_no}
            </span>
          </div>
        </div>
      )}

      {/* 탭 1: 수동 번호 입력 대조 */}
      {activeTab === 'manual' && (
        <div className="space-y-3">
          <label className="block text-xs text-slate-300 font-medium">
            대조할 6개 번호 입력 (쉼표 또는 띄어쓰기 구분)
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={manualInput}
              onChange={(e) => setManualInput(e.target.value)}
              placeholder="예: 3, 11, 19, 24, 33, 42"
              className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
            />
            <button
              type="button"
              onClick={handleManualCheck}
              className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl transition shrink-0"
            >
              당첨 확인
            </button>
          </div>
        </div>
      )}

      {/* 탭 2: QR 스캔 및 QR 주소 붙여넣기 대조 */}
      {activeTab === 'qr' && (
        <div className="space-y-3">
          <div className="flex gap-2">
            {!isScanning ? (
              <button
                type="button"
                onClick={startCamera}
                className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl transition"
              >
                📷 카메라로 로또 용지 QR 코드 스캔하기
              </button>
            ) : (
              <button
                type="button"
                onClick={stopCamera}
                className="w-full py-2.5 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-xl transition"
              >
                스캔 중지
              </button>
            )}
          </div>

          {isScanning && (
            <div className="relative overflow-hidden rounded-xl border border-emerald-500/50 bg-black aspect-video">
              <video
                ref={videoRef}
                className="w-full h-full object-cover"
                playsInline
                muted
              />
            </div>
          )}

          <div className="space-y-1.5">
            <label className="block text-[11px] text-slate-400">
              또는 스마트폰 카메라로 QR을 찍어 복사된 주소(URL) 붙여넣기
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={qrTextInput}
                onChange={(e) => setQrTextInput(e.target.value)}
                placeholder="http://m.dhlottery.co.kr/?v=1251q..."
                className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500"
              />
              <button
                type="button"
                onClick={() => parseAndCheckQrString(qrTextInput)}
                className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl shrink-0"
              >
                대조
              </button>
            </div>
          </div>
        </div>
      )}

      {statusMsg && (
        <p className="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2">
          {statusMsg}
        </p>
      )}

      {/* 대조 결과 리스트 */}
      {results.length > 0 && drawData && (
        <div className="space-y-2 pt-2 border-t border-slate-800">
          {results.map((res, idx) => (
            <div
              key={idx}
              className="flex flex-wrap items-center justify-between gap-2 bg-slate-950 border border-slate-800 rounded-xl p-3"
            >
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-400 w-12">
                  {res.label}
                </span>
                <div className="flex gap-1.5">
                  {res.userNumbers.map((num) => {
                    const isWin = drawData.numbers.includes(num);
                    const isBonus = drawData.bonus_no === num;
                    return (
                      <span
                        key={num}
                        className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                          isWin
                            ? getBallColor(num)
                            : isBonus
                            ? 'bg-indigo-500 text-white ring-2 ring-indigo-300'
                            : 'bg-slate-800 text-slate-500'
                        }`}
                      >
                        {num}
                      </span>
                    );
                  })}
                </div>
              </div>

              <span
                className={`text-xs font-extrabold px-2.5 py-1 rounded-full ${
                  res.rank === '낙첨'
                    ? 'bg-slate-800 text-slate-400'
                    : 'bg-amber-500/20 text-amber-300'
                }`}
              >
                {res.rank}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}