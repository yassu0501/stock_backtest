# バックテストアプリ 戦略追加プロンプト集
## iSPEED オシレーター系（出来高除く）5戦略

---

## 共通の使い方

1. 以下のプロンプトをコピー
2. 新しいチャットを開く
3. `[ここに backtest_csv.html の中身を全文貼り付け]` を実際のHTMLで置き換えて送信

---

## 1. RCI（順位相関指数）

日本株トレーダーに最も人気の高い指標。日付の順位と株価の順位の相関を−100〜+100でスコア化。

````
以下のHTMLファイルにRCI（順位相関指数）戦略を追加してください。

## 変更1: <select id="strategy"> に以下を追加
<option value="rci">RCI</option>

## 変更2: 最後の戦略パラメータdivの直後に以下を追加
<div class="ci hidden" id="p-rci">
  <label>RCI期間 / 買閾値 / 売閾値</label>
  <div class="row2">
    <input id="rci-n"   type="number" value="9"   min="5" max="26"/>
    <span>日 /</span>
    <input id="rci-buy" type="number" value="-80" min="-95" max="-50"/>
    <span>/</span>
    <input id="rci-sel" type="number" value="80"  min="50"  max="95"/>
  </div>
</div>

## 変更3: 戦略切り替えのstratSel.addEventListener内の末尾に以下を追加
$('p-rci').classList.toggle('hidden', $('strategy').value !== 'rci');

## 変更4: 既存の戦略関数の末尾に以下を追加

function calcRCI(arr, n) {
  return arr.map((_, i) => {
    if (i < n - 1) return null;
    const slice = arr.slice(i - n + 1, i + 1);
    // 日付順位: 新しい順に1,2,...,n
    // 価格順位: 高い順に1,2,...,n
    const priceRanks = slice.map(v => {
      const rank = slice.filter(x => x > v).length + 1;
      return rank;
    });
    let d2sum = 0;
    for (let j = 0; j < n; j++) {
      const dateRank = n - j; // 新しい日が順位1
      const d = dateRank - priceRanks[j];
      d2sum += d * d;
    }
    return (1 - 6 * d2sum / (n * (n * n - 1))) * 100;
  });
}

function signalRCI(data) {
  const closes = data.map(d => d.close);
  const n      = +$('rci-n').value;
  const buyTh  = +$('rci-buy').value;
  const selTh  = +$('rci-sel').value;
  const rci    = calcRCI(closes, n);
  let inPos    = false;

  const sigs = rci.map((r, i) => {
    if (r == null || !i || rci[i-1] == null) return null;
    if (!inPos && rci[i-1] <= buyTh && r > buyTh) { inPos = true;  return 'buy'; }
    if (inPos  && rci[i-1] >= selTh && r < selTh) { inPos = false; return 'sell'; }
    return null;
  });

  return { sigs, lines: [] };
}

## 変更5: run()関数内の戦略分岐に以下を追加
: strat === 'rci' ? signalRCI(loadedData)

## 元のHTMLファイル
[ここに backtest_csv.html の中身を全文貼り付け]
````

---

## 2. 移動平均乖離率

現在の株価がMAからどれだけ乖離しているかを%で表示。売られすぎ・買われすぎの逆張り戦略。

````
以下のHTMLファイルに移動平均乖離率戦略を追加してください。

## 変更1: <select id="strategy"> に以下を追加
<option value="ma_dev">移動平均乖離率</option>

## 変更2: 最後の戦略パラメータdivの直後に以下を追加
<div class="ci hidden" id="p-ma_dev">
  <label>MA期間 / 買閾値(%) / 売閾値(%)</label>
  <div class="row2">
    <input id="md-n"   type="number" value="25"  min="5"   max="100"/>
    <span>日 /</span>
    <input id="md-buy" type="number" value="-5"  min="-20" max="-1" step="0.5"/>
    <span>/</span>
    <input id="md-sel" type="number" value="5"   min="1"   max="20" step="0.5"/>
    <span>%</span>
  </div>
</div>

## 変更3: 戦略切り替えのstratSel.addEventListener内の末尾に以下を追加
$('p-ma_dev').classList.toggle('hidden', $('strategy').value !== 'ma_dev');

## 変更4: 既存の戦略関数の末尾に以下を追加

function signalMADev(data) {
  const closes = data.map(d => d.close);
  const n      = +$('md-n').value;
  const buyTh  = +$('md-buy').value;
  const selTh  = +$('md-sel').value;
  const maArr  = sma(closes, n);

  // 乖離率: (終値 - MA) / MA * 100
  const devArr = closes.map((c, i) =>
    maArr[i] != null ? (c - maArr[i]) / maArr[i] * 100 : null
  );

  let inPos = false;
  const sigs = devArr.map((d, i) => {
    if (d == null || !i || devArr[i-1] == null) return null;
    // 売られすぎから回復（買い）
    if (!inPos && devArr[i-1] <= buyTh && d > buyTh) { inPos = true;  return 'buy'; }
    // 買われすぎから反落（売り）
    if (inPos  && devArr[i-1] >= selTh && d < selTh) { inPos = false; return 'sell'; }
    // 乖離率がゼロ回帰（売り）
    if (inPos  && devArr[i-1] > 0 && d <= 0)         { inPos = false; return 'sell'; }
    return null;
  });

  return {
    sigs,
    lines: [{ label: `MA${n}`, data: maArr, color: '#ffca28' }],
  };
}

## 変更5: run()関数内の戦略分岐に以下を追加
: strat === 'ma_dev' ? signalMADev(loadedData)

## 元のHTMLファイル
[ここに backtest_csv.html の中身を全文貼り付け]
````

---

## 3. DMI（方向性指数）

+DI（上昇力）と−DI（下降力）の強さを比較。ADXでトレンドの強さも確認できる。トレンド相場の判定に最適。

````
以下のHTMLファイルにDMI（方向性指数）戦略を追加してください。

## 変更1: <select id="strategy"> に以下を追加
<option value="dmi">DMI</option>

## 変更2: 最後の戦略パラメータdivの直後に以下を追加
<div class="ci hidden" id="p-dmi">
  <label>期間 / ADX閾値</label>
  <div class="row2">
    <input id="dmi-n"   type="number" value="14" min="5" max="30"/>
    <span>日 / ADX ≥</span>
    <input id="dmi-adx" type="number" value="25" min="10" max="50"/>
  </div>
</div>

## 変更3: 戦略切り替えのstratSel.addEventListener内の末尾に以下を追加
$('p-dmi').classList.toggle('hidden', $('strategy').value !== 'dmi');

## 変更4: 既存の戦略関数の末尾に以下を追加

function calcDMI(data, n) {
  const plusDI  = Array(data.length).fill(null);
  const minusDI = Array(data.length).fill(null);
  const adx     = Array(data.length).fill(null);

  // TR / +DM / -DM の初期計算
  const tr = [], pdm = [], mdm = [];
  for (let i = 1; i < data.length; i++) {
    const cur  = data[i], prev = data[i-1];
    const hl   = cur.high - cur.low;
    const hpc  = Math.abs(cur.high - prev.close);
    const lpc  = Math.abs(cur.low  - prev.close);
    tr.push(Math.max(hl, hpc, lpc));

    const upMove   = cur.high - prev.high;
    const downMove = prev.low - cur.low;
    pdm.push(upMove   > downMove && upMove   > 0 ? upMove   : 0);
    mdm.push(downMove > upMove   && downMove > 0 ? downMove : 0);
  }

  // Wilder平滑化
  if (tr.length < n) return { plusDI, minusDI, adx };

  let trN  = tr.slice(0, n).reduce((a, b) => a + b, 0);
  let pdmN = pdm.slice(0, n).reduce((a, b) => a + b, 0);
  let mdmN = mdm.slice(0, n).reduce((a, b) => a + b, 0);

  const diPlus  = [pdmN / trN * 100];
  const diMinus = [mdmN / trN * 100];

  for (let i = n; i < tr.length; i++) {
    trN  = trN  - trN  / n + tr[i];
    pdmN = pdmN - pdmN / n + pdm[i];
    mdmN = mdmN - mdmN / n + mdm[i];
    diPlus.push(pdmN / trN * 100);
    diMinus.push(mdmN / trN * 100);
  }

  // DX → ADX
  const dx = diPlus.map((p, i) => {
    const diff = Math.abs(p - diMinus[i]);
    const sum  = p + diMinus[i];
    return sum === 0 ? 0 : diff / sum * 100;
  });

  let adxVal = dx.slice(0, n).reduce((a, b) => a + b, 0) / n;
  const adxArr = [adxVal];
  for (let i = n; i < dx.length; i++) {
    adxVal = (adxVal * (n - 1) + dx[i]) / n;
    adxArr.push(adxVal);
  }

  // data配列に対応するインデックスにマッピング（先頭n個はnull）
  const offset = n; // trはi=1から始まるのでdata[n]がdiPlus[0]に対応
  for (let i = 0; i < diPlus.length; i++) {
    plusDI[i + offset]  = diPlus[i];
    minusDI[i + offset] = diMinus[i];
  }
  for (let i = 0; i < adxArr.length; i++) {
    adx[i + offset + n - 1] = adxArr[i];
  }

  return { plusDI, minusDI, adx };
}

function signalDMI(data) {
  const n       = +$('dmi-n').value;
  const adxTh   = +$('dmi-adx').value;
  const { plusDI, minusDI, adx } = calcDMI(data, n);
  let inPos = false;

  const sigs = data.map((_, i) => {
    if (!i || plusDI[i] == null || minusDI[i] == null) return null;
    const adxOk = adx[i] != null && adx[i] >= adxTh;
    // +DIが−DIを上抜け かつ ADXがトレンド確認
    if (!inPos && plusDI[i-1] <= minusDI[i-1] && plusDI[i] > minusDI[i] && adxOk) {
      inPos = true; return 'buy';
    }
    // −DIが+DIを上抜け
    if (inPos && minusDI[i-1] <= plusDI[i-1] && minusDI[i] > plusDI[i]) {
      inPos = false; return 'sell';
    }
    return null;
  });

  return {
    sigs,
    lines: [
      { label: '+DI', data: plusDI,  color: '#00e676' },
      { label: '-DI', data: minusDI, color: '#ff3d57' },
      { label: 'ADX', data: adx,     color: '#ffca28' },
    ],
  };
}

## 変更5: run()関数内の戦略分岐に以下を追加
: strat === 'dmi' ? signalDMI(loadedData)

## 元のHTMLファイル
[ここに backtest_csv.html の中身を全文貼り付け]
````

---

## 4. サイコロジカルライン

直近N日間で株価が上昇した日の割合（%）。人間の心理的偏りを数値化。計算が最もシンプルな指標。

````
以下のHTMLファイルにサイコロジカルライン戦略を追加してください。

## 変更1: <select id="strategy"> に以下を追加
<option value="psycho">サイコロジカルライン</option>

## 変更2: 最後の戦略パラメータdivの直後に以下を追加
<div class="ci hidden" id="p-psycho">
  <label>期間 / 買閾値(%) / 売閾値(%)</label>
  <div class="row2">
    <input id="ps-n"   type="number" value="12" min="5" max="26"/>
    <span>日 /</span>
    <input id="ps-buy" type="number" value="25" min="10" max="40"/>
    <span>/</span>
    <input id="ps-sel" type="number" value="75" min="60" max="90"/>
    <span>%</span>
  </div>
</div>

## 変更3: 戦略切り替えのstratSel.addEventListener内の末尾に以下を追加
$('p-psycho').classList.toggle('hidden', $('strategy').value !== 'psycho');

## 変更4: 既存の戦略関数の末尾に以下を追加

function signalPsycho(data) {
  const closes = data.map(d => d.close);
  const n      = +$('ps-n').value;
  const buyTh  = +$('ps-buy').value;
  const selTh  = +$('ps-sel').value;

  // サイコロジカルライン: 直近n日で上昇した日の割合
  const psycho = closes.map((_, i) => {
    if (i < n) return null;
    const slice = closes.slice(i - n + 1, i + 1);
    const upDays = slice.filter((c, j) => j > 0 && c > slice[j-1]).length;
    return upDays / (n - 1) * 100;
  });

  let inPos = false;
  const sigs = psycho.map((p, i) => {
    if (p == null || !i || psycho[i-1] == null) return null;
    if (!inPos && psycho[i-1] <= buyTh && p > buyTh) { inPos = true;  return 'buy'; }
    if (inPos  && psycho[i-1] >= selTh && p < selTh) { inPos = false; return 'sell'; }
    return null;
  });

  return { sigs, lines: [] };
}

## 変更5: run()関数内の戦略分岐に以下を追加
: strat === 'psycho' ? signalPsycho(loadedData)

## 元のHTMLファイル
[ここに backtest_csv.html の中身を全文貼り付け]
````

---

## 5. 標準偏差（ボラティリティ収縮ブレイクアウト）

ボラティリティが極端に小さい（収縮）局面を検出し、その後の急騰・急落を狙うブレイクアウト戦略。

````
以下のHTMLファイルに標準偏差ボラティリティ収縮ブレイクアウト戦略を追加してください。

## 変更1: <select id="strategy"> に以下を追加
<option value="std_break">標準偏差ブレイクアウト</option>

## 変更2: 最後の戦略パラメータdivの直後に以下を追加
<div class="ci hidden" id="p-std_break">
  <label>期間 / 収縮判定期間 / 収縮閾値(%)</label>
  <div class="row2">
    <input id="sb-n"     type="number" value="20" min="10" max="60"/>
    <span>日 /</span>
    <input id="sb-lookb" type="number" value="10" min="5"  max="30"/>
    <span>日 /</span>
    <input id="sb-th"    type="number" value="50" min="20" max="80"/>
    <span>%ile</span>
  </div>
</div>

## 変更3: 戦略切り替えのstratSel.addEventListener内の末尾に以下を追加
$('p-std_break').classList.toggle('hidden', $('strategy').value !== 'std_break');

## 変更4: 既存の戦略関数の末尾に以下を追加

function signalStdBreak(data) {
  const closes  = data.map(d => d.close);
  const n       = +$('sb-n').value;
  const lookb   = +$('sb-lookb').value;
  const thPct   = +$('sb-th').value / 100;

  // 各日のN日間標準偏差を計算
  const stdArr = closes.map((_, i) => {
    if (i < n - 1) return null;
    const sl   = closes.slice(i - n + 1, i + 1);
    const mean = sl.reduce((a, b) => a + b, 0) / n;
    return Math.sqrt(sl.reduce((a, b) => a + (b - mean) ** 2, 0) / n);
  });

  let inPos = false;
  const sigs = data.map((bar, i) => {
    if (stdArr[i] == null || i < n + lookb - 1) return null;

    // 直近lookb日の標準偏差の最小・最大を取得
    const recent = stdArr.slice(i - lookb + 1, i + 1).filter(v => v != null);
    if (recent.length < lookb) return null;
    const minStd = Math.min(...recent);
    const maxStd = Math.max(...recent);
    const range  = maxStd - minStd;

    // 現在の標準偏差が直近lookb日のthPct分位以下 → 収縮状態
    const isContracted = range === 0
      ? true
      : (stdArr[i] - minStd) / range <= thPct;

    if (!inPos && isContracted && bar.close > closes[i - 1]) {
      inPos = true; return 'buy';
    }
    if (inPos && stdArr[i] > stdArr[i - 1] && bar.close < closes[i - 1]) {
      inPos = false; return 'sell';
    }
    return null;
  });

  return { sigs, lines: [] };
}

## 変更5: run()関数内の戦略分岐に以下を追加
: strat === 'std_break' ? signalStdBreak(loadedData)

## 元のHTMLファイル
[ここに backtest_csv.html の中身を全文貼り付け]
````

---

## 各戦略の最適期間まとめ

| 戦略 | 最適期間 | タイプ | 難易度 |
|---|---|---|---|
| RCI | 1〜2週間（9日）/ 1ヶ月（26日） | 逆張り | 易 |
| 移動平均乖離率 | 1週間〜1ヶ月 | 逆張り | 易 |
| DMI | 2週間〜1ヶ月 | トレンド | 中 |
| サイコロジカルライン | 1〜2週間 | 逆張り | 易 |
| 標準偏差ブレイクアウト | 2週間〜1ヶ月 | ブレイクアウト | 中 |
