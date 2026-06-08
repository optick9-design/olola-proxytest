import { describe, it, expect, beforeEach, vi } from "vitest";
import handler from "../api/cafe24.js";
import { mockReq, mockRes, fakeResponse, stubFetch } from "./helpers.js";

describe("api/cafe24.js", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("OPTIONS 프리플라이트는 200으로 끝낸다", async () => {
    const res = mockRes();
    await handler(mockReq({ method: "OPTIONS" }), res);
    expect(res.statusCode).toBe(200);
    expect(res.ended).toBe(true);
  });

  it("mallid 또는 path 가 없으면 400", async () => {
    const res = mockRes();
    await handler(mockReq({ query: { mallid: "shop1" } }), res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/mallid/);
  });

  it("나머지 query 파라미터를 업스트림 URL 에 인코딩해 전달한다", async () => {
    const fetchFn = stubFetch(async () =>
      fakeResponse({ status: 200, json: { products: [] } })
    );
    const res = mockRes();
    await handler(
      mockReq({
        query: { mallid: "shop1", path: "products", limit: "20", q: "a b" },
        headers: { authorization: "Bearer xyz" },
      }),
      res
    );
    const calledUrl = fetchFn.mock.calls[0][0];
    expect(calledUrl).toBe(
      "https://shop1.cafe24api.com/api/v2/products?limit=20&q=a+b"
    );
    // Authorization 헤더 패스스루
    expect(fetchFn.mock.calls[0][1].headers.Authorization).toBe("Bearer xyz");
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ products: [] });
  });

  it("추가 파라미터가 없으면 query string 없이 호출한다", async () => {
    const fetchFn = stubFetch(async () => fakeResponse({ json: {} }));
    const res = mockRes();
    await handler(mockReq({ query: { mallid: "shop1", path: "shop" } }), res);
    expect(fetchFn.mock.calls[0][0]).toBe(
      "https://shop1.cafe24api.com/api/v2/shop"
    );
  });

  it("Authorization 헤더가 없으면 빈 문자열로 대체한다", async () => {
    const fetchFn = stubFetch(async () => fakeResponse({ json: {} }));
    const res = mockRes();
    await handler(mockReq({ query: { mallid: "shop1", path: "shop" } }), res);
    expect(fetchFn.mock.calls[0][1].headers.Authorization).toBe("");
  });

  it("업스트림 status code 를 그대로 전달한다", async () => {
    stubFetch(async () =>
      fakeResponse({ status: 422, json: { error: "unprocessable" } })
    );
    const res = mockRes();
    await handler(mockReq({ query: { mallid: "shop1", path: "orders" } }), res);
    expect(res.statusCode).toBe(422);
    expect(res.body).toEqual({ error: "unprocessable" });
  });

  it("fetch/JSON 파싱이 throw 하면 500", async () => {
    stubFetch(async () => {
      throw new Error("boom");
    });
    const res = mockRes();
    await handler(mockReq({ query: { mallid: "shop1", path: "orders" } }), res);
    expect(res.statusCode).toBe(500);
    expect(res.body.error).toBe("boom");
  });

  // 회귀 방지 / 보안: mallid 가 검증되지 않아 호스트가 변조될 수 있음을 문서화한다.
  // (현재는 막지 않으므로 의도적으로 현재 동작을 기록하는 테스트. 검증 추가 시 갱신.)
  it("[SSRF 표면] 검증되지 않은 mallid 가 호스트에 그대로 들어간다 (현재 동작)", async () => {
    const fetchFn = stubFetch(async () => fakeResponse({ json: {} }));
    const res = mockRes();
    await handler(
      mockReq({ query: { mallid: "evil.com/", path: "x" } }),
      res
    );
    expect(fetchFn.mock.calls[0][0]).toBe(
      "https://evil.com/.cafe24api.com/api/v2/x"
    );
  });
});
