'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';

interface DrawResult {
  drawNo: number;
  drawDate: string;
  numbers: number[];
  bonus: number;
}

interface GameCheckResult {
  gameLabel: string;
  userNumbers: number[];
  matchedNumbers: number[];
  bonusMatched: boolean;
  rank: string;
}

export default function LottoChecker({ initialDraw }: { initialDraw?: DrawResult }) {
  const [activeTab, setActiveTab] = useState<'draw' | 'qr'>('draw');
  const [drawNoInput, setDrawNoInput] = useState<string>(
    initialDraw ? String(initialDraw.drawNo) : ''
  );
  const [currentDraw, setCurrentDraw] = useState<DrawResult | null>(initialDraw || null);
  const [loadingDraw, setLoadingDraw] = useState(false);

  // 수동 번호 대조
  const [manualInput, setManualInput] = useState('');
  const [manualResult, setManualResult] = useState<GameCheckResult | null>(null);

  // QR 카메라 & URL 파싱 상태
  const [isScanning, setIsScanning] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [qrUrlInput, setQrUrlInput] = useState('');
  const [qrDrawNo, setQrDrawNo] = useState<number | null>(null);
  const [qrResults, setQrResults] = useState<GameCheckResult[]>([]);
  const scannerRef = useRef<Html5Qrcode | null>(null);

  // 회차별 당첨 번호 조회
  const fetchDrawData = async (targetDrawNo: number): Promise<DrawResult | null> => {
    try {
      setLoadingDraw(true);
      const res = await fetch(`/api/lotto?drwNo=${targetDrawNo}`);
      if (!res.ok) return null;
      const data = await res.json();
      if (data && data.numbers) {
        return {
          drawNo: data.drawNo,
          drawDate: data.drawDate,
          numbers: data.numbers,
          bonus: data.bonus,
        };
      }
      return null;
    } catch {
      return null;
    } finally {
      setLoadingDraw(false);
    }
  };

  const handleSearchDraw = async () => {
    const num = parseInt(drawNoInput, 10);
    if (!num || num < 1) return;
    const fetched = await fetchDrawData(num);
    if (fetched) {
      setCurrentDraw(fetched);
      setManualResult(null);
    } else {
      alert('해당 회차 데이터를 찾을 수 없습니다.');
    }
  };

  // 당첨 등수 판정 함수
  const evaluateGame = (
    label: string,
    userNums: number[],
    winNums: number[],
    bonusNum: number
  ): GameCheckResult => {
    const matched = userNums.filter((n) => winNums.includes(n));
    const hasBonus = userNums.includes(bonusNum);
    let rank = '낙첨';

    if (matched.length === 6) rank = '1등 당첨! 🎉';
    else if (matched.length === 5 && hasBonus) rank = '2등 당첨! 🎊';
    else if (matched.length === 5) rank = '3등 당첨! ✨';
    else if (matched.length === 4) rank = '4등 당첨 (50,000원)';
    else if (matched.length === 3) rank = '5등 당첨 (5,000원)';

    return {
      gameLabel: label,
      userNumbers: [...userNums].sort((a, b) => a - b),
      matchedNumbers: matched,
      bonusMatched: hasBonus,
      rank,
    };
  };

  // 수동 6개 번호 대조
  const handleManualCheck = () => {
    if (!currentDraw) return;
    const parsed = manualInput
      .split(/[\s,]+/)
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => !isNaN(n) && n >= 1 && n <= 45);
    const unique = Array.from(new Set(parsed));
    if (unique.length !== 6) {
      alert('1~45 사이의 중복되지 않는 숫자 6개를 입력해 주세요.');
      return;
    }
    setManualResult(evaluateGame('내 번호', unique, currentDraw.numbers, currentDraw.bonus));
  };

  // 동행복권 QR URL 파싱 (예: http://m.dhlottery.co.kr/?v=1251q010203040506q...)
  const parseAndCheckQrUrl = async (rawUrl: string) => {
    const match = rawUrl.match(/v=(\d+)([qm]\d{12})+/i);
    if (!match) {
      setCameraError('동행복권 로또 용지 QR 코드가 아닙니다. 다시 스캔해 주세요.');
      return;
    }

    const vParam = rawUrl.split('v=')[1]?.split('&')[0] || '';
    const drwNo = parseInt(vParam.slice(0, 4), 10);
    const gamesPart = vParam.slice(4);
    const gameMatches = gamesPart.match(/[qm]\d{12}/gi);

    if (!drwNo || !gameMatches || gameMatches.length === 0) {
      setCameraError('QR 코드에서 게임 번호를 읽지 못했습니다.');
      return;
    }

    const targetDraw =
      currentDraw && currentDraw.drawNo === drwNo ? currentDraw : await fetchDrawData(drwNo);

    if (!targetDraw) {
      setCameraError(`제 ${drwNo}회 당첨 번호가 아직 추첨 전이거나 조회할 수 없습니다.`);
      return;
    }

    setCurrentDraw(targetDraw);
    setQrDrawNo(drwNo);
    setCameraError(null);

    const labels = ['A', 'B', 'C', 'D', 'E'];
    const evaluated: GameCheckResult[] = gameMatches.map((chunk, idx) => {
      const digits = chunk.slice(1);
      const nums: number[] = [];
      for (let i = 0; i < 12; i += 2) {
        nums.push(parseInt(digits.slice(i, i + 2), 10));
      }
      return evaluateGame(
        `${labels[idx] || idx + 1}게임`,
        nums,
        targetDraw.numbers,
        targetDraw.bonus
      );
    });

    setQrResults(evaluated);
  };

  // 범용 카메라 스캔 시작
  const startCameraScan = async () => {
    setCameraError(null);
    setQrResults([]);
    setIsScanning(true);

    setTimeout(async () => {
      try {
        const html5QrCode = new Html5Qrcode('lotto-qr-reader');
        scannerRef.current = html5QrCode;

        await html5QrCode.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 230, height: 230 } },
          async (decodedText) => {
            setQrUrlInput(decodedText);
            await stopCameraScan();
            await parseAndCheckQrUrl(decodedText);
          },
          () => {
            // 프레임 인식 대기 중 무시
          }
        );
      } catch {
        setIsScanning(false);
        setCameraError(
          '카메라를 실행할 수 없습니다. 브라우저 주소창 왼쪽 자물쇠 아이콘에서 카메라 권한을 허용했는지 확인해 주세요.'
        );
      }
    }, 100);
  };

  // 카메라 중지 및 리소스 해제
  const stopCameraScan = async () => {
    if (scannerRef.current) {
      try {
        if (scannerRef.current.isScanning) {
          await scannerRef.current.stop();
        }
        scannerRef.current.clear();
      } catch {
        // 이미 중지된 경우 무시
      }
      scannerRef.current = null;
    }
    setIsScanning(false);
  };

  // 탭 전환 또는 언마운트 시 카메라 자동 종료
  useEffect(() => {
    if (activeTab !== 'qr') {
      stopCameraScan();
    }
    return () => {
      stopCameraScan();
    };
  }, [activeTab]);

  const getBallColor = (num: number) => {
    if (num <= 10) return 'bg-amber-400 text-slate-950';
    if (num <= 20) return 'bg-sky-400 text-slate-950';
    if (num <= 30) return 'bg-rose-400 text-slate-950';
    if (num <= 40) return 'bg-slate-300 text-slate-950';
    return 'bg-emerald-400 text-slate-950';
  };

  return (
    <section className="mt-10 rounded-2xl border border-slate-800 bg-[#0d1424] p-6 shadow-xl">
      <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-lg font-bold text-white">당첨 번호 조회 &amp; QR / 내 번호 대조</h2>
          <p className="text-xs text-slate-400">역대 회차 당첨 번호 확인 및 구매 용지 QR 스캔 채점</p>
        </div>
        <div className="flex rounded-xl bg-slate-900 p-1">
          <button
            type="button"
            onClick={() => setActiveTab('draw')}
            className={`rounded-lg px-3.5 py-2 text-xs font-semibold transition ${
              activeTab === 'draw'
                ? 'bg-indigo-600 text-white shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            회차 · 번호 대조
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('qr')}
            className={`rounded-lg px-3.5 py-2 text-xs font-semibold transition ${
              activeTab === 'qr'
                ? 'bg-indigo-600 text-white shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            QR 스캔 · 용지 확인
          </button>
        </div>
      </div>

      {activeTab === 'draw' ? (
        <div className="space-y-5">
          <div className="flex items-center gap-2">
            <input
              type="number"
              value={drawNoInput}
              onChange={(e) => setDrawNoInput(e.target.value)}
              placeholder="회차 입력 (예: 1251)"
              className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm text-white focus:border-indigo-500 focus:outline-none"
            />
            <button
              type="button"
              onClick={handleSearchDraw}
              disabled={loadingDraw}
              className="shrink-0 rounded-xl bg-slate-800 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
            >
              {loadingDraw ? '조회 중...' : '조회'}
            </button>
          </div>

          {currentDraw && (
            <div className="rounded-xl border border-slate-800/80 bg-slate-900/70 p-4 text-center">
              <div className="mb-3 text-xs font-medium text-slate-400">
                제 <span className="font-bold text-indigo-400">{currentDraw.drawNo}</span>회 당첨 번호 ({currentDraw.drawDate})
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2">
                {currentDraw.numbers.map((n) => (
                  <span
                    key={n}
                    className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-extrabold shadow ${getBallColor(n)}`}
                  >
                    {n}
                  </span>
                ))}
                <span className="mx-1 text-slate-500">+</span>
                <span
                  className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-extrabold ring-2 ring-amber-300/60 ${getBallColor(
                    currentDraw.bonus
                  )}`}
                >
                  {currentDraw.bonus}
                </span>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <label className="block text-xs text-slate-400">
              대조할 내 번호 6개 입력 (쉼표 또는 띄어쓰기 구분)
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={manualInput}
                onChange={(e) => setManualInput(e.target.value)}
                placeholder="예: 4, 8, 11, 18, 24, 31"
                className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm text-white focus:border-indigo-500 focus:outline-none"
              />
              <button
                type="button"
                onClick={handleManualCheck}
                className="shrink-0 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500"
              >
                당첨 확인
              </button>
            </div>
          </div>

          {manualResult && (
            <div className="rounded-xl border border-indigo-500/30 bg-indigo-950/30 p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-white">{manualResult.rank}</span>
                <span className="text-xs text-slate-400">
                  일치 {manualResult.matchedNumbers.length}개
                  {manualResult.bonusMatched ? ' + 보너스' : ''}
                </span>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {!isScanning ? (
            <button
              type="button"
              onClick={startCameraScan}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 py-3.5 text-sm font-bold text-white shadow-lg hover:bg-indigo-500"
            >
              📷 카메라 켜고 로또 QR 코드 스캔하기
            </button>
          ) : (
            <div className="space-y-3">
              <div
                id="lotto-qr-reader"
                className="mx-auto overflow-hidden rounded-xl border border-indigo-500/40 bg-black"
              />
              <button
                type="button"
                onClick={stopCameraScan}
                className="w-full rounded-xl bg-slate-800 py-2.5 text-xs font-semibold text-slate-300 hover:bg-slate-700"
              >
                카메라 닫기
              </button>
            </div>
          )}

          {cameraError && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-950/30 p-3.5 text-xs leading-relaxed text-amber-200">
              {cameraError}
            </div>
          )}

          <div className="pt-2">
            <label className="mb-1.5 block text-xs text-slate-400">
              또는 QR 인식 주소 직접 붙여넣기
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={qrUrlInput}
                onChange={(e) => setQrUrlInput(e.target.value)}
                placeholder="http://m.dhlottery.co.kr/?v=..."
                className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3.5 py-2 text-xs text-white focus:border-indigo-500 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => parseAndCheckQrUrl(qrUrlInput)}
                className="shrink-0 rounded-xl bg-slate-800 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-700"
              >
                확인
              </button>
            </div>
          </div>

          {qrResults.length > 0 && (
            <div className="space-y-2.5 rounded-xl border border-slate-800 bg-slate-900/80 p-4">
              <div className="text-xs font-bold text-indigo-400">
                제 {qrDrawNo}회 QR 용지 {qrResults.length}게임 대조 결과
              </div>
              {qrResults.map((res, idx) => (
                <div
                  key={idx}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-950/70 px-3 py-2 text-xs"
                >
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-slate-400">{res.gameLabel}</span>
                    {res.userNumbers.map((n) => {
                      const isHit = res.matchedNumbers.includes(n);
                      return (
                        <span
                          key={n}
                          className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold ${
                            isHit
                              ? 'bg-amber-400 text-slate-950'
                              : 'bg-slate-800 text-slate-400'
                          }`}
                        >
                          {n}
                        </span>
                      );
                    })}
                  </div>
                  <span
                    className={`font-bold ${
                      res.rank === '낙첨' ? 'text-slate-500' : 'text-emerald-400'
                    }`}
                  >
                    {res.rank}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}