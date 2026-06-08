import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import handler, { _resetTokenCache } from "../api/shopify.js";
import { mockReq, mockRes, fakeResponse } from "./helpers.js";

const STORE = "olola.myshopify.com";

// store 헤더를 포함한 GET 요청 빌더
function shopReq(overrides = {}) {
  const { headers = {}, query = {}, method = "GET" } = overrides;
  return mockReq({
    method,
    query,
    headers: { "x-shopify-store": STORE, ...headers },
  });
}

// 토큰 엔드포인트와 API 엔드포인트를 URL 로 구분하는 fetch 라우터
function routeFetch({ tokenResp, apiResp }) {
  const fn = vi.fn(async (url) => {
    if (url.includes("/admin/oauth/access_token")) {
      return typeof tokenResp === "function" ? tokenResp() : tokenResp;
    }
    return typeof apiResp === "function" ? apiResp() : apiResp;
  });
  global.fetch = fn;
  return fn;
}

describe("api/shopify.js", () => {
  const savedEnv = { ...process.env };

  beforeEach(() => {
    _resetTokenCache();
    vi.restoreAllMocks();
    // 환경변수 의존성을 제거해 결정적으로 만든다
    delete process.env.SHOPIFY_STORE;
    delete process.env.SHOPIFY_TOKEN;
    delete process.env.SHOPIFY_CLIENT_ID;
    delete process.env.SHOPIFY_CLIENT_SECRET;
  });

  afterEach(() => {
    process.env = { ...savedEnv };
  });

  it("OPTIONS → 200, non-GET → 405", async () => {
    const opt = mockRes();
    await handler(mockReq({ method: "OPTIONS" }), opt);
    expect(opt.statusCode).toBe(200);

    const post = mockRes();
    await handler(shopReq({ method: "POST" }), post);
    expect(post.statusCode).toBe(405);
  });

  it("store 또는 token 이 없으면 400", async () => {
    const res = mockRes();
    // store 헤더는 있지만 토큰/자격증명 전혀 없음
    await handler(mockReq({ headers: { "x-shopify-store": STORE } }), res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/누락/);
  });

  it("허용되지 않은 endpoint 는 400", async () => {
    const res = mockRes();
    await handler(
      shopReq({ headers: { "x-shopify-token": "t" }, query: { endpoint: "metafields" } }),
      res
    );
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/허용되지 않는/);
  });

  it("허용된 endpoint + 명시적 토큰으로 성공 호출", async () => {
    const fn = routeFetch({
      apiResp: fakeResponse({ status: 200, json: { orders: [{ id: 1 }] } }),
    });
    const res = mockRes();
    await handler(
      shopReq({ headers: { "x-shopify-token": "explicit" }, query: { endpoint: "orders", limit: "5" } }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ orders: [{ id: 1 }] });
    const [url, opts] = fn.mock.calls[0];
    expect(url).toBe(
      `https://${STORE}/admin/api/2026-01/orders.json?limit=5`
    );
    expect(opts.headers["X-Shopify-Access-Token"]).toBe("explicit");
  });

  it("기본 endpoint 는 orders 이다", async () => {
    const fn = routeFetch({ apiResp: fakeResponse({ json: {} }) });
    const res = mockRes();
    await handler(shopReq({ headers: { "x-shopify-token": "t" } }), res);
    expect(fn.mock.calls[0][0]).toContain("/orders.json");
  });

  it("토큰이 없고 client 자격증명이 있으면 자동 발급한다", async () => {
    const fn = routeFetch({
      tokenResp: fakeResponse({ json: { access_token: "auto_tok", expires_in: 7200 } }),
      apiResp: fakeResponse({ json: { products: [] } }),
    });
    const res = mockRes();
    await handler(
      shopReq({
        headers: { "x-shopify-client-id": "id", "x-shopify-client-secret": "sec" },
        query: { endpoint: "products" },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    // 토큰 발급 후 발급된 토큰으로 API 호출
    const apiCall = fn.mock.calls.find((c) => c[0].includes("/products.json"));
    expect(apiCall[1].headers["X-Shopify-Access-Token"]).toBe("auto_tok");
  });

  it("자동 토큰 발급 실패 시 401", async () => {
    routeFetch({
      tokenResp: fakeResponse({ json: { errors: "invalid_client" } }),
    });
    const res = mockRes();
    await handler(
      shopReq({
        headers: { "x-shopify-client-id": "id", "x-shopify-client-secret": "bad" },
        query: { endpoint: "shop" },
      }),
      res
    );
    expect(res.statusCode).toBe(401);
    expect(res.body.error).toMatch(/자동 발급 실패/);
  });

  it("API 가 401 이면 캐시를 비우고 토큰 재발급 후 재시도한다", async () => {
    let apiCallCount = 0;
    const fn = vi.fn(async (url) => {
      if (url.includes("/admin/oauth/access_token")) {
        return fakeResponse({ json: { access_token: "fresh_tok", expires_in: 3600 } });
      }
      apiCallCount++;
      if (apiCallCount === 1) return fakeResponse({ status: 401, text: "expired" });
      return fakeResponse({ status: 200, json: { shop: { name: "OLOLA" } } });
    });
    global.fetch = fn;

    const res = mockRes();
    await handler(
      shopReq({
        headers: { "x-shopify-client-id": "id", "x-shopify-client-secret": "sec" },
        query: { endpoint: "shop" },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ shop: { name: "OLOLA" } });
    expect(apiCallCount).toBe(2); // 최초 401 + 재시도
  });

  it("업스트림이 ok 가 아니면 status + errors 텍스트를 전달한다", async () => {
    routeFetch({ apiResp: fakeResponse({ status: 429, text: "rate limited" }) });
    const res = mockRes();
    await handler(
      shopReq({ headers: { "x-shopify-token": "t" }, query: { endpoint: "orders" } }),
      res
    );
    expect(res.statusCode).toBe(429);
    expect(res.body).toEqual({ errors: "rate limited" });
  });

  it("fetch 가 throw 하면 500", async () => {
    global.fetch = vi.fn(async () => {
      throw new Error("socket hang up");
    });
    const res = mockRes();
    await handler(
      shopReq({ headers: { "x-shopify-token": "t" }, query: { endpoint: "orders" } }),
      res
    );
    expect(res.statusCode).toBe(500);
    expect(res.body.error).toBe("socket hang up");
  });

  // 멀티테넌트 캐시 버그 회귀 테스트: store A 토큰이 store B 에 새지 않아야 한다.
  it("[멀티테넌트] store 별로 토큰 캐시가 분리된다", async () => {
    const tokensByStore = {
      "a.myshopify.com": "token_A",
      "b.myshopify.com": "token_B",
    };
    const usedTokens = {};
    global.fetch = vi.fn(async (url, opts) => {
      const m = url.match(/^https:\/\/([^/]+)\//);
      const host = m[1];
      if (url.includes("/admin/oauth/access_token")) {
        return fakeResponse({ json: { access_token: tokensByStore[host], expires_in: 3600 } });
      }
      usedTokens[host] = opts.headers["X-Shopify-Access-Token"];
      return fakeResponse({ json: {} });
    });

    for (const host of ["a.myshopify.com", "b.myshopify.com"]) {
      const res = mockRes();
      await handler(
        mockReq({
          headers: {
            "x-shopify-store": host,
            "x-shopify-client-id": "id",
            "x-shopify-client-secret": "sec",
          },
          query: { endpoint: "shop" },
        }),
        res
      );
    }

    expect(usedTokens["a.myshopify.com"]).toBe("token_A");
    expect(usedTokens["b.myshopify.com"]).toBe("token_B");
  });

  it("[캐시] 만료 전이면 토큰을 재발급하지 않는다", async () => {
    let tokenIssued = 0;
    global.fetch = vi.fn(async (url) => {
      if (url.includes("/admin/oauth/access_token")) {
        tokenIssued++;
        return fakeResponse({ json: { access_token: "cached", expires_in: 86400 } });
      }
      return fakeResponse({ json: {} });
    });

    for (let i = 0; i < 3; i++) {
      const res = mockRes();
      await handler(
        shopReq({
          headers: { "x-shopify-client-id": "id", "x-shopify-client-secret": "sec" },
          query: { endpoint: "shop" },
        }),
        res
      );
    }
    expect(tokenIssued).toBe(1); // 첫 요청만 발급, 이후 캐시 재사용
  });
});
