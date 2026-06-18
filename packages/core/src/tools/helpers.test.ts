import { describe, it, expect } from "vitest";
import { makeToolContext } from "./helpers.js";
import type { KaitenClient } from "../kaiten-client.js";

describe("ToolContext.getClient", () => {
  it("returns the client produced by the resolver, passing extra through", () => {
    const fake = { marker: "from-extra" } as unknown as KaitenClient;
    const ctx = makeToolContext({
      server: {} as never,
      logger: { error() {}, warn() {}, info() {}, debug() {} } as never,
      config: { requestTimeoutMs: 1, maxConcurrentRequests: 1, logLevel: "error" } as never,
      resolveClient: (extra) => {
        expect((extra as { tag?: string })?.tag).toBe("abc");
        return fake;
      },
    });
    expect(ctx.getClient({ tag: "abc" } as never)).toBe(fake);
  });
});
