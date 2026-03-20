# バックテストアプリ 戦略追加プロンプト集
## 出来高ベース戦略 3つ

---

## 共通の使い方

1. 以下のプロンプトをコピー
2. 新しいチャットを開く
3. `[ここに backtest_csv.html の中身を全文貼り付け]` を実際のHTMLで置き換えて送信

> ⚠️ 3戦略とも「出来高でエントリー判断＋株価の方向で最終確認」という構造です。
> 固定%損切り（既実装）を有効にした状態でバックテストすることを推奨します。

---

## 1. 出来高スパイク逆張り

平均出来高の極端に大きなスパイクは「売り尽くし・買い尽くし」のサイン。スパイク後の反転を狙う。

````
以下のHTMLファイルに「出来高スパイク逆張り」戦略を追加してください。

## 変更1: <select id="strategy"> に以下を追加
<option value="vol_spike">出来高スパイク逆張り</option>

## 変更2: 最後の戦略パラメータdivの直後に以下を追加
<div class="ci hidden" id="p-vol_spike">
  <label>平均期間 / スパイク倍率 / 保有日数</label>
  <div class="row2">
    <input id="vs-n"    type="number" value="20" min="5"  max="60"/>
    <span>日 /</span>
    <input id="vs-mult" type="number" value="3"  min="2"  max="10" step="0.5"/>
    <span>倍 /</span>
    <input id="vs-hold" type="number" value="5"  min="1"  max="20"/>
    <span>日後決済</span>
  </div>
</div>

## 変更3: 戦略切り替えのstratSel.addEventListener内の末尾に以下を追加
$('p-vol_spike').classList.toggle('hidden', $('strategy').value !== 'vol_spike');

## 変更4: 既存の戦略関数の末尾に以下を追加

function signalVolSpike(data) {
  const n      = +$('vs-n').value;
  const mult   = +$('vs-mult').value;
  const hold   = +$('vs-hold').value;
  const vols   = data.map(d => d.volume);
  const closes = data.map(d => d.close);

  // 平均出来高（当日を含まないN日間）
  const avgVol = vols.map((_, i) => {
    if (i < n) return null;
    return vols.slice(i - n, i).reduce((a, b) => a + b, 0) / n;
  });

  let inPos     = false;
  let entryIdx  = 0;
  const sigs    = Array(data.length).fill(null);

  for (let i = n; i < data.length; i++) {
    if (!inPos) {
      const isSpike   = avgVol[i] != null && vols[i] >= avgVol[i] * mult;
      const isDown    = closes[i] < closes[i - 1]; // 下落日のスパイク（売り尽くし）
      if (isSpike && isDown) {
        inPos    = true;
        entryIdx = i;
        sigs[i]  = 'buy';
      }
    } else {
      // 保有日数経過で強制決済
      if (i >= entryIdx + hold) {
        inPos   = false;
        sigs[i] = 'sell';
      }
    }
  }

  // 出来高の平均ラインをサブ表示（価格チャートには表示しないため空）
  return { sigs, lines: [] };
}

## 変更5: run()関数内の戦略分岐に以下を追加
: strat === 'vol_spike' ? signalVolSpike(loadedData)

## 元のHTMLファイル
[ここに backtest_csv.html の中身を全文貼り付け]
````

---

## 2. 出来高ドライアップ（枯渇）

出来高が極端に少ない状態が続いた後、出来高が急増して株価も上昇した日にエントリー。売り手が枯渇した後の本格上昇を狙う。

````
以下のHTMLファイルに「出来高ドライアップ（枯渇）」戦略を追加してください。

## 変更1: <select id="strategy"> に以下を追加
<option value="vol_dry">出来高ドライアップ</option>

## 変更2: 最後の戦略パラメータdivの直後に以下を追加
<div class="ci hidden" id="p-vol_dry">
  <label>平均期間 / 枯渇閾値(%) / 枯渇継続日数</label>
  <div class="row2">
    <input id="vd-n"    type="number" value="20" min="10" max="60"/>
    <span>日 /</span>
    <input id="vd-dry"  type="number" value="40" min="10" max="60"/>
    <span>% /</span>
    <input id="vd-days" type="number" value="3"  min="2"  max="10"/>
    <span>日以上</span>
  </div>
</div>

## 変更3: 戦略切り替えのstratSel.addEventListener内の末尾に以下を追加
$('p-vol_dry').classList.toggle('hidden', $('strategy').value !== 'vol_dry');

## 変更4: 既存の戦略関数の末尾に以下を追加

function signalVolDry(data) {
  const n       = +$('vd-n').value;
  const dryTh   = +$('vd-dry').value / 100;   // 枯渇閾値（平均のX%以下）
  const minDays = +$('vd-days').value;          // 枯渇が何日続いたら有効とするか
  const vols    = data.map(d => d.volume);
  const closes  = data.map(d => d.close);

  // 平均出来高（当日を含まないN日間）
  const avgVol = vols.map((_, i) => {
    if (i < n) return null;
    return vols.slice(i - n, i).reduce((a, b) => a + b, 0) / n;
  });

  let inPos        = false;
  let dryCount     = 0;   // 枯渇が続いている日数
  let wasDry       = false;
  const sigs       = Array(data.length).fill(null);

  for (let i = n; i < data.length; i++) {
    if (avgVol[i] == null) continue;
    const isDry    = vols[i] <= avgVol[i] * dryTh;
    const isBurst  = vols[i] >  avgVol[i];           // 出来高が平均超え
    const isUp     = closes[i] > closes[i - 1];      // 株価上昇

    if (!inPos) {
      if (isDry) {
        dryCount++;
        wasDry = dryCount >= minDays;
      } else {
        // 枯渇後に出来高急増＋株価上昇でエントリー
        if (wasDry && isBurst && isUp) {
          inPos      = true;
          sigs[i]    = 'buy';
        }
        dryCount = 0;
        wasDry   = false;
      }
    } else {
      // 再び出来高が平均を下回ったら決済
      if (vols[i] < avgVol[i] * 0.5) {
        inPos   = false;
        sigs[i] = 'sell';
        dryCount = 0;
        wasDry   = false;
      }
    }
  }

  return { sigs, lines: [] };
}

## 変更5: run()関数内の戦略分岐に以下を追加
: strat === 'vol_dry' ? signalVolDry(loadedData)

## 元のHTMLファイル
[ここに backtest_csv.html の中身を全文貼り付け]
````

---

## 3. 出来高移動平均クロス

株価ではなく出来高にMAクロスを適用。出来高の短期MAが長期MAを上抜けた時、市場への関心が高まっているとみなしてエントリー。

````
以下のHTMLファイルに「出来高移動平均クロス」戦略を追加してください。

## 変更1: <select id="strategy"> に以下を追加
<option value="vol_ma">出来高MAクロス</option>

## 変更2: 最後の戦略パラメータdivの直後に以下を追加
<div class="ci hidden" id="p-vol_ma">
  <label>出来高 短期MA / 長期MA（日）</label>
  <div class="row2">
    <input id="vm-s" type="number" value="5"  min="3" max="20"/>
    <span>/</span>
    <input id="vm-l" type="number" value="20" min="10" max="60"/>
    <span>日</span>
  </div>
</div>

## 変更3: 戦略切り替えのstratSel.addEventListener内の末尾に以下を追加
$('p-vol_ma').classList.toggle('hidden', $('strategy').value !== 'vol_ma');

## 変更4: 既存の戦略関数の末尾に以下を追加

function signalVolMA(data) {
  const s      = +$('vm-s').value;
  const l      = +$('vm-l').value;
  if (s >= l) throw new Error('短期MA < 長期MA にしてください');

  const vols   = data.map(d => d.volume);
  const closes = data.map(d => d.close);

  // 出来高のSMA
  const shortVolMA = sma(vols, s);
  const longVolMA  = sma(vols, l);

  let inPos = false;
  const sigs = data.map((_, i) => {
    if (!i || shortVolMA[i] == null || longVolMA[i] == null) return null;
    if (!shortVolMA[i-1] || !longVolMA[i-1]) return null;

    const isUp   = closes[i] > closes[i - 1]; // 株価上昇を確認
    const isDown = closes[i] < closes[i - 1];

    // 出来高短期MAが長期MAを上抜け かつ 株価上昇
    if (!inPos && shortVolMA[i-1] <= longVolMA[i-1] && shortVolMA[i] > longVolMA[i] && isUp) {
      inPos = true;  return 'buy';
    }
    // 出来高短期MAが長期MAを下抜け
    if (inPos  && shortVolMA[i-1] >= longVolMA[i-1] && shortVolMA[i] < longVolMA[i]) {
      inPos = false; return 'sell';
    }
    return null;
  });

  return { sigs, lines: [] };
}

## 変更5: run()関数内の戦略分岐に以下を追加
: strat === 'vol_ma' ? signalVolMA(loadedData)

## 元のHTMLファイル
[ここに backtest_csv.html の中品を全文貼り付け]
````

---

## 各戦略の特性まとめ

| 戦略 | 最適期間 | エントリー根拠 | 損切り設定 |
|---|---|---|---|
| 出来高スパイク逆張り | 数日〜1週間 | 大量売りの売り尽くしを拾う | 必須（固定%推奨） |
| 出来高ドライアップ | 1週間〜2週間 | 売り手枯渇後の本格上昇 | 推奨 |
| 出来高MAクロス | 1週間〜1ヶ月 | 市場関心度の高まりに乗る | 推奨 |
