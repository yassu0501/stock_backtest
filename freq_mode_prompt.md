# 取引回数切り替えボタン追加プロンプト
## 「取引回数通常」「取引回数増」ボタンの実装

## 使い方
このMDファイルと backtest_csv.html を新しいチャットに両方アップロードして
以下のメッセージを送信してください。

---

**送信メッセージ:**
```
添付のMDファイルの指示に従って、添付のHTMLファイルを修正してください。
```

---

## 変更1: </style> の直前に以下のCSSを追加

```css
.freq-btns {
  display: flex;
  gap: 8px;
  margin-top: 6px;
}
.freq-btn {
  flex: 1;
  padding: 7px;
  font-family: var(--mono);
  font-size: 0.78rem;
  letter-spacing: 0.06em;
  border-radius: 2px;
  cursor: pointer;
  transition: all 0.15s;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--muted);
}
.freq-btn.active-normal {
  background: rgba(0, 229, 255, 0.1);
  border-color: var(--accent);
  color: var(--accent);
}
.freq-btn.active-more {
  background: rgba(255, 202, 40, 0.1);
  border-color: var(--yellow);
  color: var(--yellow);
}
.freq-label {
  font-family: var(--mono);
  font-size: 0.62rem;
  color: var(--muted);
  letter-spacing: 0.1em;
  text-transform: uppercase;
  margin-bottom: 5px;
}
```

---

## 変更2: 設定パネル内の実行ボタン（run-btnのcfg-item）の直前に以下を追加

```html
<div class="ci">
  <div class="freq-label">取引回数モード</div>
  <div class="freq-btns">
    <button class="freq-btn active-normal" id="btn-normal"
      onclick="setFreqMode('normal')">通常</button>
    <button class="freq-btn" id="btn-more"
      onclick="setFreqMode('more')">取引回数増</button>
  </div>
</div>
```

---

## 変更3: </script> の直前に以下のJavaScriptを追加

```js
// ============================================================
// 取引回数モード切り替え
// ============================================================

// 各戦略の通常・回数増パラメータ定義
const FREQ_PRESETS = {
  normal: {
    // 移動平均クロス
    'sma': 25,  'lma': 75,
    // MACD
    'm-fast': 12, 'm-slow': 26, 'm-sig': 9,
    // RSI
    'rp': 14, 'rb': 30, 'rs': 70,
    // ボリンジャーバンド
    'bp': 20, 'bsig': 2,
    // ストキャスティクス
    'st-n': 14, 'st-buy': 20, 'st-sel': 80,
    // ドンチャンチャネル
    'dc-n': 20,
    // パラボリックSAR
    'ps-af': 0.02, 'ps-max': 0.2,
    // 前日高値ブレイクアウト
    'ph-tp': 3,
    // ハンマー
    'hm-ratio': 2, 'hm-hold': 5,
    // 赤三兵
    'th-body': 0.3,
    // RCI
    'rci-n': 9, 'rci-buy': -80, 'rci-sel': 80,
    // 移動平均乖離率
    'md-n': 25, 'md-buy': -5, 'md-sel': 5,
    // DMI
    'dmi-n': 14, 'dmi-adx': 25,
    // サイコロジカル
    'ps-n': 12, 'ps-buy': 25, 'ps-sel': 75,
    // 出来高スパイク
    'vs-n': 20, 'vs-mult': 3, 'vs-hold': 5,
    // 出来高MA
    'vm-s': 5, 'vm-l': 20,
  },
  more: {
    // 移動平均クロス: 期間を短縮
    'sma': 10, 'lma': 30,
    // MACD: 期間を短縮
    'm-fast': 8, 'm-slow': 17, 'm-sig': 9,
    // RSI: 閾値を緩める
    'rp': 14, 'rb': 40, 'rs': 60,
    // ボリンジャーバンド: 期間短縮・σ縮小
    'bp': 15, 'bsig': 1.5,
    // ストキャスティクス: 閾値を緩める
    'st-n': 14, 'st-buy': 30, 'st-sel': 70,
    // ドンチャンチャネル: 期間を短縮
    'dc-n': 10,
    // パラボリックSAR: 加速係数を上げる
    'ps-af': 0.04, 'ps-max': 0.3,
    // 前日高値ブレイクアウト: 利確幅を縮小
    'ph-tp': 2,
    // ハンマー: ヒゲ倍率を下げ・保有日数短縮
    'hm-ratio': 1.5, 'hm-hold': 3,
    // 赤三兵: 最小実体を下げる
    'th-body': 0.1,
    // RCI: 閾値を緩める
    'rci-n': 9, 'rci-buy': -60, 'rci-sel': 60,
    // 移動平均乖離率: 閾値を緩める
    'md-n': 25, 'md-buy': -3, 'md-sel': 3,
    // DMI: ADX閾値を下げる
    'dmi-n': 14, 'dmi-adx': 15,
    // サイコロジカル: 閾値を緩める
    'ps-n': 12, 'ps-buy': 35, 'ps-sel': 65,
    // 出来高スパイク: 倍率を下げ・保有短縮
    'vs-n': 20, 'vs-mult': 2, 'vs-hold': 3,
    // 出来高MA: 期間を短縮
    'vm-s': 3, 'vm-l': 10,
  }
};

let currentFreqMode = 'normal';

function setFreqMode(mode) {
  currentFreqMode = mode;

  // ボタンのスタイル切り替え
  $('btn-normal').className = 'freq-btn' + (mode === 'normal' ? ' active-normal' : '');
  $('btn-more').className   = 'freq-btn' + (mode === 'more'   ? ' active-more'   : '');

  // パラメータを一括適用
  const preset = FREQ_PRESETS[mode];
  Object.entries(preset).forEach(([id, val]) => {
    const el = document.getElementById(id);
    if (el) el.value = val;
  });
}
```

---

## 変更なし（確認事項）

- `$` 関数（`const $ = id => document.getElementById(id)`）が
  スクリプト末尾に定義されている場合、`setFreqMode`関数内の
  `$('btn-normal')` などが参照できない場合があります。
  その場合は `$` を `document.getElementById` に置き換えてください。

---

## 動作仕様

| モード | ボタン色 | 変化内容 |
|---|---|---|
| 通常 | シアン | デフォルト値（元の設定） |
| 取引回数増 | イエロー | 以下を自動変更 |

**取引回数増で変わるパラメータ:**

| 戦略 | 変更内容 |
|---|---|
| 移動平均クロス | 短期MA: 25→10 / 長期MA: 75→30 |
| MACD | 短期EMA: 12→8 / 長期EMA: 26→17 |
| RSI | 買い閾値: 30→40 / 売り閾値: 70→60 |
| ボリンジャーバンド | 期間: 20→15 / σ: 2→1.5 |
| ストキャスティクス | 買い閾値: 20→30 / 売り閾値: 80→70 |
| ドンチャンチャネル | 期間: 20→10 |
| パラボリックSAR | 加速係数: 0.02→0.04 |
| ハンマー | ヒゲ倍率: 2→1.5 / 保有日数: 5→3 |
| 赤三兵 | 最小実体: 0.3→0.1ATR |
| RCI | 買い閾値: -80→-60 / 売り閾値: 80→60 |
| 移動平均乖離率 | 買い閾値: -5→-3% / 売り閾値: 5→3% |
| DMI | ADX閾値: 25→15 |
| サイコロジカル | 買い閾値: 25→35 / 売り閾値: 75→65 |
| 出来高スパイク | 倍率: 3→2 / 保有日数: 5→3 |
| 出来高MAクロス | 短期: 5→3 / 長期: 20→10 |

---

## 注意点

- モード切り替え後は必ず **▶ EXECUTE** を再実行してください
- 取引回数増モードはシグナルが増える分、**偽シグナルも増加**します
- 損切りラインを設定した状態での比較検証を推奨します
- 未実装の戦略のパラメータIDは無視されます（エラーにはなりません）
