import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.js"],
    coverage: {
      provider: "v8",
      // 실제 소스만 커버리지 대상으로 삼는다 (테스트 헬퍼 제외)
      include: ["api/**/*.js"],
      all: true,
      reporter: ["text", "html"],
    },
  },
});
