// simulate.js — バックテストエンジン
import InstitutionalAnalyzer from './institutional-analyzer.js';
import {
  signalMA, signalRSI, signalBB, signalMACD, signalDonchian,
  signalStoch, signalPSAR, signalPrevHigh, signalRCI, signalMADev,
  signalDMI, signalPsycho, signalStdBreak,
  signalHammer, signalEngulf, signalThreeSoldiers,
  signalIchimoku, signalGapFill,
} from './strategies.js';

const $ = (id) => document.getElementById(id);

// ========================================
// ノイズエンジン
// ========================================
export class NoiseEngine {
  static PRESETS = {
    off: null,
    low: {
      slippage: { base: 0.001, random: 0.001 },
      gapFilter: null,
      liquidity: null,
      delay: null,
    },
    medium: {
      slippage: { base: 0.001, random: 0.001 },
      gapFilter: { threshold: 0.03, mode: 'probabilistic', probability: 0.5 },
      liquidity: null,
      delay: null,
    },
    high: {
      slippage: { base: 0.002, random: 0.003 },
      gapFilter: { threshold: 0.03, mode: 'probabilistic', probability: 0.5 },
      liquidity: { minTurnover: 1e8, maxVolumeRatio: 0.05 },
      delay: { probability: 0.2, maxDays: 1 },
    },
  };

  constructor(mode = 'off', seed = null) {
    this.mode = mode;
    this.params = NoiseEngine.PRESETS[mode] || null;
    this.seed = seed;
    this._rngState = seed !== null ? seed : Math.floor(Math.random() * 2147483647);
  }

  _random() {
    this._rngState = (this._rngState * 16807 + 0) % 2147483647;
    return (this._rngState - 1) / 2147483646;
  }

  isOff() {
    return this.mode === 'off' || !this.params;
  }

  applySlippage(price, isBuy) {
    if (this.isOff() || !this.params.slippage) return price;
    const { base, random } = this.params.slippage;
    const slipRate = base + this._random() * random;
    return isBuy ? price * (1 + slipRate) : price * (1 - slipRate);
  }

  shouldSkipByGap(open, prevClose) {
    if (this.isOff() || !this.params.gapFilter) return false;
    const { threshold, mode, probability } = this.params.gapFilter;
    const gap = Math.abs(open - prevClose) / prevClose;
    if (gap <= threshold) return false;
    if (mode === 'skip') return true;
    if (mode === 'probabilistic') return this._random() < probability;
    return false;
  }

  getGapPenalty(open, prevClose) {
    if (this.isOff() || !this.params.gapFilter) return 0;
    const { threshold, mode } = this.params.gapFilter;
    const gap = Math.abs(open - prevClose) / prevClose;
    if (gap <= threshold || mode !== 'penalty') return 0;
    return 0.005;
  }

  calcFillRatio(positionSize, volume, price) {
    if (this.isOff() || !this.params.liquidity) return 1.0;
    const { minTurnover, maxVolumeRatio } = this.params.liquidity;
    const turnover = volume * price;
    if (turnover < minTurnover) return 0;
    if (positionSize > volume * maxVolumeRatio) {
      return (volume * maxVolumeRatio) / positionSize;
    }
    return 1.0;
  }

  getDelayDays() {
    if (this.isOff() || !this.params.delay) return 0;
    const { probability, maxDays } = this.params.delay;
    if (this._random() < probability) {
      return Math.floor(this._random() * maxDays) + 1;
    }
    return 0;
  }
}

// ========================================
// バックテストシミュレーター
// ========================================
export function simulate(data, sigs, noiseEngine = null, dynamicExit = null) {
  const capEl = document.querySelector('[data-type="cap"]') || $('cap-v3');
  const cap   = capEl ? parseFloat(capEl.value) : 1_000_000;
  const fee   = (+$('fee').value || 0) / 100;
  const slPct = +($('sl-pct') || {value:0}).value;
  const tpPct   = +($('tp-pct') || {value:0}).value;
  const invMode = ($('investment-mode') || {value: 'compound'}).value;
  const fixedAmt = +($('fixed-inv-amt') || {value: 1000000}).value;

  const ne = noiseEngine;
  const noiseActive = ne && !ne.isOff();

  let cash = cap, pos = null;
  const trades = [], equityCurve = [];
  let skippedByNoise = 0;

  data.forEach((bar, i) => {
    const p       = bar.close;
    const nextBar = data[i + 1];
    let sig       = sigs[i];

    if (pos) {
      const chg = (p - pos.price) / pos.price * 100;
      if (slPct > 0 && chg <= -slPct) {
        sig = 'sell'; sigs[i] = 'sell'; pos.exitReason = `ロスカット (-${slPct}%)`;
      } else if (tpPct > 0 && chg >= tpPct) {
        sig = 'sell'; sigs[i] = 'sell'; pos.exitReason = `利確 (+${tpPct}%)`;
      } else if (dynamicExit) {
        const dExit = dynamicExit(pos.price, i);
        // 損切なし（slPct=0）の場合、EXIT_LOSS はスキップ（利確は通す）
        const blockedByNoSL = slPct === 0 && dExit.action === 'EXIT_LOSS';
        if (dExit.action !== 'HOLD' && !blockedByNoSL) {
          sig = 'sell'; sigs[i] = 'sell'; pos.exitReason = dExit.reason;
        }
      }
      // 損切なし（slPct=0）: 含み損での全exit をブロック（利確のみ通す）
      if (slPct === 0 && sig === 'sell' && chg < 0 && !pos.exitReason?.includes('利確')) {
        sig = null; sigs[i] = null; pos.exitReason = null;
      }
    }

    if (sig === 'buy' && !pos && nextBar) {
      if (noiseActive && i > 0) {
        const prevClose = data[i].close;
        if (ne.shouldSkipByGap(nextBar.open, prevClose)) {
          skippedByNoise++;
          equityCurve.push({ date: bar.date, equity: Math.round(cash) });
          return;
        }
      }

      let entryPrice = nextBar.open;
      if (noiseActive) {
        entryPrice = ne.applySlippage(entryPrice, true);
        if (i > 0) {
          const penalty = ne.getGapPenalty(nextBar.open, data[i].close);
          if (penalty > 0) entryPrice *= (1 + penalty);
        }
      }

      const targetAmt  = invMode === 'compound' ? cash : fixedAmt;
      const entryAmt   = Math.min(cash, targetAmt);
      let shares       = Math.floor(entryAmt * (1 - fee) / entryPrice);

      if (noiseActive && shares > 0) {
        const fillRatio = ne.calcFillRatio(shares, nextBar.volume || 0, entryPrice);
        if (fillRatio <= 0) {
          skippedByNoise++;
          equityCurve.push({ date: bar.date, equity: Math.round(cash) });
          return;
        }
        shares = Math.floor(shares * fillRatio);
      }

      if (shares > 0) {
        cash -= shares * entryPrice * (1 + fee);
        pos = { date: nextBar.date, price: entryPrice, shares };
      }
    } else if (sig === 'sell' && pos && nextBar) {
      let exitPrice = nextBar.open;
      if (noiseActive) exitPrice = ne.applySlippage(exitPrice, false);

      const proceeds = pos.shares * exitPrice * (1 - fee);
      trades.push({
        buyDate:   pos.date,
        buyPrice:  pos.price,
        sellDate:  nextBar.date,
        sellPrice: exitPrice,
        shares:    pos.shares,
        pnl:  Math.round(proceeds - pos.shares * pos.price),
        pnlPct:  (exitPrice - pos.price) / pos.price * 100,
        holdDays: Math.round((new Date(nextBar.date) - new Date(pos.date)) / 86400000),
        exitReason: pos.exitReason || "通常決済",
      });
      cash += proceeds;
      pos = null;
    }

    equityCurve.push({
      date: bar.date,
      equity: Math.round(cash + (pos ? pos.shares * p : 0)),
    });
  });

  if (pos) {
    const lastBar = data[data.length - 1];
    let exitPrice = lastBar.close;
    if (noiseActive) exitPrice = ne.applySlippage(exitPrice, false);
    const proceeds = pos.shares * exitPrice * (1 - fee);
    trades.push({
      buyDate:   pos.date,
      buyPrice:  pos.price,
      sellDate:  lastBar.date + " (未決)",
      sellPrice: exitPrice,
      shares:    pos.shares,
      pnl:  Math.round(proceeds - pos.shares * pos.price),
      pnlPct:  (exitPrice - pos.price) / pos.price * 100,
      holdDays: Math.round((new Date(lastBar.date) - new Date(pos.date)) / 86400000),
      isOpen: true,
    });
    cash += proceeds;
    pos = null;
  }

  const last     = equityCurve[equityCurve.length - 1].equity;
  const totalPnl = last - cap;
  const returnPct = totalPnl / cap * 100;
  const wins     = trades.filter(t => t.pnl > 0).length;
  const winRate  = trades.length ? wins / trades.length * 100 : 0;
  const avgHold  = trades.length
    ? trades.reduce((s, t) => s + t.holdDays, 0) / trades.length : 0;

  let peak = equityCurve[0].equity, maxDD = 0;
  equityCurve.forEach(e => {
    if (e.equity > peak) peak = e.equity;
    const dd = (peak - e.equity) / peak;
    if (dd > maxDD) maxDD = dd;
  });

  const grossWin  = trades.filter(t => t.pnl > 0).reduce((s, t) => s + t.pnl, 0);
  const grossLoss = Math.abs(trades.filter(t => t.pnl <= 0).reduce((s, t) => s + t.pnl, 0));
  const pf = grossLoss > 0 ? grossWin / grossLoss : (grossWin > 0 ? 99.9 : 0);

  const maxDDDays = calculateMaxDDDays(equityCurve.map(e => e.equity));

  return {
    trades, equityCurve, totalPnl, returnPct, winRate,
    maxDD: maxDD * 100, avgHold, pf, skippedByNoise, maxDDDays,
  };
}

// ========================================
// ドローダウン日数
// ========================================
export function calculateMaxDDDays(equityCurve) {
  if (!equityCurve || equityCurve.length < 2) return 0;
  let peak = equityCurve[0], ddDays = 0, maxDDDays = 0;
  for (let i = 1; i < equityCurve.length; i++) {
    if (equityCurve[i] >= peak) { peak = equityCurve[i]; ddDays = 0; }
    else { ddDays += 1; if (ddDays > maxDDDays) maxDDDays = ddDays; }
  }
  return maxDDDays;
}

// ========================================
// ノイズ耐性スコア
// ========================================
export function calculateResilience(normalProfit, noiseProfit) {
  if (normalProfit === 0) return 0;
  return noiseProfit / normalProfit;
}

// ========================================
// 最大トレード依存率
// ========================================
export function calculateMaxTradeDependency(profits) {
  if (!profits || profits.length === 0) return 0;
  const positiveProfits = profits.filter(p => p > 0);
  if (positiveProfits.length === 0) return 0;
  const total = positiveProfits.reduce((a, b) => a + b, 0);
  if (total === 0) return 0;
  return Math.max(...positiveProfits) / total;
}

// ========================================
// 最大ドローダウン回復日数
// ========================================
export function calculateMaxRecoveryDays(equityCurve) {
  if (!equityCurve || equityCurve.length < 2) return 0;
  let peak = equityCurve[0], recoveryDays = 0, maxRecoveryDays = 0, inDrawdown = false;
  for (let i = 1; i < equityCurve.length; i++) {
    if (equityCurve[i] >= peak) {
      peak = equityCurve[i];
      if (inDrawdown) {
        if (recoveryDays > maxRecoveryDays) maxRecoveryDays = recoveryDays;
        recoveryDays = 0; inDrawdown = false;
      }
    } else { inDrawdown = true; recoveryDays += 1; }
  }
  if (inDrawdown && recoveryDays > maxRecoveryDays) maxRecoveryDays = recoveryDays;
  return maxRecoveryDays;
}

// ========================================
// 相場環境判定
// ========================================
export function detectMarketRegimeSeries(closes, N = 20) {
  const regimes = new Array(closes.length).fill(null);
  for (let i = N; i < closes.length; i++) {
    const window = closes.slice(i - N, i + 1);
    const returns = [];
    for (let j = 1; j < window.length; j++) returns.push(window[j] / window[j - 1] - 1);
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((a, b) => a + (b - mean) ** 2, 0) / returns.length;
    const vol = Math.sqrt(variance);
    const ret = window[window.length - 1] / window[0] - 1;
    const trendStrength = Math.abs(ret) / (vol || 1e-8);
    if (trendStrength > 1.5) regimes[i] = ret > 0 ? "uptrend" : "downtrend";
    else if (vol > 0.02) regimes[i] = "high_volatility";
    else regimes[i] = "range";
  }
  return regimes;
}

// ========================================
// 環境別パフォーマンス集計
// ========================================
export function analyzeRegimePerformance(trades, data, regimes) {
  const result = {
    uptrend:         { trades: 0, profit: 0, wins: 0 },
    downtrend:       { trades: 0, profit: 0, wins: 0 },
    range:           { trades: 0, profit: 0, wins: 0 },
    high_volatility: { trades: 0, profit: 0, wins: 0 },
  };
  if (!trades || !data || !regimes) return result;

  const dateIndex = {};
  data.forEach((bar, i) => { dateIndex[bar.date] = i; });

  trades.forEach(trade => {
    const idx = dateIndex[trade.buyDate];
    if (idx == null) return;
    const regime = regimes[idx] || 'range';
    if (result[regime]) {
      result[regime].trades += 1;
      result[regime].profit += trade.pnl;
      if (trade.pnl > 0) result[regime].wins += 1;
    }
  });
  return result;
}

// ========================================
// ノイズモード取得
// ========================================
export function getNoiseMode() {
  const el = $('noise-mode');
  return el ? el.value : 'off';
}

// ========================================
// バックテスト実行（UI連携用）
// ========================================
export function runBacktest(data, overrideStrategy = null, noiseMode = 'off') {
  const strategy = overrideStrategy || document.getElementById('strategy-select').value;
  let res;

  const institutionalStrategies = ['volumeBreakdown', 'vwap', 'volumeDecay'];
  const isInstitutional = institutionalStrategies.includes(strategy);
  let analyzer = null;

  if (isInstitutional) {
    analyzer = new InstitutionalAnalyzer({
      closes: data.map(d => d.close),
      highs: data.map(d => d.high),
      lows: data.map(d => d.low),
      volumes: data.map(d => d.volume),
      dates: data.map(d => d.date)
    });

    const sigs = data.map((_, i) => {
      let result;
      if (strategy === 'volumeBreakdown') result = analyzer.detectVolumeBreakdownSignal(i);
      else if (strategy === 'vwap') result = analyzer.detectVWAPSignal(i);
      else if (strategy === 'volumeDecay') result = analyzer.detectVolumeDecaySignal(i);
      return result.signal === 'BUY' ? 'buy' : (result.signal === 'SELL' ? 'sell' : null);
    });
    res = { sigs, lines: [] };

    if (strategy === 'vwap') {
      res.lines.push({ label: 'VWAP', data: analyzer.getVWAP(), color: '#FFA500', isVWAP: true });
      res.lines.push({ label: 'VWAP Cross', data: analyzer.getVWAPCrossPoints(), color: '#FFA500', isVWAPCross: true });
    } else if (strategy === 'volumeDecay') {
      res.lines.push({ label: '出来高MA20', data: analyzer.getVolumeMA(20), color: '#3498DB', isVolumeMA: true });
      res.lines.push({ label: '出来高減衰', data: analyzer.getVolumeDecayPoints(), isVolumeDecay: true });
    } else if (strategy === 'volumeBreakdown') {
      res.lines.push({ label: '高値更新(25d)', data: analyzer.getHighestHigh(25), color: '#2ECC71', isHH: true });
      res.lines.push({ label: '出来高爆発', data: analyzer.getVolumeBreakdownPoints(), color: '#E74C3C', isVolumeBreakdown: true });
    }
  } else {
    switch (strategy) {
      case 'ma_cross':  res = signalMA(data); break;
      case 'rsi':       res = signalRSI(data); break;
      case 'bb':        res = signalBB(data); break;
      case 'macd':      res = signalMACD(data); break;
      case 'donchian':  res = signalDonchian(data); break;
      case 'stoch':     res = signalStoch(data); break;
      case 'psar':      res = signalPSAR(data); break;
      case 'prev_high': res = signalPrevHigh(data); break;
      case 'rci':       res = signalRCI(data); break;
      case 'ma_dev':    res = signalMADev(data); break;
      case 'dmi':       res = signalDMI(data); break;
      case 'psycho':    res = signalPsycho(data); break;
      case 'std_break': res = signalStdBreak(data); break;
      case 'hammer':    res = signalHammer(data); break;
      case 'engulf':    res = signalEngulf(data); break;
      case 'three':     res = signalThreeSoldiers(data); break;
      case 'ichimoku':  res = signalIchimoku(data); break;
      case 'gap_fill':  res = signalGapFill(data); break;
      default:          res = signalBB(data);
    }
  }

  const noiseEngine = (noiseMode && noiseMode !== 'off')
    ? new NoiseEngine(noiseMode, 42)
    : null;

  const sigsForSim = noiseEngine ? [...res.sigs] : res.sigs;

  const dynamicExit = isInstitutional ? (entryPrice, currentIndex) => {
    return analyzer.detectExitSignal(entryPrice, strategy, currentIndex);
  } : null;

  const result = simulate(data, sigsForSim, noiseEngine, dynamicExit);

  const closes = data.map(d => d.close);
  const regimes = detectMarketRegimeSeries(closes, 20);
  const regimePerf = analyzeRegimePerformance(result.trades, data, regimes);

  return { ...result, signals: res.sigs, indicators: res.lines, regimePerf };
}
