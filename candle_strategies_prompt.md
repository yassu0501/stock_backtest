# ローソク足パターン戦略追加プロンプト
## ハンマー / 包み足 / 赤三兵・黒三兵

## 使い方
このMDファイルと backtest_csv.html を新しいチャットに両方アップロードして
以下のメッセージを送信してください。

---

**送信メッセージ:**
```
添付のMDファイルの指示に従って、添付のHTMLファイルを修正してください。
```

---

## 変更1: <select id="strategy"> に以下を追加

```html
<option value="hammer">ハンマー / 逆ハンマー</option>
<option value="engulf">包み足（エンゴルフィング）</option>
<option value="three">赤三兵 / 黒三兵</option>
```

---

## 変更2: 最後の戦略パラメータdivの直後に以下を追加

```html
<!-- ハンマー -->
<div class="ci hidden" id="p-hammer">
  <label>ヒゲ倍率 / 保有日数</label>
  <div class="row2">
    <input id="hm-ratio" type="number" value="2"  min="1.5" max="5" step="0.5"/>
    <span>倍ヒゲ /</span>
    <input id="hm-hold"  type="number" value="5"  min="1"   max="20"/>
    <span>日後決済</span>
  </div>
</div>

<!-- 包み足 -->
<div class="ci hidden" id="p-engulf">
  <label>タイプ</label>
  <select id="eg-type">
    <option value="both">陽の包み足（買い）+ 陰の包み足（売り）</option>
    <option value="bull">陽の包み足のみ（買いシグナル）</option>
  </select>
</div>

<!-- 赤三兵・黒三兵 -->
<div class="ci hidden" id="p-three">
  <label>タイプ / 最小実体(ATR比)</label>
  <div class="row2">
    <select id="th-type">
      <option value="both">赤三兵（買い）+ 黒三兵（売り）</option>
      <option value="bull">赤三兵のみ</option>
    </select>
    <span>/ 実体 ≥</span>
    <input id="th-body" type="number" value="0.3" min="0.1" max="1" step="0.1"/>
    <span>ATR</span>
  </div>
</div>
```

---

## 変更3: 戦略切り替えのstratSel.addEventListener内の末尾に以下を追加

```js
$('p-hammer').classList.toggle('hidden', $('strategy').value !== 'hammer');
$('p-engulf').classList.toggle('hidden', $('strategy').value !== 'engulf');
$('p-three').classList.toggle('hidden',  $('strategy').value !== 'three');
```

---

## 変更4: 既存の戦略関数の末尾に以下を追加

```js
// ---- ATR計算 ----
function calcATR(data, n = 14) {
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

// ---- 戦略1: ハンマー / 逆ハンマー ----
function signalHammer(data) {
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

// ---- 戦略2: 包み足（エンゴルフィング）----
function signalEngulf(data) {
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

// ---- 戦略3: 赤三兵 / 黒三兵 ----
function signalThreeSoldiers(data) {
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
```

---

## 変更5: run()関数内の戦略分岐の末尾を以下に置き換え

```js
const { sigs, lines } = strat === 'ma'        ? signalMA(loadedData)
                      : strat === 'rsi'       ? signalRSI(loadedData)
                      : strat === 'bb'        ? signalBB(loadedData)
                      : strat === 'macd'      ? signalMACD(loadedData)
                      : strat === 'donchian'  ? signalDonchian(loadedData)
                      : strat === 'stoch'     ? signalStoch(loadedData)
                      : strat === 'psar'      ? signalPSAR(loadedData)
                      : strat === 'prev_high' ? signalPrevHigh(loadedData)
                      : strat === 'hammer'    ? signalHammer(loadedData)
                      : strat === 'engulf'    ? signalEngulf(loadedData)
                      : strat === 'three'     ? signalThreeSoldiers(loadedData)
                      : signalBB(loadedData);
```

※ 既存の戦略分岐の内容に合わせて行を増減してください。

---

## 注意点

- ハンマーは損切りライン（5〜8%推奨）を設定してから実行してください
- 包み足を「陽の包み足のみ」で使う場合は損切りラインの設定が必須です
- 赤三兵は取引回数が少ないため、データ期間を2〜3年に設定して検証してください
