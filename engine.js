// engine.js — 共有バックテストエンジン（非モジュール、グローバルスコープ）
// builder.html から <script src="engine.js"> として読み込む

// ============================================================
// SMA（単純移動平均）
// ============================================================
function calcSMA(arr, period) {
  return arr.map((_, i) => {
    if (i < period - 1) return null;
    const slice = arr.slice(i - period + 1, i + 1);
    return slice.reduce((a, b) => a + b, 0) / period;
  });
}

// ============================================================
// RSI
// ============================================================
function calcRSI(closes, period) {
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

// ============================================================
// EMA（指数移動平均）— nullに対応
// ============================================================
function calcEMA(arr, n) {
  const k = 2 / (n + 1);
  const out = Array(arr.length).fill(null);

  // 最初のn個の非null値でSMAを初期化
  let count = 0, sum = 0, initIdx = -1;
  for (let i = 0; i < arr.length; i++) {
    if (arr[i] === null || isNaN(arr[i])) continue;
    sum += arr[i];
    count++;
    if (count === n) { initIdx = i; out[i] = sum / n; break; }
  }
  if (initIdx === -1) return out;

  for (let i = initIdx + 1; i < arr.length; i++) {
    if (arr[i] === null || isNaN(arr[i])) { out[i] = out[i - 1]; continue; }
    if (out[i - 1] === null) { out[i] = arr[i]; continue; }
    out[i] = arr[i] * k + out[i - 1] * (1 - k);
  }
  return out;
}

// ============================================================
// ボリンジャーバンド
// ============================================================
function calcBB(closes, period, sigma) {
  const upper = [], lower = [], mid = [];
  for (let i = 0; i < closes.length; i++) {
    if (i < period - 1) { upper.push(null); lower.push(null); mid.push(null); continue; }
    const slice = closes.slice(i - period + 1, i + 1);
    const mean = slice.reduce((a, b) => a + b, 0) / period;
    const variance = slice.reduce((a, b) => a + (b - mean) ** 2, 0) / period;
    const std = Math.sqrt(variance);
    mid.push(mean);
    upper.push(mean + sigma * std);
    lower.push(mean - sigma * std);
  }
  return { upper, lower, mid };
}

// ============================================================
// MACD
// ============================================================
function calcMACD(closes, shortP, longP, signalP) {
  const emaS = calcEMA(closes, shortP);
  const emaL = calcEMA(closes, longP);
  const macd = closes.map((_, i) =>
    emaS[i] !== null && emaL[i] !== null ? emaS[i] - emaL[i] : null
  );

  // シグナル: 非nullのMACDに対してEMAを計算し、元の配列に戻す
  const signal = Array(closes.length).fill(null);
  const validVals = [], validIdxs = [];
  for (let i = 0; i < macd.length; i++) {
    if (macd[i] !== null) { validVals.push(macd[i]); validIdxs.push(i); }
  }
  if (validVals.length >= signalP) {
    const sigEma = calcEMA(validVals, signalP);
    for (let j = 0; j < validIdxs.length; j++) {
      signal[validIdxs[j]] = sigEma[j];
    }
  }
  return { macd, signal };
}

// ============================================================
// ストキャスティクス
// ============================================================
function calcStoch(closes, highs, lows, kPeriod, dPeriod) {
  const k = [];
  for (let i = 0; i < closes.length; i++) {
    if (i < kPeriod - 1) { k.push(null); continue; }
    const sliceH = highs.slice(i - kPeriod + 1, i + 1);
    const sliceL = lows.slice(i - kPeriod + 1, i + 1);
    const hh = Math.max(...sliceH);
    const ll = Math.min(...sliceL);
    k.push(hh === ll ? 50 : (closes[i] - ll) / (hh - ll) * 100);
  }
  // D = KのSMA
  const d = calcSMA(k.map(v => v ?? 0), dPeriod).map((v, i) => k[i] !== null ? v : null);
  return { k, d };
}

// ============================================================
// VWAP（累積型）
// ============================================================
function calcVWAP(closes, volumes) {
  const result = [];
  let cumPV = 0, cumVol = 0;
  for (let i = 0; i < closes.length; i++) {
    const vol = volumes[i] || 0;
    cumPV += closes[i] * vol;
    cumVol += vol;
    result.push(cumVol > 0 ? cumPV / cumVol : closes[i]);
  }
  return result;
}

// ============================================================
// ドンチャンチャネル
// ============================================================
function calcDonchian(highs, lows, period) {
  const high = [], low = [];
  for (let i = 0; i < highs.length; i++) {
    if (i < period - 1) { high.push(null); low.push(null); continue; }
    high.push(Math.max(...highs.slice(i - period + 1, i + 1)));
    low.push(Math.min(...lows.slice(i - period + 1, i + 1)));
  }
  return { high, low };
}

// ============================================================
// 一目均衡表
// ============================================================
function calcIchimoku(closes, highs, lows, tenkanP, kijunP, senkouBP) {
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
    tenkan.push(midPrice(highs, lows, i, tenkanP));
    kijun.push(midPrice(highs, lows, i, kijunP));
    const saIdx = i - kijunP;
    senkouA.push(saIdx >= 0 && tenkan[saIdx] !== null && kijun[saIdx] !== null
      ? (tenkan[saIdx] + kijun[saIdx]) / 2 : null);
    senkouB.push(saIdx >= 0 ? midPrice(highs, lows, saIdx, senkouBP) : null);
  }
  return { tenkan, kijun, senkouA, senkouB };
}

// ============================================================
// ローソク足パターン判定
// ============================================================
function isHammer(closes, highs, lows, i, opens) {
  const o = opens ? opens[i] : closes[i - 1];
  const c = closes[i], h = highs[i], l = lows[i];
  const body = Math.abs(c - o);
  if (body <= 0) return false;
  const lower = Math.min(c, o) - l;
  const upper = h - Math.max(c, o);
  return lower >= body * 2 && upper <= body * 0.5;
}

function isBullishEngulf(closes, highs, lows, i, opens) {
  if (i < 1) return false;
  const o0 = opens ? opens[i - 1] : closes[i - 2];
  const c0 = closes[i - 1];
  const o1 = opens ? opens[i] : closes[i - 1];
  const c1 = closes[i];
  return c0 < o0 && c1 > o1 && c1 > o0 && o1 < c0;
}

function isBearishEngulf(closes, highs, lows, i, opens) {
  if (i < 1) return false;
  const o0 = opens ? opens[i - 1] : closes[i - 2];
  const c0 = closes[i - 1];
  const o1 = opens ? opens[i] : closes[i - 1];
  const c1 = closes[i];
  return c0 > o0 && c1 < o1 && c1 < o0 && o1 > c0;
}

function isThreeWhiteSoldiers(closes, highs, lows, i, opens) {
  if (i < 2) return false;
  for (let j = 0; j < 3; j++) {
    const idx = i - 2 + j;
    const o = opens ? opens[idx] : closes[idx - 1];
    if (closes[idx] <= o) return false;
  }
  return closes[i] > closes[i - 1] && closes[i - 1] > closes[i - 2];
}

function isThreeBlackCrows(closes, highs, lows, i, opens) {
  if (i < 2) return false;
  for (let j = 0; j < 3; j++) {
    const idx = i - 2 + j;
    const o = opens ? opens[idx] : closes[idx - 1];
    if (closes[idx] >= o) return false;
  }
  return closes[i] < closes[i - 1] && closes[i - 1] < closes[i - 2];
}

// ============================================================
// ノイズ適用（簡易版）
// ============================================================
function applyNoise(price, noiseMode, volume) {
  const presets = { off: 0, low: 0.001, mid: 0.002, high: 0.005 };
  const slip = presets[noiseMode] || 0;
  if (slip === 0) return price;
  const rand = (Math.random() - 0.5) * 2; // -1〜+1
  return price * (1 + slip * rand);
}

// ============================================================
// メトリクス計算
// ============================================================
function calcMetrics(trades, initialCapital) {
  if (!trades || trades.length === 0) {
    return { totalTrades: 0, winRate: 0, pf: 0, totalPnl: 0, returnPct: 0, avgHold: 0, maxDD: 0 };
  }
  const wins   = trades.filter(t => t.pnl > 0);
  const losses = trades.filter(t => t.pnl <= 0);
  const grossWin  = wins.reduce((s, t) => s + t.pnl, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));
  const pf        = grossLoss > 0 ? grossWin / grossLoss : (grossWin > 0 ? 99.9 : 0);
  const totalPnl  = trades.reduce((s, t) => s + t.pnl, 0);
  const returnPct = initialCapital > 0 ? totalPnl / initialCapital * 100 : 0;
  const avgHold   = trades.reduce((s, t) => s + (t.holdDays || 0), 0) / trades.length;

  let equity = initialCapital, peak = equity, maxDD = 0;
  for (const trade of trades) {
    equity += trade.pnl;
    if (equity > peak) peak = equity;
    const dd = peak > 0 ? (peak - equity) / peak : 0;
    if (dd > maxDD) maxDD = dd;
  }
  return {
    totalTrades: trades.length,
    winRate: wins.length / trades.length * 100,
    pf, totalPnl, returnPct, avgHold,
    maxDD: maxDD * 100,
  };
}

// ============================================================
// 株価データ取得（サーバー経由）
// ============================================================
async function fetchPriceData(ticker, period) {
  const res = await fetch(`/api/stock?ticker=${encodeURIComponent(ticker)}&period=${period}`);
  if (!res.ok) throw new Error(`データ取得エラー: ${res.status}`);
  const { data } = await res.json();
  if (!data || data.length < 60) throw new Error('データが不足しています（最低60日必要）');
  return {
    closes:  data.map(d => d.close),
    opens:   data.map(d => d.open),
    highs:   data.map(d => d.high),
    lows:    data.map(d => d.low),
    volumes: data.map(d => d.volume || 0),
    dates:   data.map(d => d.date),
    rawData: data,
  };
}

// ============================================================
// 条件評価エンジン
// ============================================================

/**
 * グループ間を groupLogic (AND|OR) で評価
 */
function evaluateStrategy(groups, groupLogic, indicators, i, closes, highs, lows, volumes) {
  if (!groups || groups.length === 0) return false;
  if (groupLogic === 'AND') {
    return groups.every(g => evaluateConditionGroup(g, indicators, i, closes, highs, lows, volumes));
  }
  return groups.some(g => evaluateConditionGroup(g, indicators, i, closes, highs, lows, volumes));
}

/**
 * 単一グループ内の条件を logic (AND|OR) で評価
 */
function evaluateConditionGroup(group, indicators, i, closes, highs, lows, volumes) {
  if (!group || !group.conditions || group.conditions.length === 0) return false;
  const results = group.conditions.map(cond =>
    evaluateCondition(cond, indicators, i, closes, highs, lows, volumes)
  );
  return group.logic === 'AND' ? results.every(Boolean) : results.some(Boolean);
}

/**
 * 単一条件を評価
 */
function evaluateCondition(cond, indicators, i, closes, highs, lows, volumes) {
  if (i < 1) return false;
  const { type, params, direction } = cond;
  const ind = indicators[type];

  switch (type) {
    case 'ma_cross': {
      const s = ind && ind.short, l = ind && ind.long;
      if (!s?.[i] || !l?.[i] || !s?.[i-1] || !l?.[i-1]) return false;
      if (direction === 'golden') return s[i-1] < l[i-1] && s[i] >= l[i];
      if (direction === 'dead')   return s[i-1] > l[i-1] && s[i] <= l[i];
      return false;
    }

    case 'rsi': {
      const rsi = ind && ind.values;
      if (!rsi?.[i] || rsi[i-1] === null) return false;
      if (direction === 'above')      return rsi[i-1] < params.threshold && rsi[i] >= params.threshold;
      if (direction === 'below')      return rsi[i-1] > params.threshold && rsi[i] <= params.threshold;
      if (direction === 'oversold')   return rsi[i] <= params.threshold;
      if (direction === 'overbought') return rsi[i] >= params.threshold;
      return false;
    }

    case 'macd': {
      const { macd, signal } = ind || {};
      if (!macd?.[i] || !signal?.[i] || !macd?.[i-1] || !signal?.[i-1]) return false;
      if (direction === 'cross_up')   return macd[i-1] < signal[i-1] && macd[i] >= signal[i];
      if (direction === 'cross_down') return macd[i-1] > signal[i-1] && macd[i] <= signal[i];
      return false;
    }

    case 'bb': {
      const { upper, lower } = ind || {};
      if (!upper?.[i] || !lower?.[i]) return false;
      if (direction === 'break_upper')  return closes[i-1] < upper[i-1] && closes[i] >= upper[i];
      if (direction === 'break_lower')  return closes[i-1] > lower[i-1] && closes[i] <= lower[i];
      if (direction === 'above_upper')  return closes[i] >= upper[i];
      if (direction === 'below_lower')  return closes[i] <= lower[i];
      if (direction === 'recover_lower') return closes[i-1] <= lower[i-1] && closes[i] > lower[i];
      return false;
    }

    case 'stoch': {
      const { k, d } = ind || {};
      if (!k?.[i] || !d?.[i] || k[i-1] === null || d[i-1] === null) return false;
      const inOversold   = k[i] < params.threshold && d[i] < params.threshold;
      const inOverbought = k[i] > (100 - params.threshold) && d[i] > (100 - params.threshold);
      if (direction === 'cross_up')   return inOversold   && k[i-1] < d[i-1] && k[i] >= d[i];
      if (direction === 'cross_down') return inOverbought && k[i-1] > d[i-1] && k[i] <= d[i];
      return false;
    }

    case 'donchian': {
      const { high, low } = ind || {};
      if (!high?.[i] || !low?.[i]) return false;
      if (direction === 'break_high') return closes[i] >= high[i];
      if (direction === 'break_low')  return closes[i] <= low[i];
      return false;
    }

    case 'vwap': {
      const vwap = ind && ind.values;
      if (!vwap?.[i] || !vwap?.[i-1]) return false;
      if (direction === 'cross_up')   return closes[i-1] < vwap[i-1] && closes[i] >= vwap[i];
      if (direction === 'cross_down') return closes[i-1] > vwap[i-1] && closes[i] <= vwap[i];
      if (direction === 'above')      return closes[i] > vwap[i];
      if (direction === 'below')      return closes[i] < vwap[i];
      return false;
    }

    case 'volume': {
      const avgVol = ind && ind.avg;
      if (!avgVol?.[i] || !volumes?.[i]) return false;
      if (direction === 'above') return volumes[i] >= avgVol[i] * params.multiplier;
      if (direction === 'below') return volumes[i] <= avgVol[i] * params.multiplier;
      return false;
    }

    case 'gap': {
      const opens_arr = indicators._opens;
      if (!opens_arr?.[i] || closes[i-1] == null) return false;
      const gapPct = (opens_arr[i] - closes[i-1]) / closes[i-1] * 100;
      if (direction === 'down') return gapPct <= -params.minPct;
      if (direction === 'up')   return gapPct >=  params.minPct;
      return false;
    }

    case 'ichimoku': {
      const { tenkan, kijun, senkouA, senkouB } = ind || {};
      if (!tenkan?.[i] || !kijun?.[i]) return false;
      const cloudTop    = Math.max(senkouA?.[i] ?? -Infinity, senkouB?.[i] ?? -Infinity);
      const cloudBottom = Math.min(senkouA?.[i] ?? Infinity,  senkouB?.[i] ?? Infinity);
      if (direction === 'tk_cross_up')           return tenkan[i-1] < kijun[i-1] && tenkan[i] >= kijun[i];
      if (direction === 'tk_cross_down')         return tenkan[i-1] > kijun[i-1] && tenkan[i] <= kijun[i];
      if (direction === 'tk_cross_above_cloud')  return tenkan[i-1] < kijun[i-1] && tenkan[i] >= kijun[i] && closes[i] > cloudTop;
      if (direction === 'price_above_cloud')     return closes[i-1] <= cloudTop   && closes[i] > cloudTop;
      if (direction === 'price_below_cloud')     return closes[i-1] >= cloudBottom && closes[i] < cloudBottom;
      return false;
    }

    case 'candle': {
      const opens_arr = indicators._opens;
      if (direction === 'hammer')      return isHammer(closes, highs, lows, i, opens_arr);
      if (direction === 'engulf_bull') return isBullishEngulf(closes, highs, lows, i, opens_arr);
      if (direction === 'engulf_bear') return isBearishEngulf(closes, highs, lows, i, opens_arr);
      if (direction === 'three_white') return isThreeWhiteSoldiers(closes, highs, lows, i, opens_arr);
      if (direction === 'three_black') return isThreeBlackCrows(closes, highs, lows, i, opens_arr);
      return false;
    }

    default:
      return false;
  }
}

// ============================================================
// インジケーター事前計算（ループ前に1回だけ）
// ============================================================
function precomputeIndicators(priceData, strategy) {
  const { closes, opens, highs, lows, volumes } = priceData;
  const allConds = getAllConditions(strategy);
  const computed = { _opens: opens };

  for (const cond of allConds) {
    if (computed[cond.type]) continue; // 同タイプは1回だけ

    switch (cond.type) {
      case 'ma_cross':
        computed.ma_cross = {
          short: calcSMA(closes, cond.params.short),
          long:  calcSMA(closes, cond.params.long),
        };
        break;
      case 'rsi':
        computed.rsi = { values: calcRSI(closes, cond.params.period) };
        break;
      case 'macd':
        computed.macd = calcMACD(closes, cond.params.short, cond.params.long, cond.params.signal);
        break;
      case 'bb':
        computed.bb = calcBB(closes, cond.params.period, cond.params.sigma);
        break;
      case 'stoch':
        computed.stoch = calcStoch(closes, highs, lows, cond.params.k, cond.params.d);
        break;
      case 'donchian':
        computed.donchian = calcDonchian(highs, lows, cond.params.period);
        break;
      case 'vwap':
        computed.vwap = { values: calcVWAP(closes, volumes) };
        break;
      case 'volume':
        computed.volume = { avg: calcSMA(volumes, cond.params.period) };
        break;
      case 'ichimoku':
        computed.ichimoku = calcIchimoku(closes, highs, lows,
          cond.params.tenkan, cond.params.kijun, cond.params.senkouB);
        break;
      // candle は計算不要（バーごとに直接判定）
    }
  }
  return computed;
}

function getAllConditions(strategy) {
  const all = [];
  for (const g of (strategy.entryGroups || [])) all.push(...(g.conditions || []));
  all.push(...((strategy.exitConditions?.conditions) || []));
  return all;
}

// ============================================================
// 汎用バックテストエンジン
// ============================================================
/**
 * @param {Object} priceData  - { closes, opens, highs, lows, volumes, dates }
 * @param {Object} strategy   - { entryGroups, groupLogic, exitConditions, timeoutDays }
 * @param {Object} settings   - { initialCapital, commission, stopLoss, takeProfit, compounding, fixedInvestment, noise }
 * @returns {Object}          - { trades, metrics, signals, finalCapital }
 */
function runCustomBacktest(priceData, strategy, settings) {
  const { closes, opens, highs, lows, volumes, dates } = priceData;
  const len = closes.length;

  // 条件が空のグループだけ → トレードなし
  const hasEntryConditions = (strategy.entryGroups || []).some(
    g => g.conditions && g.conditions.length > 0
  );
  if (!hasEntryConditions) {
    const metrics = calcMetrics([], settings.initialCapital);
    return { trades: [], metrics, signals: { buy: [], sell: [] }, finalCapital: settings.initialCapital };
  }

  // インジケーター事前計算
  const indicators = precomputeIndicators(priceData, strategy);

  let capital = settings.initialCapital;
  let position = null;
  const trades = [];
  const signals = { buy: [], sell: [] };

  for (let i = 50; i < len; i++) {
    const execPrice = applyNoise(opens[i] ?? closes[i], settings.noise, volumes[i]);

    // --- ポジションあり: 決済判定 ---
    if (position) {
      const unrealizedPct = (closes[i] - position.entryPrice) / position.entryPrice * 100;
      let exitReason = null;

      // 1. ストップロス/利確（当日の価格で判定）
      if (settings.stopLoss > 0 && unrealizedPct <= -settings.stopLoss) {
        exitReason = `損切 -${settings.stopLoss}%`;
      } else if (settings.takeProfit > 0 && unrealizedPct >= settings.takeProfit) {
        exitReason = `利確 +${settings.takeProfit}%`;
      } 
      // 2. テクニカル指標による決済シグナル（前日 i-1 までのデータで判断）
      else if (strategy.exitConditions && evaluateConditionGroup(
        strategy.exitConditions, indicators, i - 1, closes, highs, lows, volumes
      )) {
        exitReason = 'シグナル決済';
      } 
      // 3. タイムアウト
      else if (strategy.timeoutDays > 0 && (i - position.entryBar) >= strategy.timeoutDays) {
        exitReason = `タイムアウト ${strategy.timeoutDays}日`;
      }

      if (exitReason) {
        const commission = execPrice * position.shares * (settings.commission / 100);
        const pnl = (execPrice - position.entryPrice) * position.shares - commission - position.entryCommission;
        capital += position.entryInvestment + pnl;

        trades.push({
          entryDate:  dates[position.entryBar],
          exitDate:   dates[i],
          entryPrice: Math.round(position.entryPrice * 100) / 100,
          exitPrice:  Math.round(execPrice * 100) / 100,
          shares:     position.shares,
          pnl:        Math.round(pnl),
          pnlPct:     (execPrice - position.entryPrice) / position.entryPrice * 100,
          holdDays:   i - position.entryBar,
          exitReason,
        });
        signals.sell.push({ bar: i, price: execPrice, date: dates[i] });
        position = null;
      }
    }

    // --- ポジションなし: エントリー判定 ---
    // 前日 (i-1) の終値までの結果を見て、当日 (i) の始値でエントリー
    if (!position) {
      const entryOk = evaluateStrategy(
        strategy.entryGroups, strategy.groupLogic,
        indicators, i - 1, closes, highs, lows, volumes
      );

      if (entryOk) {
        const investment = settings.compounding
          ? capital
          : Math.min(settings.fixedInvestment || settings.initialCapital, capital);
        const shares = Math.floor(investment / execPrice);
        if (shares > 0) {
          const commission = execPrice * shares * (settings.commission / 100);
          const cost = execPrice * shares + commission;
          if (cost <= capital) {
            position = {
              entryPrice:      execPrice,
              entryBar:        i,
              shares,
              entryInvestment: cost,
              entryCommission: commission,
            };
            capital -= cost;
            signals.buy.push({ bar: i, price: execPrice, date: dates[i] });
          }
        }
      }
    }
  }

  // 期末に未決ポジションを強制決済
  if (position) {
    const lastPrice = closes[len - 1];
    const commission = lastPrice * position.shares * (settings.commission / 100);
    const pnl = (lastPrice - position.entryPrice) * position.shares - commission - position.entryCommission;
    capital += position.entryInvestment + pnl;
    trades.push({
      entryDate:  dates[position.entryBar],
      exitDate:   dates[len - 1] + ' (未決)',
      entryPrice: Math.round(position.entryPrice * 100) / 100,
      exitPrice:  Math.round(lastPrice * 100) / 100,
      shares:     position.shares,
      pnl:        Math.round(pnl),
      pnlPct:     (lastPrice - position.entryPrice) / position.entryPrice * 100,
      holdDays:   len - 1 - position.entryBar,
      exitReason: '期末決済',
    });
  }

  return {
    trades,
    signals,
    metrics: calcMetrics(trades, settings.initialCapital),
    finalCapital: Math.round(capital),
  };
}
