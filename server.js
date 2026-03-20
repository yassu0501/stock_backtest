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

    const options = {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; BacktestBot/1.0)",
      },
    };

    https
      .get(targetUrl, options, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            const json = JSON.parse(data);
            const result = json.chart.result[0];
            const timestamps = result.timestamp;
            const ohlcv = result.indicators.quote[0];
            const closes = ohlcv.close;
            const opens = ohlcv.open;
            const highs = ohlcv.high;
            const lows = ohlcv.low;
            const volumes = ohlcv.volume;

            const rows = timestamps.map((ts, i) => ({
              date: new Date(ts * 1000).toISOString().split("T")[0],
              open: opens[i] ? Math.round(opens[i] * 10) / 10 : null,
              high: highs[i] ? Math.round(highs[i] * 10) / 10 : null,
              low: lows[i] ? Math.round(lows[i] * 10) / 10 : null,
              close: closes[i] ? Math.round(closes[i] * 10) / 10 : null,
              volume: volumes[i] || 0,
            })).filter((r) => r.close !== null);

            resolve(rows);
          } catch (e) {
            reject(new Error("Yahoo Finance APIのパースに失敗: " + e.message));
          }
        });
      })
      .on("error", reject);
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
