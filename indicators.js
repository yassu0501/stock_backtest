// indicators.js — 純粋な計算関数（DOM参照なし）

// ---- 単純移動平均 ----
export function sma(arr, period) {
  return arr.map((_, i) => {
    if (i < period - 1) return null;
    const slice = arr.slice(i - period + 1, i + 1);
    return slice.reduce((a, b) => a + b, 0) / period;
  });
}

// ---- 表示用SMA（ウォームアップ期間も部分平均で埋める） ----
export function smaFull(arr, period) {
  return arr.map((_, i) => {
    const start = Math.max(0, i - period + 1);
    const slice = arr.slice(start, i + 1);
    return slice.reduce((a, b) => a + b, 0) / slice.length;
  });
}

// ---- RSI ----
export function calcRSI(closes, period) {
  const rsi = Array(closes.length).fill(null);
  if (closes.length < period + 1) return rsi;
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains += diff; else losses -= diff;
  }
  let avgGain = gains / period, avgLoss = losses / period;
  rsi[period] = 100 - 100 / (1 + avgGain / (avgLoss || 0.001));
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(diff, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-diff, 0)) / period;
    rsi[i] = 100 - 100 / (1 + avgGain / (avgLoss || 0.001));
  }
  return rsi;
}

// ---- EMA ----
export function calcEMA(arr, n) {
  const k = 2 / (n + 1);
  const out = Array(arr.length).fill(null);
  const start = n - 1;
  if (arr.length < n) return out;
  out[start] = arr.slice(0, n).reduce((a, b) => a + b, 0) / n;
  for (let i = start + 1; i < arr.length; i++) {
    if (out[i - 1] === null) continue;
    out[i] = arr[i] * k + out[i - 1] * (1 - k);
  }
  return out;
}

// ---- RCI（順位相関指数） ----
export function calcRCI(arr, n) {
  if (n < 2) return Array(arr.length).fill(null);
  return arr.map((_, i) => {
    if (i < n - 1) return null;
    const slice = arr.slice(i - n + 1, i + 1);
    const priceRanks = slice.map(v => slice.filter(x => x > v).length + 1);
    let d2sum = 0;
    for (let j = 0; j < n; j++) {
      const dateRank = n - j;
      const d = dateRank - priceRanks[j];
      d2sum += d * d;
    }
    const denom = n * (n * n - 1);
    if (denom === 0) return 0;
    return (1 - (6 * d2sum) / denom) * 100;
  });
}

// ---- DMI（方向性指数） ----
export function calcDMI(data, n) {
  const len = data.length;
  const plusDI = Array(len).fill(null);
  const minusDI = Array(len).fill(null);
  const adx = Array(len).fill(null);

  if (len < n + 1) return { plusDI, minusDI, adx };

  const tr = [], pdm = [], mdm = [];
  for (let i = 1; i < len; i++) {
    const cur = data[i], prev = data[i - 1];
    const hl = cur.high - cur.low;
    const hpc = Math.abs(cur.high - prev.close);
    const lpc = Math.abs(cur.low - prev.close);
    tr.push(Math.max(hl, hpc, lpc));
    const upMove = cur.high - prev.high;
    const downMove = prev.low - cur.low;
    pdm.push(upMove > downMove && upMove > 0 ? upMove : 0);
    mdm.push(downMove > upMove && downMove > 0 ? downMove : 0);
  }

  let trN = tr.slice(0, n).reduce((a, b) => a + b, 0);
  let pdmN = pdm.slice(0, n).reduce((a, b) => a + b, 0);
  let mdmN = mdm.slice(0, n).reduce((a, b) => a + b, 0);

  const diPlus  = [trN === 0 ? 0 : (pdmN / trN) * 100];
  const diMinus = [trN === 0 ? 0 : (mdmN / trN) * 100];

  for (let i = n; i < tr.length; i++) {
    trN = trN - trN / n + tr[i];
    pdmN = pdmN - pdmN / n + pdm[i];
    mdmN = mdmN - mdmN / n + mdm[i];
    diPlus.push(trN === 0 ? 0 : (pdmN / trN) * 100);
    diMinus.push(trN === 0 ? 0 : (mdmN / trN) * 100);
  }

  const dx = diPlus.map((p, i) => {
    const sum = p + diMinus[i];
    if (sum === 0) return 0;
    return (Math.abs(p - diMinus[i]) / sum) * 100;
  });

  let adxVal = dx.slice(0, n).reduce((a, b) => a + b, 0) / n;
  const adxArr = [adxVal];
  for (let i = n; i < dx.length; i++) {
    adxVal = (adxVal * (n - 1) + dx[i]) / n;
    adxArr.push(adxVal);
  }

  const offset = n;
  for (let i = 0; i < diPlus.length; i++) {
    plusDI[i + offset] = diPlus[i];
    minusDI[i + offset] = diMinus[i];
  }
  for (let i = 0; i < adxArr.length; i++) {
    adx[i + offset + n - 1] = adxArr[i];
  }

  return { plusDI, minusDI, adx };
}

// ---- ATR ----
export function calcATR(data, n = 14) {
  const tr = data.map((bar, i) => {
    if (i === 0) return bar.high - bar.low;
    const prev = data[i - 1];
    return Math.max(
      bar.high - bar.low,
      Math.abs(bar.high - prev.close),
      Math.abs(bar.low  - prev.close)
    );
  });
  const atr = Array(data.length).fill(null);
  atr[n - 1] = tr.slice(0, n).reduce((a, b) => a + b, 0) / n;
  for (let i = n; i < data.length; i++) {
    atr[i] = (atr[i - 1] * (n - 1) + tr[i]) / n;
  }
  return atr;
}

// ---- 一目均衡表 ----
export function calcIchimoku(closes, highs, lows, tenkanPeriod, kijunPeriod, senkouBPeriod) {
  const len = closes.length;
  const tenkan = [], kijun = [], senkouA = [], senkouB = [];

  function midPrice(arr_h, arr_l, start, period) {
    if (start < period - 1) return null;
    let max = -Infinity, min = Infinity;
    for (let i = start - period + 1; i <= start; i++) {
      if (arr_h[i] > max) max = arr_h[i];
      if (arr_l[i] < min) min = arr_l[i];
    }
    return (max + min) / 2;
  }

  for (let i = 0; i < len; i++) {
    tenkan.push(midPrice(highs, lows, i, tenkanPeriod));
    kijun.push(midPrice(highs, lows, i, kijunPeriod));
    const saIdx = i - kijunPeriod;
    senkouA.push(saIdx >= 0 && tenkan[saIdx] !== null && kijun[saIdx] !== null
      ? (tenkan[saIdx] + kijun[saIdx]) / 2 : null);
    senkouB.push(saIdx >= 0 ? midPrice(highs, lows, saIdx, senkouBPeriod) : null);
  }
  return { tenkan, kijun, senkouA, senkouB };
}

// ---- 最大ドローダウン ----
export function calcMaxDrawdown(equities) {
  let peak = equities[0];
  let maxDD = 0;
  for (const e of equities) {
    if (e > peak) peak = e;
    const dd = (peak - e) / peak;
    if (dd > maxDD) maxDD = dd;
  }
  return maxDD * 100;
}
