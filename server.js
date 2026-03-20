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

// Yahoo Finance から日足データを取得（CSV形式）
function fetchYahooCSV(ticker, period1, period2) {
  return new Promise((resolve, reject) => {
    const encodedTicker = encodeURIComponent(ticker);
    const targetUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodedTicker}?interval=1d&period1=${period1}&period2=${period2}&events=history`;

    console.log('[DEBUG] リクエスト開始:', targetUrl);

    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
        'Cache-Control': 'no-cache',
      },
    };

    const req = https.get(targetUrl, options, (res) => {
      console.log('[DEBUG] ステータスコード:', res.statusCode);
      console.log('[DEBUG] レスポンスヘッダー:', JSON.stringify(res.headers));

      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        console.log('[DEBUG] レスポンスボディ（先頭300文字）:', data.slice(0, 300));

        // リダイレクトの処理（301/302）
        if (res.statusCode === 301 || res.statusCode === 302) {
          const location = res.headers['location'];
          console.log('[DEBUG] リダイレクト先:', location);
          reject(new Error(`リダイレクト発生: ${location}`));
          return;
        }

        // 429: レート制限
        if (res.statusCode === 429) {
          console.log('[DEBUG] レート制限（429）');
          reject(new Error('Yahoo Finance レート制限（しばらく待ってから再試行してください）'));
          return;
        }

        // 403: アクセス拒否
        if (res.statusCode === 403) {
          console.log('[DEBUG] アクセス拒否（403）');
          reject(new Error('Yahoo Finance アクセス拒否（IPブロックの可能性あり）'));
          return;
        }

        // 200以外のエラー
        if (res.statusCode !== 200) {
          reject(new Error(`HTTPエラー: ${res.statusCode} / body: ${data.slice(0, 100)}`));
          return;
        }

        try {
          const json = JSON.parse(data);

          if (json.chart.error) {
            console.log('[DEBUG] Yahoo Finance APIエラー:', json.chart.error);
            reject(new Error('Yahoo Finance: ' + json.chart.error.description));
            return;
          }

          const result = json.chart.result[0];
          const timestamps = result.timestamp;
          const ohlcv = result.indicators.quote[0];

          const rows = timestamps.map((ts, i) => ({
            date:   new Date(ts * 1000).toISOString().split('T')[0],
            open:   ohlcv.open[i]   ? Math.round(ohlcv.open[i]   * 10) / 10 : null,
            high:   ohlcv.high[i]   ? Math.round(ohlcv.high[i]   * 10) / 10 : null,
            low:    ohlcv.low[i]    ? Math.round(ohlcv.low[i]    * 10) / 10 : null,
            close:  ohlcv.close[i]  ? Math.round(ohlcv.close[i]  * 10) / 10 : null,
            volume: ohlcv.volume[i] || 0,
          })).filter((r) => r.close !== null);

          console.log('[DEBUG] データ取得成功:', rows.length, '件');
          resolve(rows);

        } catch (e) {
          console.log('[DEBUG] JSONパースエラー:', e.message);
          console.log('[DEBUG] 生レスポンス:', data.slice(0, 500));
          reject(new Error('Yahoo Finance APIのパースに失敗: ' + e.message));
        }
      });
    });

    req.on('error', (e) => {
      console.log('[DEBUG] ネットワークエラー:', e.message);
      console.log('[DEBUG] エラー詳細:', e.code, e.syscall);
      reject(new Error('ネットワークエラー: ' + e.message));
    });

    // タイムアウト設定（10秒）
    req.setTimeout(10000, () => {
      console.log('[DEBUG] タイムアウト（10秒）');
      req.destroy();
      reject(new Error('タイムアウト: Yahoo Financeへの接続が10秒を超えました'));
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
