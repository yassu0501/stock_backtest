// server.js
// Node.js プロキシサーバー（Yahoo Finance → ブラウザへ中継）
// 起動: node server.js

const http = require("http");
const https = require("https");
const url = require("url");
const path = require("path");
const fs = require("fs");

const PORT = process.env.PORT || 3001;

// 最新株価キャッシュ (Phase 2)
const priceCache = new Map();

// MIMEタイプ
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css",
  ".js": "application/javascript",
};

// 銘柄コードの正規化
function normalizeTicker(ticker) {
  let t = (ticker || '').trim().toUpperCase();
  if (!t) return '7203.T';

  // 主要な指数のエイリアスマッピング（ゆれを許容）
  if (t.includes('日経平均') || t.includes('N225') || t.includes('NIKKEI')) return '^N225';
  // TOPIX やグロースは指数シンボル(^TPX)よりもETF(1306.T/2516.T)の方がデータ取得が安定するためそちらを利用
  if (t.includes('TOPIX') || t.includes('トピックス')) return '1306.T';
  if (t.includes('マザーズ') || t.includes('GROWTH250') || t.includes('グロース250') || t.includes('MTHR')) return '2516.T';
  if (t.includes('S&P500') || t.includes('SP500')) return '^GSPC';
  if (t.includes('NASDAQ') || t.includes('ナスダック')) return '^IXIC';
  if (t.includes('NYダウ') || t.includes('DOW')) return '^DJI';

  // 4文字かつ先頭が数字 → .T を自動付与
  if (/^\d[A-Z0-9]{3}$/.test(t)) {
    t = t + '.T';
  }

  // .t（小文字）→ .T に統一
  t = t.replace(/\.t$/, '.T');

  return t;
}

// Yahoo Finance から日足データを取得
function fetchYahooCSV(ticker, period1, period2) {
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

// 実際のHTTPリクエスト
function fetchOnce(ticker, period1, period2) {
  return new Promise((resolve, reject) => {
    const encodedTicker = encodeURIComponent(ticker);
    const targetUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodedTicker}?interval=1d&period1=${period1}&period2=${period2}&events=history&includeAdjustedClose=true`;

    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    };

    const req = https.get(targetUrl, options, (res) => {
      if (res.statusCode === 404) {
        reject(new Error(`404: 銘柄コード「${ticker}」は存在しないか、データが見つかりません`));
        return;
      }
      if (res.statusCode === 403) {
        reject(new Error('403: Yahoo Financeにアクセスできませんでした'));
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
            reject(new Error(`Yahoo API: ${json.chart.error.description}`));
            return;
          }
          const result = json.chart.result?.[0];
          if (!result || !result.timestamp) {
            reject(new Error('株価データが見つかりません。期間やシンボルを確認してください。'));
            return;
          }

          const timestamps = result.timestamp;
          const ohlcv = result.indicators.quote[0];
          const adjclose = result.indicators.adjclose?.[0]?.adjclose || []; // adjcloseがない場合は空配列

          const rows = timestamps.map((ts, i) => {
            const open  = ohlcv.open[i];
            const high  = ohlcv.high[i];
            const low   = ohlcv.low[i];
            const close = ohlcv.close[i];

            if (close === null || close === undefined) return null;

            // 配当等による調整（adjclose）を適用せず、実体価格（Close）をベースにする
            // これにより、現在の株価の数値と表示がピタリと一致するようになります
            const o = (open  !== null && open  !== undefined) ? open  : close;
            const h = (high  !== null && high  !== undefined) ? high  : close;
            const l = (low   !== null && low   !== undefined) ? low   : close;
            const c = close;

            return {
              date: new Date(ts * 1000).toISOString().split('T')[0],
              open:   Math.round(o * 10) / 10,
              high:   Math.round(h * 10) / 10,
              low:    Math.round(l * 10) / 10,
              close:  Math.round(c * 10) / 10,
              volume: ohlcv.volume[i] || 0,
            };
          }).filter(r => r !== null && r.close !== 0);

          if (rows.length === 0) {
            reject(new Error('取得できた有効なデータが0件です'));
            return;
          }
          resolve(rows);
        } catch (e) {
          reject(new Error('データ解析失敗: ' + e.message));
        }
      });
    });

    req.on('error', (e) => reject(new Error('通信エラー: ' + e.message)));
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('タイムアウト')); });
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
    "5y": now - 60 * 60 * 24 * 365 * 5,
  };
  return { period1: map[period] || map["1y"], period2: now };
}

const server = http.createServer((req, res) => {
  const parsed = new URL(req.url, `http://${req.headers.host}`);

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
    const ticker = parsed.searchParams.get("ticker") || "7203.T";
    const period = parsed.searchParams.get("period") || "1y";
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

  // --- API: /api/stock-price/:code (Phase 2) ---
  if (parsed.pathname.startsWith("/api/stock-price/")) {
    const code = normalizeTicker(parsed.pathname.split("/").pop());

    // キャッシュチェック（10分）
    const CACHE_DURATION = 10 * 60 * 1000;
    const cached = priceCache.get(code);
    if (cached && (Date.now() - cached.time < CACHE_DURATION)) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true, data: cached.data, fromCache: true }));
      return;
    }

    // レート制限（2秒待機）
    setTimeout(async () => {
      try {
        const query = encodeURIComponent(code);
        // interval=1d に戻して安定性を優先
        const targetUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${query}?interval=1d&range=1d`;

        const options = {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          },
        };

        https.get(targetUrl, options, (apiRes) => {
          let body = '';
          console.log(`[Proxy] Yahoo Finance(v8): ${code} - Status: ${apiRes.statusCode}`);
          
          if (apiRes.statusCode !== 200) {
            res.writeHead(apiRes.statusCode, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: `Yahoo API Error: ${apiRes.statusCode}` }));
            return;
          }

          apiRes.on('data', chunk => body += chunk);
          apiRes.on('end', () => {
            try {
              const json = JSON.parse(body);
              
              if (json?.chart?.error) {
                const msg = json.chart.error.description || 'Yahoo Error';
                console.error(`[Proxy] Yahoo返却エラー: ${msg}`);
                throw new Error(msg);
              }

              const result = json?.chart?.result?.[0];
              const meta = result?.meta;
              
              if (!meta || typeof meta.regularMarketPrice === 'undefined') {
                console.error(`[Proxy] 解析失敗(v8): ${body.substring(0, 500)}`);
                throw new Error('価格データの解析に失敗しました。銘柄コードが正しいか確認してください。');
              }

              const data = {
                close: meta.regularMarketPrice || 0,
                high:  meta.chartPreviousClose || meta.regularMarketPrice || 0, 
                low:   meta.regularMarketPrice || 0,
                timestamp: meta.regularMarketTime * 1000 || Date.now()
              };

              priceCache.set(code, { data, time: Date.now() });
              res.writeHead(200, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ success: true, data }));
            } catch (e) {
              console.error(`[Proxy] エラー詳細: ${e.message}`);
              res.writeHead(500, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ error: e.message }));
            }
          });
        }).on('error', e => {
          console.error(`[Proxy] 通信エラー: ${e.message}`);
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: e.message }));
        });
      } catch (err) {
        console.error(`[Proxy] 例外: ${err.message}`);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: err.message }));
      }
    }, 2000); // 2秒のレート制限
    return;
  }

  // --- 静的ファイル配信 ---
  let pathname = parsed.pathname === "/" ? "/index.html" : parsed.pathname;
  let filePath = path.join(__dirname, pathname);
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
