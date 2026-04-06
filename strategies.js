// strategies.js — シグナル関数 + 戦略メタデータ
import { sma, smaFull, calcRSI, calcEMA, calcRCI, calcDMI, calcATR, calcIchimoku } from './indicators.js';

const $ = (id) => document.getElementById(id);

// 安全に要素の値を取得するヘルパー
function getVal(id, def = 0) {
  const el = $(id);
  if (!el) {
    console.warn(`[strategies.js] 要素が見つかりません: ${id}`);
    return def;
  }
  return el.value;
}

// ---- 戦略ごとの期間適性データ ----
export const STRATEGY_META = {
  ma_cross: {
    name: '移動平均クロス',
    type: 'トレンドフォロー',
    periods: [
      { label: '数日〜1週間', level: 'ok',  mark: '△' },
      { label: '1〜2週間',   level: 'ok',  mark: '△' },
      { label: '2週間〜1ヶ月', level: 'best', mark: '◎' },
      { label: '1〜3ヶ月',   level: 'good', mark: '○' },
    ],
    note: 'シグナルが遅れるため短期は偽シグナルが多い',
  },
  rsi: {
    name: 'RSI逆張り',
    type: '逆張り',
    periods: [
      { label: '数日〜1週間', level: 'good', mark: '○' },
      { label: '1〜2週間',   level: 'best', mark: '◎' },
      { label: '2週間〜1ヶ月', level: 'good', mark: '○' },
      { label: '1〜3ヶ月',   level: 'ok',  mark: '△' },
    ],
    note: '週次スイングと最も相性が良い',
  },
  bb: {
    name: 'ボリンジャーバンド',
    type: '逆張り',
    periods: [
      { label: '数日〜1週間', level: 'ok',  mark: '△' },
      { label: '1〜2週間',   level: 'good', mark: '○' },
      { label: '2週間〜1ヶ月', level: 'best', mark: '◎' },
      { label: '1〜3ヶ月',   level: 'good', mark: '○' },
    ],
    note: 'レンジ相場限定で有効。トレンド時は逆効果になりやすい',
  },
  macd: {
    name: 'MACD',
    type: 'トレンドフォロー',
    periods: [
      { label: '数日〜1週間', level: 'ok',  mark: '△' },
      { label: '1〜2週間',   level: 'good', mark: '○' },
      { label: '2週間〜1ヶ月', level: 'best', mark: '◎' },
      { label: '1〜3ヶ月',   level: 'good', mark: '○' },
    ],
    note: 'MAクロスより偽シグナルが少なく月次スイング向き',
  },
  donchian: {
    name: 'ドンチャンチャネル',
    type: 'ブレイクアウト',
    periods: [
      { label: '数日〜1週間', level: 'ok',  mark: '△' },
      { label: '1〜2週間',   level: 'ok',  mark: '△' },
      { label: '2週間〜1ヶ月', level: 'best', mark: '◎' },
      { label: '1〜3ヶ月',   level: 'best', mark: '◎' },
    ],
    note: '数週間の高値更新でエントリー。トレンドの波を大きく捉える。',
  },
  stoch: {
    name: 'ストキャスティクス',
    type: '逆張り',
    periods: [
      { label: '数日〜1週間', level: 'best', mark: '◎' },
      { label: '1〜2週間',   level: 'best', mark: '◎' },
      { label: '2週間〜1ヶ月', level: 'good', mark: '○' },
      { label: '1〜3ヶ月',   level: 'ok',  mark: '△' },
    ],
    note: '高値・安値ベースのため短期レンジ相場に最も強い',
  },
  psar: {
    name: 'パラボリックSAR',
    type: 'トレンドフォロー',
    periods: [
      { label: '数日〜1週間', level: 'ok',  mark: '△' },
      { label: '1〜2週間',   level: 'best', mark: '◎' },
      { label: '2週間〜1ヶ月', level: 'best', mark: '◎' },
      { label: '1〜3ヶ月',   level: 'good', mark: '○' },
    ],
    note: '視覚的にわかりやすく、トレンド反転の検出が得意',
  },
  rci: {
    name: 'RCI',
    type: '逆張り',
    periods: [
      { label: '数日〜1週間', level: 'ok',  mark: '△' },
      { label: '1〜2週間',   level: 'best', mark: '◎' },
      { label: '2週間〜1ヶ月', level: 'best', mark: '◎' },
      { label: '1〜3ヶ月',   level: 'good', mark: '○' },
    ],
    note: '日本株で特に人気の高いオシレーター系指標',
  },
  ma_dev: {
    name: '移動平均乖離率',
    type: '逆張り',
    periods: [
      { label: '数日〜1週間', level: 'good', mark: '○' },
      { label: '1〜2週間',   level: 'best', mark: '◎' },
      { label: '2週間〜1ヶ月', level: 'good', mark: '○' },
      { label: '1〜3ヶ月',   level: 'ok',  mark: '△' },
    ],
    note: '自律反発を狙う典型的な逆張り戦略',
  },
  dmi: {
    name: 'DMI',
    type: 'トレンドフォロー',
    periods: [
      { label: '数日〜1週間', level: 'ok',  mark: '△' },
      { label: '1〜2週間',   level: 'good', mark: '○' },
      { label: '2週間〜1ヶ月', level: 'best', mark: '◎' },
      { label: '1〜3ヶ月',   level: 'best', mark: '◎' },
    ],
    note: 'トレンドの有無と強さを判定するのに好適',
  },
  psycho: {
    name: 'サイコロジカルライン',
    type: '逆張り',
    periods: [
      { label: '数日〜1週間', level: 'good', mark: '○' },
      { label: '1〜2週間',   level: 'best', mark: '◎' },
      { label: '2週間〜1ヶ月', level: 'ok',  mark: '△' },
    ],
    note: '投資家の心理状態（上昇日の多さ）を数値化',
  },
  std_break: {
    name: '標準偏差ブレイクアウト',
    type: 'ブレイクアウト',
    periods: [
      { label: '数日〜1週間', level: 'ok',  mark: '△' },
      { label: '1〜2週間',   level: 'good', mark: '○' },
      { label: '2週間〜1ヶ月', level: 'best', mark: '◎' },
      { label: '1〜3ヶ月',   level: 'good', mark: '○' },
    ],
    note: 'ボラティリティの収縮から拡大を捉える',
  },
  hammer: {
    name: 'ハンマー / 逆ハンマー',
    type: 'トレンド転換',
    periods: [
      { label: '数日〜1週間', level: 'best', mark: '◎' },
      { label: '1〜2週間',   level: 'good',  mark: '○' },
    ],
    note: '底値圏での反転狙い。損切設定が必須',
  },
  engulf: {
    name: '包み足',
    type: 'トレンド転換',
    periods: [
      { label: '数日〜1週間', level: 'good', mark: '○' },
      { label: '1〜2週間',   level: 'best', mark: '◎' },
    ],
    note: '前日のローソク足を包み込む強い反転シグナル',
  },
  three: {
    name: '赤三兵 / 黒三兵',
    type: 'トレンド継続・転換',
    periods: [
      { label: '1〜2週間',   level: 'good', mark: '○' },
      { label: '2週間〜1ヶ月', level: 'best', mark: '◎' },
    ],
    note: '3日連続の陽線/陰線。出現率は低いが信頼度が高い',
  },
  prev_high: {
    name: '前日高値ブレイクアウト',
    type: 'ブレイクアウト',
    periods: [
      { label: '目先〜1週間', level: 'best', mark: '◎' },
      { label: '1〜2週間',   level: 'good', mark: '○' },
      { label: '2週間〜1ヶ月', level: 'ok',   mark: '△' },
    ],
    note: '前日の高値を超える「勢い」を捉える短期決戦型。',
  },
  volumeBreakdown: {
    name: '高値更新+出来高爆発',
    type: '機関トラッキング',
    periods: [
      { label: '5〜10日', level: 'good', mark: '○' },
      { label: '10〜20日', level: 'best', mark: '◎' },
    ],
    note: '機関の仕込みが完了し、売り手が枯渇したタイミングを狙う。',
  },
  vwap: {
    name: 'VWAP トレンド追認',
    type: '機関トラッキング',
    periods: [
      { label: '1〜2週間', level: 'good', mark: '○' },
      { label: '2週間〜1ヶ月', level: 'best', mark: '◎' },
    ],
    note: '機関の平均価格（VWAP）をベースにした王道のトレンドフォロー。',
  },
  volumeDecay: {
    name: '出来高減衰トレンド追認',
    type: '機関トラッキング',
    periods: [
      { label: '3〜7日', level: 'good', mark: '○' },
      { label: '7〜15日', level: 'best', mark: '◎' },
    ],
    note: '上昇トレンド中の「出来高のない押し目」をピンポイントで狙う。',
  },
  ichimoku: {
    name: '一目均衡表',
    type: 'トレンド',
    periods: [
      { label: '1〜2週間',   level: 'good', mark: '○' },
      { label: '2週間〜1ヶ月', level: 'best', mark: '◎' },
      { label: '1〜3ヶ月',   level: 'best', mark: '◎' },
    ],
    note: '日本独自の総合指標。雲と基準線で大局的な流れを掴む。',
  },
  gap_fill: {
    name: 'ギャップ埋め（窓埋め）',
    type: '逆張り',
    periods: [
      { label: '目先〜1週間', level: 'best', mark: '◎' },
      { label: '1〜2週間',   level: 'good', mark: '○' },
    ],
    note: '窓開け後の「窓埋め」を狙う。ボラティリティが高い場面で有効。',
  },
  rsi50: {
    name: 'RSI50（トレンドフォロー）',
    type: 'トレンドフォロー',
    periods: [
      { label: '数日〜1週間', level: 'ok',   mark: '△' },
      { label: '1〜2週間',   level: 'good',  mark: '○' },
      { label: '2週間〜1ヶ月', level: 'best', mark: '◎' },
      { label: '1〜3ヶ月',   level: 'good',  mark: '○' },
    ],
    note: 'RSIが50を上抜けで買い、下抜けで売り。トレンド転換を順張りで捉える。',
  },
};

// ---- 全戦略リスト（ランキング実行用） ----
export const ALL_STRATEGIES = [
  { id: 'ma_cross',  name: '移動平均クロス' },
  { id: 'macd',      name: 'MACD' },
  { id: 'psar',      name: 'パラボリックSAR' },
  { id: 'dmi',       name: 'DMI' },
  { id: 'donchian',  name: 'ドンチャンチャネル' },
  { id: 'prev_high', name: '前日高値ブレイクアウト' },
  { id: 'rsi',       name: 'RSI' },
  { id: 'stoch',     name: 'ストキャスティクス' },
  { id: 'rci',       name: 'RCI' },
  { id: 'psycho',    name: 'サイコロジカルライン' },
  { id: 'bb',        name: 'ボリンジャーバンド' },
  { id: 'ma_dev',    name: '移動平均乖離率' },
  { id: 'std_break', name: '標準偏差ブレイクアウト' },
  { id: 'hammer',    name: 'ハンマー / 逆ハンマー' },
  { id: 'engulf',    name: '包み足' },
  { id: 'three',     name: '赤三兵 / 黒三兵' },
  { id: 'volumeBreakdown', name: '高値更新+出来高爆発' },
  { id: 'vwap',            name: 'VWAP トレンド追認' },
  { id: 'volumeDecay',     name: '出来高減衰トレンド追認' },
  { id: 'ichimoku',        name: '一目均衡表' },
  { id: 'gap_fill',        name: 'ギャップ埋め（窓埋め）' },
  { id: 'rsi50',           name: 'RSI50（トレンドフォロー）' },
];

// ---- 戦略: 移動平均クロス ----
export function signalMA(data) {
  const short = parseInt($('short-ma').value);
  const long = parseInt($('long-ma').value);
  if (short >= long) throw new Error("短期MAは長期MAより小さい値にしてください");

  const closes = data.map((d) => d.close);
  const shortMA = sma(closes, short);
  const longMA = sma(closes, long);
  const sigs = data.map((_, i) => {
    if (i === 0 || shortMA[i] === null || longMA[i] === null || shortMA[i - 1] === null || longMA[i - 1] === null) return null;
    if (shortMA[i - 1] <= longMA[i - 1] && shortMA[i] > longMA[i]) return "buy";
    if (shortMA[i - 1] >= longMA[i - 1] && shortMA[i] < longMA[i]) return "sell";
    return null;
  });
  return {
    sigs,
    lines: [
      { label: `MA${short}`, data: smaFull(closes, short), color: "#3b82f6" },
      { label: `MA${long}`,  data: smaFull(closes, long),  color: "#f59e0b" },
    ],
  };
}

// ---- 戦略: RSI ----
export function signalRSI(data) {
  const period = parseInt($('rsi-period').value);
  const buyTh = parseInt($('rsi-buy').value);
  const sellTh = parseInt($('rsi-sell').value);

  const closes = data.map((d) => d.close);
  const rsiArr = calcRSI(closes, period);
  let inPosition = false;
  const sigs = rsiArr.map((r, i) => {
    if (r === null || i === 0) return null;
    if (!inPosition && rsiArr[i - 1] < buyTh && r >= buyTh) { inPosition = true; return "buy"; }
    if (inPosition && rsiArr[i - 1] > sellTh && r <= sellTh) { inPosition = false; return "sell"; }
    return null;
  });
  return { sigs, lines: [{ label: "RSI", data: rsiArr, color: "#facc15" }] };
}

// ---- 戦略: RSI50（トレンドフォロー） ----
export function signalRSI50(data) {
  const period = parseInt(getVal('rsi50-period', '14'));

  const closes = data.map((d) => d.close);
  const rsiArr = calcRSI(closes, period);
  let inPosition = false;
  const sigs = rsiArr.map((r, i) => {
    if (r === null || i === 0 || rsiArr[i - 1] === null) return null;
    if (!inPosition && rsiArr[i - 1] < 50 && r >= 50) { inPosition = true;  return 'buy'; }
    if (inPosition  && rsiArr[i - 1] > 50 && r <= 50) { inPosition = false; return 'sell'; }
    return null;
  });
  return { sigs, lines: [{ label: 'RSI', data: rsiArr, color: '#facc15' }] };
}

// ---- 戦略: ボリンジャーバンド ----
export function signalBB(data) {
  const period = parseInt($('bb-period').value);
  const sigma = parseFloat($('bb-sigma').value);

  const closes = data.map((d) => d.close);
  const upper = [], lower = [], mid = [];
  closes.forEach((_, i) => {
    if (i < period - 1) { upper.push(null); lower.push(null); mid.push(null); return; }
    const slice = closes.slice(i - period + 1, i + 1);
    const mean = slice.reduce((a, b) => a + b, 0) / period;
    const std = Math.sqrt(slice.reduce((a, b) => a + (b - mean) ** 2, 0) / period);
    mid.push(mean);
    upper.push(mean + sigma * std);
    lower.push(mean - sigma * std);
  });
  let inPosition = false;
  const sigs = closes.map((c, i) => {
    if (lower[i] === null) return null;
    if (!inPosition && c <= lower[i]) { inPosition = true; return "buy"; }
    if (inPosition && c >= upper[i]) { inPosition = false; return "sell"; }
    return null;
  });
  return {
    sigs,
    lines: [
      { label: "BB Upper", data: upper, color: "rgba(239,68,68,0.5)" },
      { label: "BB Mid", data: mid, color: "rgba(100,116,139,0.5)" },
      { label: "BB Lower", data: lower, color: "rgba(59,130,246,0.5)" },
    ],
  };
}

// ---- 戦略: MACD ----
export function signalMACD(data) {
  const closes = data.map((d) => d.close);
  const fast = +$("m-fast").value;
  const slow = +$("m-slow").value;
  const sigN = +$("m-sig").value;
  if (fast >= slow) throw new Error("短期EMA < 長期EMA にしてください");

  const emaFast = calcEMA(closes, fast);
  const emaSlow = calcEMA(closes, slow);
  const macdLine = closes.map((_, i) =>
    emaFast[i] != null && emaSlow[i] != null ? emaFast[i] - emaSlow[i] : null
  );

  const validStart = macdLine.findIndex((v) => v != null);
  const macdSegment = macdLine.slice(validStart);
  if (macdSegment.length < sigN) return { sigs: Array(closes.length).fill(null), lines: [] };

  const sigValid = calcEMA(macdSegment, sigN);
  const sigLine = Array(validStart).fill(null).concat(sigValid);

  const sigs = macdLine.map((v, i) => {
    if (!i || v == null || sigLine[i] == null || macdLine[i - 1] == null || sigLine[i - 1] == null) return null;
    if (macdLine[i - 1] <= sigLine[i - 1] && v > sigLine[i]) return "buy";
    if (macdLine[i - 1] >= sigLine[i - 1] && v < sigLine[i]) return "sell";
    return null;
  });

  return {
    sigs,
    lines: [
      { label: "MACD", data: macdLine, color: "#00b8ff" },
      { label: "Signal", data: sigLine, color: "#ffca28" },
    ],
  };
}

// ---- 戦略: ドンチャンチャネル ----
export function signalDonchian(data) {
  const n = +$('dc-n').value;
  const highs  = data.map(d => d.high);
  const lows   = data.map(d => d.low);
  const upper  = data.map((_, i) => i < n ? null : Math.max(...highs.slice(i - n, i)));
  const lower  = data.map((_, i) => i < n ? null : Math.min(...lows.slice(i - n, i)));
  let inPos = false;
  const sigs = data.map((bar, i) => {
    if (upper[i] == null) return null;
    if (!inPos && bar.close >= upper[i]) { inPos = true;  return 'buy'; }
    if (inPos  && bar.close <= lower[i]) { inPos = false; return 'sell'; }
    return null;
  });
  return {
    sigs,
    lines: [
      { label: `DC Upper(${n}d)`, data: upper, color: '#00e676' },
      { label: `DC Lower(${n}d)`, data: lower, color: '#ff3d57' },
    ],
  };
}

// ---- 戦略: ストキャスティクス ----
export function signalStoch(data) {
  const n   = +$('st-n').value;
  const buy = +$('st-buy').value;
  const sel = +$('st-sel').value;
  const highs = data.map(d => d.high);
  const lows  = data.map(d => d.low);
  const kArr  = data.map((bar, i) => {
    if (i < n - 1) return null;
    const hi = Math.max(...highs.slice(i - n + 1, i + 1));
    const lo = Math.min(...lows.slice(i - n + 1,  i + 1));
    return hi === lo ? 50 : (bar.close - lo) / (hi - lo) * 100;
  });
  let inPos = false;
  const sigs = kArr.map((k, i) => {
    if (k == null || !i || kArr[i-1] == null) return null;
    if (!inPos && kArr[i-1] < buy && k >= buy) { inPos = true;  return 'buy'; }
    if (inPos  && kArr[i-1] > sel && k <= sel) { inPos = false; return "sell"; }
    return null;
  });
  return { sigs, lines: [{ label: "%K", data: kArr, color: "#facc15" }] };
}

// ---- 戦略: パラボリックSAR ----
export function signalPSAR(data) {
  const afStep = +$('ps-af').value;
  const afMax  = +$('ps-max').value;
  if (!data.length) return { sigs: [], lines: [] };

  let bull = true;
  let af   = afStep;
  let ep   = data[0].low;
  let sar  = data[0].high;
  const sarArr = Array(data.length).fill(null);
  const sigs   = Array(data.length).fill(null);
  let inPos = false;

  for (let i = 1; i < data.length; i++) {
    const bar  = data[i];
    const prev = data[i - 1];

    sar = sar + af * (ep - sar);

    if (bull) {
      sar = Math.min(sar, prev.low, i >= 2 ? data[i-2].low : prev.low);
      if (bar.low < sar) {
        bull = false; sar = ep; ep = bar.low; af = afStep;
      } else {
        if (bar.high > ep) { ep = bar.high; af = Math.min(af + afStep, afMax); }
      }
    } else {
      sar = Math.max(sar, prev.high, i >= 2 ? data[i-2].high : prev.high);
      if (bar.high > sar) {
        bull = true; sar = ep; ep = bar.high; af = afStep;
      } else {
        if (bar.low < ep) { ep = bar.low; af = Math.min(af + afStep, afMax); }
      }
    }

    sarArr[i] = Math.round(sar * 10) / 10;

    if (!inPos && bull)  { inPos = true;  sigs[i] = 'buy'; }
    if (inPos  && !bull) { inPos = false; sigs[i] = 'sell'; }
  }

  return {
    sigs,
    lines: [{ label: 'SAR', data: sarArr, color: '#ffca28' }],
  };
}

// ---- 戦略: 前日高値ブレイクアウト ----
export function signalPrevHigh(data) {
  const confirm = $('ph-confirm').value;
  const tpPct   = +$('ph-tp').value / 100;

  const sigs = Array(data.length).fill(null);
  let inPos  = false;
  let entryPrice = 0;

  for (let i = 1; i < data.length; i++) {
    const prev = data[i - 1];
    const bar  = data[i];

    if (!inPos) {
      const breakPrice = prev.high;
      const triggered  = confirm === 'close'
        ? bar.close > breakPrice
        : bar.high  > breakPrice;

      if (triggered) {
        inPos      = true;
        entryPrice = bar.close;
        sigs[i]    = 'buy';
      }
    } else {
      const tp = entryPrice * (1 + tpPct);
      const sl = prev.low;

      if (bar.high >= tp || bar.close <= sl) {
        inPos   = false;
        sigs[i] = 'sell';
      }
    }
  }

  const prevHighLine = data.map((_, i) => i === 0 ? null : data[i - 1].high);
  const prevLowLine  = data.map((_, i) => i === 0 ? null : data[i - 1].low);

  return {
    sigs,
    lines: [
      { label: '前日高値', data: prevHighLine, color: 'rgba(0,230,118,0.5)' },
      { label: '前日安値', data: prevLowLine,  color: 'rgba(255,61,87,0.5)' },
    ],
  };
}

// ---- 戦略: RCI ----
export function signalRCI(data) {
  const nEl = $('rci-n');
  const bEl = $('rci-buy');
  const sEl = $('rci-sel');
  if (!nEl || !bEl || !sEl) throw new Error("RCI設定要素が見つかりません。HTMLを確認してください。");

  const n = parseInt(nEl.value);
  const buyTh = parseInt(bEl.value);
  const selTh = parseInt(sEl.value);
  if (isNaN(n) || isNaN(buyTh) || isNaN(selTh)) throw new Error("RCIパラメータが不正です");

  const closes = data.map(d => d.close);
  const rci = calcRCI(closes, n);
  let inPos = false;

  const sigs = rci.map((r, i) => {
    if (r == null || i === 0 || rci[i - 1] == null) return null;
    if (!inPos && rci[i - 1] <= buyTh && r > buyTh) { inPos = true; return 'buy'; }
    if (inPos && rci[i - 1] >= selTh && r < selTh) { inPos = false; return 'sell'; }
    return null;
  });

  return { sigs, lines: [{ label: `RCI(${n})`, data: rci, color: '#ff4081' }] };
}

// ---- 戦略: 移動平均乖離率 ----
export function signalMADev(data) {
  const n = parseInt($('md-n').value);
  const buyTh = parseFloat($('md-buy').value);
  const selTh = parseFloat($('md-sel').value);
  if (isNaN(n) || isNaN(buyTh) || isNaN(selTh)) throw new Error("移動平均乖離率パラメータが不正です");

  const closes = data.map(d => d.close);
  const maArr = sma(closes, n);
  const devArr = closes.map((c, i) => {
    if (maArr[i] == null || maArr[i] === 0) return null;
    return ((c - maArr[i]) / maArr[i]) * 100;
  });

  let inPos = false;
  const sigs = devArr.map((d, i) => {
    if (d == null || i === 0 || devArr[i - 1] == null) return null;
    if (!inPos && devArr[i - 1] <= buyTh && d > buyTh) { inPos = true; return 'buy'; }
    if (inPos && devArr[i - 1] >= selTh && d < selTh) { inPos = false; return 'sell'; }
    if (inPos && devArr[i - 1] > 0 && d <= 0) { inPos = false; return 'sell'; }
    return null;
  });

  return {
    sigs,
    lines: [{ label: `MA(${n})`, data: maArr, color: '#ffca28' }],
  };
}

// ---- 戦略: DMI ----
export function signalDMI(data) {
  const n = parseInt($('dmi-n').value);
  const adxTh = parseInt($('dmi-adx').value);
  if (isNaN(n) || isNaN(adxTh)) throw new Error("DMIパラメータが不正です");

  const { plusDI, minusDI, adx } = calcDMI(data, n);
  let inPos = false;

  const sigs = data.map((_, i) => {
    if (i === 0 || plusDI[i] == null || minusDI[i] == null) return null;
    const adxOk = adx[i] != null && adx[i] >= adxTh;
    if (!inPos && plusDI[i - 1] <= minusDI[i - 1] && plusDI[i] > minusDI[i] && adxOk) {
      inPos = true; return 'buy';
    }
    if (inPos && minusDI[i - 1] <= plusDI[i - 1] && minusDI[i] > plusDI[i]) {
      inPos = false; return 'sell';
    }
    return null;
  });

  return {
    sigs,
    lines: [
      { label: '+DI', data: plusDI, color: '#00e676' },
      { label: '-DI', data: minusDI, color: '#ff3d57' },
      { label: 'ADX', data: adx, color: '#ffca28' },
    ],
  };
}

// ---- 戦略: サイコロジカルライン ----
export function signalPsycho(data) {
  const n = parseInt($('ps-n').value);
  const buyTh = parseInt($('ps-buy').value);
  const selTh = parseInt($('ps-sel').value);
  if (isNaN(n) || isNaN(buyTh) || isNaN(selTh)) throw new Error("サイコロジカルパラメータが不正です");

  const closes = data.map(d => d.close);
  const psycho = closes.map((_, i) => {
    if (i < n) return null;
    const slice = closes.slice(i - n + 1, i + 1);
    const upDays = slice.filter((c, j) => j > 0 && c > slice[j - 1]).length;
    return (upDays / (n - 1)) * 100;
  });

  let inPos = false;
  const sigs = psycho.map((p, i) => {
    if (p == null || i === 0 || psycho[i - 1] == null) return null;
    if (!inPos && psycho[i - 1] <= buyTh && p > buyTh) { inPos = true; return 'buy'; }
    if (inPos && psycho[i - 1] >= selTh && p < selTh) { inPos = false; return 'sell'; }
    return null;
  });

  return { sigs, lines: [{ label: `Psycho(${n})`, data: psycho, color: '#9c27b0' }] };
}

// ---- 戦略: 標準偏差ブレイクアウト ----
export function signalStdBreak(data) {
  const nInput = $('sb-n');
  const lookbInput = $('sb-lookb');
  const thInput = $('sb-th');

  const n = nInput ? parseInt(nInput.value) || 20 : 20;
  const lookb = lookbInput ? parseInt(lookbInput.value) || 10 : 10;
  const thPct = (thInput ? parseInt(thInput.value) || 50 : 50) / 100;

  const closes = data.map(d => d.close);
  const stdArr = closes.map((_, i) => {
    if (i < n - 1) return null;
    const sl = closes.slice(i - n + 1, i + 1);
    const mean = sl.reduce((a, b) => a + b, 0) / n;
    const variance = sl.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
    return Math.sqrt(variance);
  });

  let inPos = false;
  const sigs = data.map((bar, i) => {
    if (stdArr[i] == null || i < n + lookb - 1) return null;

    const recent = stdArr.slice(i - lookb + 1, i + 1).filter(v => v != null);
    if (recent.length < lookb) return null;

    const minStd = Math.min(...recent);
    const maxStd = Math.max(...recent);
    const range = maxStd - minStd;

    const isContracted = range === 0 ? true : (stdArr[i] - minStd) / range <= thPct;

    if (!inPos && isContracted && bar.close > closes[i - 1]) {
      inPos = true; return 'buy';
    }
    if (inPos && stdArr[i] > stdArr[i - 1] && bar.close < closes[i - 1]) {
      inPos = false; return 'sell';
    }
    return null;
  });

  return { sigs, lines: [{ label: `StdDev(${n})`, data: stdArr, color: '#00bcd4' }] };
}

// ---- 戦略: ハンマー / 逆ハンマー ----
export function signalHammer(data) {
  const ratio   = +$('hm-ratio').value;
  const hold    = +$('hm-hold').value;
  let inPos     = false;
  let entryIdx  = 0;
  const sigs    = Array(data.length).fill(null);

  for (let i = 1; i < data.length; i++) {
    const bar   = data[i];
    const body  = Math.abs(bar.close - bar.open);
    const upper = bar.high - Math.max(bar.close, bar.open);
    const lower = Math.min(bar.close, bar.open) - bar.low;

    if (!inPos) {
      const isHammer =
        body > 0 && lower >= body * ratio && upper <= body * 0.5;
      const isInvHammer =
        body > 0 && upper >= body * ratio && lower <= body * 0.5;

      if (isHammer || isInvHammer) {
        inPos = true; entryIdx = i; sigs[i] = 'buy';
      }
    } else {
      if (i >= entryIdx + hold) { inPos = false; sigs[i] = 'sell'; }
    }
  }
  return { sigs, lines: [] };
}

// ---- 戦略: 包み足（エンゴルフィング）----
export function signalEngulf(data) {
  const type  = $('eg-type').value;
  let inPos   = false;
  const sigs  = Array(data.length).fill(null);

  for (let i = 1; i < data.length; i++) {
    const cur  = data[i];
    const prev = data[i - 1];
    const prevTop    = Math.max(prev.open, prev.close);
    const prevBottom = Math.min(prev.open, prev.close);
    const curTop     = Math.max(cur.open,  cur.close);
    const curBottom  = Math.min(cur.open,  cur.close);

    const isBullEngulf =
      prev.close < prev.open && cur.close > cur.open &&
      curBottom <= prevBottom && curTop >= prevTop;

    const isBearEngulf =
      prev.close > prev.open && cur.close < cur.open &&
      curTop >= prevTop && curBottom <= prevBottom;

    if (!inPos && isBullEngulf) {
      inPos = true; sigs[i] = 'buy';
    } else if (inPos && isBearEngulf && type === 'both') {
      inPos = false; sigs[i] = 'sell';
    }
  }
  return { sigs, lines: [] };
}

// ---- 戦略: 赤三兵 / 黒三兵 ----
export function signalThreeSoldiers(data) {
  const type    = $('th-type').value;
  const bodyMin = +$('th-body').value;
  const atr     = calcATR(data, 14);
  let inPos     = false;
  const sigs    = Array(data.length).fill(null);

  for (let i = 2; i < data.length; i++) {
    const d0 = data[i - 2];
    const d1 = data[i - 1];
    const d2 = data[i];
    const minBody = (atr[i] || 0) * bodyMin;

    const body0 = Math.abs(d0.close - d0.open);
    const body1 = Math.abs(d1.close - d1.open);
    const body2 = Math.abs(d2.close - d2.open);

    const isThreeWhite =
      d0.close > d0.open && d1.close > d1.open && d2.close > d2.open &&
      d1.close > d0.close && d2.close > d1.close &&
      body0 >= minBody && body1 >= minBody && body2 >= minBody;

    const isThreeBlack =
      d0.close < d0.open && d1.close < d1.open && d2.close < d2.open &&
      d1.close < d0.close && d2.close < d1.close &&
      body0 >= minBody && body1 >= minBody && body2 >= minBody;

    if (!inPos && isThreeWhite) {
      inPos = true; sigs[i] = 'buy';
    } else if (inPos && isThreeBlack && type === 'both') {
      inPos = false; sigs[i] = 'sell';
    }
  }
  return { sigs, lines: [] };
}

// ---- 戦略: 一目均衡表 ----
export function signalIchimoku(data) {
  const tenkanP  = parseInt($('ichi-tenkan').value)   || 9;
  const kijunP   = parseInt($('ichi-kijun').value)    || 26;
  const senkouBP = parseInt($('ichi-senkou-b').value) || 52;
  const mode     = $('ichi-mode').value;

  const closes = data.map(d => d.close);
  const highs  = data.map(d => d.high);
  const lows   = data.map(d => d.low);

  const { tenkan, kijun, senkouA, senkouB } = calcIchimoku(closes, highs, lows, tenkanP, kijunP, senkouBP);

  let inPosition = false;
  const sigs = data.map((_, i) => {
    const close = closes[i];
    const cloudTop    = senkouA[i] !== null && senkouB[i] !== null ? Math.max(senkouA[i], senkouB[i]) : null;
    const cloudBottom = senkouA[i] !== null && senkouB[i] !== null ? Math.min(senkouA[i], senkouB[i]) : null;

    let buySignal = false;
    let sellSignal = false;

    if (i > 0) {
      const tk0 = tenkan[i], tk1 = tenkan[i - 1];
      const kj0 = kijun[i],  kj1 = kijun[i - 1];
      const prevCloudTop    = senkouA[i-1] !== null && senkouB[i-1] !== null ? Math.max(senkouA[i-1], senkouB[i-1]) : null;
      const prevCloudBottom = senkouA[i-1] !== null && senkouB[i-1] !== null ? Math.min(senkouA[i-1], senkouB[i-1]) : null;

      if (mode === 'tk_cross') {
        buySignal  = tk1 !== null && kj1 !== null && tk0 !== null && kj0 !== null
          && tk1 < kj1 && tk0 >= kj0 && cloudTop !== null && close > cloudTop;
        sellSignal = tk1 !== null && kj1 !== null && tk0 !== null && kj0 !== null
          && tk1 > kj1 && tk0 <= kj0;
      } else if (mode === 'cloud_break') {
        buySignal  = prevCloudTop    !== null && cloudTop    !== null && closes[i-1] <= prevCloudTop    && close > cloudTop;
        sellSignal = prevCloudBottom !== null && cloudBottom !== null && closes[i-1] >= prevCloudBottom && close < cloudBottom;
      } else { // tk_cross_only
        buySignal  = tk1 !== null && kj1 !== null && tk0 !== null && kj0 !== null && tk1 < kj1 && tk0 >= kj0;
        sellSignal = tk1 !== null && kj1 !== null && tk0 !== null && kj0 !== null && tk1 > kj1 && tk0 <= kj0;
      }
    }

    if (!inPosition && buySignal)  { inPosition = true;  return 'buy'; }
    if (inPosition  && sellSignal) { inPosition = false; return 'sell'; }
    return null;
  });

  return {
    sigs,
    lines: [
      { label: '先行スパンA', data: senkouA, color: 'rgba(76,175,80,0.8)',  isSenkouA: true },
      { label: '先行スパンB', data: senkouB, color: 'rgba(244,67,54,0.8)',  isSenkouB: true },
      { label: '転換線',      data: tenkan,  color: 'rgba(33,150,243,0.9)' },
      { label: '基準線',      data: kijun,   color: 'rgba(255,152,0,0.9)'  },
    ],
  };
}

// ---- 戦略: ギャップ埋め ----
export function signalGapFill(data) {
  const minGapPct   = parseFloat($('gap-min-pct').value)    || 2.0;
  const fillTarget  = parseFloat($('gap-fill-target').value) || 100;
  const direction   = $('gap-direction').value;
  const timeoutDays = parseInt($('gap-timeout').value)       || 5;

  let inPosition = false;
  let gapTarget  = null;
  let entryBar   = null;

  const sigs = data.map((d, i) => {
    if (i === 0) return null;

    const prevClose = data[i - 1].close;
    const todayOpen = d.open;
    const gapPct    = (todayOpen - prevClose) / prevClose * 100;

    if (!inPosition) {
      if ((direction === 'down' || direction === 'both') && gapPct <= -minGapPct) {
        inPosition = true;
        gapTarget  = todayOpen + (prevClose - todayOpen) * (fillTarget / 100);
        entryBar   = i;
        return 'buy';
      }
    } else {
      const barsHeld = i - entryBar;
      if (d.close >= gapTarget || barsHeld >= timeoutDays) {
        inPosition = false;
        gapTarget  = null;
        entryBar   = null;
        return 'sell';
      }
    }
    return null;
  });

  return { sigs, lines: [] };
}
