import { describe, it, expect, beforeEach, vi } from "vitest";
import handler from "../api/api/token.js";
import { mockReq, mockRes, fakeResponse, stubFetch } from "./helpers.js";

describe("api/api/token.js", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("OPTIONS 프리플라이트는 200으로 끝낸다", async () => {
    const res = mockRes();
    await handler(mockReq({ method: "OPTIONS" }), res);
    expect(res.statusCode).toBe(200);
    expect(res.ended).toBe(true);
    expect(res.headers["Access-Control-Allow-Origin"]).toBe("*");
  });

  it("POST 가 아니면 405", async () => {
    const res = mockRes();
    await handler(mockReq({ method: "GET" }), res);
    expect(res.statusCode).toBe(405);
    expect(res.body).toEqual({ error: "Method not allowed" });
  });

  it("body 가 없으면(undefined) 400 으로 안전하게 처리한다", async () => {
    const res = mockRes();
    await handler(mockReq({ method: "POST", body: undefined }), res);
    expect(res.statusCode).toBe(400);
  });

  it("필수 필드가 빠지면 400", async () => {
    const res = mockRes();
    await handler(
      mockReq({ method: "POST", body: { store: "s.myshopify.com" } }),
      res
    );
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/필요/);
  });

  it("토큰 발급 성공 시 access_token/expires_in/scope 를 반환한다", async () => {
    const fetchFn = stubFetch(async () =>
      fakeResponse({
        json: { access_token: "tok_123", expires_in: 3600, scope: "read_orders" },
      })
    );
    const res = mockRes();
    await handler(
      mockReq({
        method: "POST",
        body: { store: "s.myshopify.com", client_id: "id", client_secret: "sec" },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      access_token: "tok_123",
      expires_in: 3600,
      scope: "read_orders",
    });
    // client_credentials 그랜트로 올바른 URL 을 호출했는지
    expect(fetchFn).toHaveBeenCalledWith(
      "https://s.myshopify.com/admin/oauth/access_token",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("expires_in/scope 누락 시 null 기본값을 채운다", async () => {
    stubFetch(async () => fakeResponse({ json: { access_token: "tok_x" } }));
    const res = mockRes();
    await handler(
      mockReq({
        method: "POST",
        body: { store: "s", client_id: "id", client_secret: "sec" },
      }),
      res
    );
    expect(res.body).toEqual({ access_token: "tok_x", expires_in: null, scope: null });
  });

  it("access_token 이 없으면 400 + errors 전달", async () => {
    stubFetch(async () => fakeResponse({ json: { errors: "invalid_client" } }));
    const res = mockRes();
    await handler(
      mockReq({
        method: "POST",
        body: { store: "s", client_id: "id", client_secret: "bad" },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe("invalid_client");
  });

  it("fetch 가 throw 하면 500", async () => {
    stubFetch(async () => {
      throw new Error("network down");
    });
    const res = mockRes();
    await handler(
      mockReq({
        method: "POST",
        body: { store: "s", client_id: "id", client_secret: "sec" },
      }),
      res
    );
    expect(res.statusCode).toBe(500);
    expect(res.body.error).toBe("network down");
  });
});
