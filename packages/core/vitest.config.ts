import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Тесты только из исходников; скомпилированные копии в dist игнорируем.
    include: ["src/**/*.test.ts"],
    exclude: ["node_modules", "dist"],
  },
});
