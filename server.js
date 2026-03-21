// server.js
// Node.js プロキシサーバー（Yahoo Finance → ブラウザへ中継）
// 起動: node server.js

const http = require("http");
const https = require("https");
const url = require("url");
const path = require("path");
const fs = require("fs");

const PORT = process.env.PORT || 3001;

// MIMEタイプ
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css",
  ".js": "application/javascript",
};

// 銘柄コードの正規化（自動補完のみ・エラーなし）
function normalizeTicker(ticker) {
  let t = (ticker || '').trim().toUpperCase();

  // 4文字かつ先頭が数字 → .T を自動付与（例: 7203 → 7203.T, 285A → 285A.T）
  if (/^\d[A-Z0-9]{3}$/.test(t)) {
    t = t + '.T';
  }

  // .t（小文字）→ .T に統一（例: 7203.t → 7203.T）
  t = t.replace(/\.t$/, '.T');

  return t;
}

// Yahoo Finance から日足データを取得（株式分割対応・リトライ付き）
function fetchYahooCSV(ticker, period1, period2) {
  // 銘柄コードを正規化
  const normalized = normalizeTicker(ticker);
  return fetchWithRetry(normalized, period1, period2, 3);
}

// リトライ付きフェッチ（最大retries回）
function fetchWithRetry(ticker, period1, period2, retries) {
  return fetchOnce(ticker, period1, period2).catch((err) => {
    // リトライ可能なエラーかどうか判定
    const isRetryable =
      err.message.includes('429') ||
      err.message.includes('503') ||
      err.message.includes('タイムアウト') ||
      err.message.includes('ネットワークエラー');

    if (retries > 0 && isRetryable) {
      const wait = (4 - retries) * 1500; // 1.5秒 → 3秒 → 4.5秒と間隔を広げる
      console.log(`リトライ待機 ${wait}ms... (残り${retries}回)`);
      return new Promise((resolve) => setTimeout(resolve, wait))
        .then(() => fetchWithRetry(ticker, period1, period2, retries - 1));
    }
    throw err;
  });
}

// 実際のHTTPリクエスト（単回実行）
function fetchOnce(ticker, period1, period2) {
  return new Promise((resolve, reject) => {
    const encodedTicker = encodeURIComponent(ticker);
    const targetUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodedTicker}?interval=1d&period1=${period1}&period2=${period2}&events=history&includeAdjustedClose=true`;

    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
        'Cache-Control': 'no-cache',
      },
    };

    const req = https.get(targetUrl, options, (res) => {
      if (res.statusCode === 403) {
        reject(new Error('403: Yahoo Financeにアクセスできませんでした'));
        return;
      }
      if (res.statusCode === 429) {
        reject(new Error('429: リクエスト制限中です'));
        return;
      }
      if (res.statusCode === 503) {
        reject(new Error('503: Yahoo Financeが一時的に利用不可です'));
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTPエラー: ${res.statusCode}`));
        return;
      }

      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const json = JSON.parse(data);

          if (json.chart.error) {
            const msg = json.chart.error.description || '不明なエラー';
            reject(new Error(`Yahoo Finance エラー: ${msg}`));
            return;
          }

          if (!json.chart.result || json.chart.result.length === 0) {
            reject(new Error('データが見つかりませんでした。銘柄コードを確認してください。'));
            return;
          }

          const result     = json.chart.result[0];
          const timestamps = result.timestamp;
          const ohlcv      = result.indicators.quote[0];
          const adjclose   = result.indicators.adjclose?.[0]?.adjclose;

          const rows = timestamps.map((ts, i) => {
            const rawClose = ohlcv.close[i];
            const adjClose = adjclose?.[i];

            // 調整比率の適用
            const ratio = (rawClose && adjClose && rawClose !== 0)
              ? adjClose / rawClose
              : 1;

            return {
              date:   new Date(ts * 1000).toISOString().split('T')[0],
              open:   ohlcv.open[i]  ? Math.round(ohlcv.open[i]  * ratio * 10) / 10 : null,
              high:   ohlcv.high[i]  ? Math.round(ohlcv.high[i]  * ratio * 10) / 10 : null,
              low:    ohlcv.low[i]   ? Math.round(ohlcv.low[i]   * ratio * 10) / 10 : null,
              close:  adjClose       ? Math.round(adjClose               * 10) / 10
                    : rawClose       ? Math.round(rawClose               * 10) / 10 : null,
              volume: ohlcv.volume[i] || 0,
            };
          }).filter((r) => r.close !== null);

          if (rows.length === 0) {
            reject(new Error('取得できたデータが0件です。期間を変更してください。'));
            return;
          }

          resolve(rows);

        } catch (e) {
          reject(new Error('レスポンスの解析に失敗しました: ' + e.message));
        }
      });
    });

    req.on('error', (e) => {
      reject(new Error('ネットワークエラー: ' + e.message));
    });

    req.setTimeout(10000, () => {
      req.destroy();
      reject(new Error('タイムアウト: 接続が10秒を超えました'));
    });
  });
}

// 期間文字列 → Unix timestamp変換
function periodToTimestamps(period) {
  const now = Math.floor(Date.now() / 1000);
  const map = {
    "6mo": now - 60 * 60 * 24 * 180,
    "1y": now - 60 * 60 * 24 * 365,
    "2y": now - 60 * 60 * 24 * 365 * 2,
    "3y": now - 60 * 60 * 24 * 365 * 3,
  };
  return { period1: map[period] || map["1y"], period2: now };
}

const server = http.createServer((req, res) => {
  const parsed = url.parse(req.url, true);

  // CORS ヘッダー
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  // --- API: /api/stock ---
  if (parsed.pathname === "/api/stock") {
    const ticker = parsed.query.ticker || "7203.T";
    const period = parsed.query.period || "1y";
    const { period1, period2 } = periodToTimestamps(period);

    fetchYahooCSV(ticker, period1, period2)
      .then((data) => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ticker, data }));
      })
      .catch((err) => {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: err.message }));
      });
    return;
  }

  // --- 静的ファイル配信 ---
  let filePath = path.join(__dirname, parsed.pathname === "/" ? "index.html" : parsed.pathname);
  const ext = path.extname(filePath);
  const contentType = MIME[ext] || "text/plain";

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    res.writeHead(200, { "Content-Type": contentType });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`✅ サーバー起動: http://localhost:${PORT}`);
});
