// 공용 테스트 헬퍼 — Vercel 핸들러용 가짜 req/res
import { vi } from "vitest";

// 핸들러는 res.setHeader / res.status(...).json(...) / res.status(...).end() 패턴을 쓴다.
// 호출 결과를 기록하는 가짜 res 를 만든다.
export function mockRes() {
  const res = {
    statusCode: 200,
    headers: {},
    body: undefined,
    ended: false,
    setHeader(k, v) {
      this.headers[k] = v;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    end() {
      this.ended = true;
      return this;
    },
  };
  return res;
}

export function mockReq({ method = "GET", query = {}, headers = {}, body } = {}) {
  return { method, query, headers, body };
}

// fetch 호출에 대한 가짜 Response 생성
export function fakeResponse({ status = 200, json, text } = {}) {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => (typeof json === "function" ? json() : json),
    text: async () => (typeof text === "function" ? text() : text ?? ""),
  };
}

// global.fetch 를 vi.fn 으로 대체하고 복원 함수를 반환
export function stubFetch(impl) {
  const fn = vi.fn(impl);
  global.fetch = fn;
  return fn;
}
