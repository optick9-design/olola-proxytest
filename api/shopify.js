// api/shopify.js — 토큰 자동 갱신 포함 Shopify 프록시

// 토큰 캐시는 store(테넌트)별로 분리한다. 전역 단일 캐시는 여러 store가
// 같은 토큰을 공유하게 되어, 한 store의 토큰이 다른 store 요청에 새어나간다.
const tokenCache = new Map(); // store -> { token, expiry }

// 테스트에서 캐시를 초기화하기 위한 헬퍼 (서버리스 모듈 상태 격리용)
export function _resetTokenCache(store) {
  if (store) tokenCache.delete(store);
  else tokenCache.clear();
}

async function getValidToken(store, clientId, clientSecret) {
  const now = Date.now();
  const cached = tokenCache.get(store);
  if (cached && cached.expiry - now > 3600 * 1000) {
    return cached.token;
  }
  const r = await fetch(`https://${store}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "client_credentials",
    }).toString(),
  });
  const data = await r.json();
  if (!data.access_token) {
    throw new Error("토큰 발급 실패: " + JSON.stringify(data.errors || data));
  }
  tokenCache.set(store, {
    token: data.access_token,
    expiry: now + (data.expires_in || 86400) * 1000,
  });
  console.log(`[${new Date().toISOString()}] 새 Shopify 토큰 발급 완료 (${store})`);
  return data.access_token;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Shopify-Store, X-Shopify-Token, X-Shopify-Client-Id, X-Shopify-Client-Secret");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const store = req.headers["x-shopify-store"] || process.env.SHOPIFY_STORE;
  let token = req.headers["x-shopify-token"];

  if (!token) {
    const clientId     = req.headers["x-shopify-client-id"]     || process.env.SHOPIFY_CLIENT_ID;
    const clientSecret = req.headers["x-shopify-client-secret"] || process.env.SHOPIFY_CLIENT_SECRET;
    if (clientId && clientSecret && store) {
      try { token = await getValidToken(store, clientId, clientSecret); }
      catch (e) { return res.status(401).json({ error: "토큰 자동 발급 실패: " + e.message }); }
    } else {
      token = process.env.SHOPIFY_TOKEN;
    }
  }

  if (!store || !token) return res.status(400).json({ error: "store 또는 token 누락" });

  const { endpoint = "orders", ...params } = req.query;
  const ALLOWED = ["orders", "products", "customers", "shop"];
  if (!ALLOWED.includes(endpoint)) return res.status(400).json({ error: "허용되지 않는 엔드포인트" });

  const qs  = new URLSearchParams(params).toString();
  const url = `https://${store}/admin/api/2026-01/${endpoint}.json${qs ? "?" + qs : ""}`;

  try {
    let r = await fetch(url, {
      headers: { "X-Shopify-Access-Token": token, "Content-Type": "application/json" },
    });

    if (r.status === 401) {
      tokenCache.delete(store);
      const clientId     = req.headers["x-shopify-client-id"]     || process.env.SHOPIFY_CLIENT_ID;
      const clientSecret = req.headers["x-shopify-client-secret"] || process.env.SHOPIFY_CLIENT_SECRET;
      if (clientId && clientSecret) {
        token = await getValidToken(store, clientId, clientSecret);
        r = await fetch(url, {
          headers: { "X-Shopify-Access-Token": token, "Content-Type": "application/json" },
        });
      }
    }

    if (!r.ok) {
      const err = await r.text();
      return res.status(r.status).json({ errors: err });
    }
    return res.status(200).json(await r.json());
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
