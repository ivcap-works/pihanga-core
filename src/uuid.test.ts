import { describe, it, expect } from "vitest";
import { uuidv7 } from "./uuid";

describe("uuidv7", () => {
  it("returns a non-empty string", () => {
    const id = uuidv7();
    expect(typeof id).toBe("string");
    expect(id.length).toBeGreaterThan(0);
  });

  it("returns unique values", () => {
    const ids = new Set(Array.from({ length: 10 }, () => uuidv7()));
    expect(ids.size).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// Format compliance (RFC 9562 / UUIDv7)
// ---------------------------------------------------------------------------

describe("uuidv7 format", () => {
  it("matches the 8-4-4-4-12 hex pattern", () => {
    // e.g. "01932b5c-a2f1-7abc-8def-0123456789ab"
    expect(uuidv7()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it("has exactly four hyphens (five groups)", () => {
    expect(uuidv7().split("-").length).toBe(5);
  });

  it("version nibble at index 14 is always '7'", () => {
    // "xxxxxxxx-xxxx-7xxx-xxxx-xxxxxxxxxxxx"
    //  0       9    14   19
    for (let i = 0; i < 20; i++) {
      expect(uuidv7()[14]).toBe("7");
    }
  });

  it("variant bits at index 19 are always 8, 9, a, or b (RFC 4122 variant)", () => {
    // byte 8 high two bits must be '10', which means the first hex digit of
    // the 4th group is one of: 8(1000), 9(1001), a(1010), b(1011).
    for (let i = 0; i < 20; i++) {
      expect(uuidv7()[19]).toMatch(/^[89ab]$/);
    }
  });

  it("timestamp bytes encode the current epoch millisecond (within ±5 s)", () => {
    const before = Date.now();
    const uuid = uuidv7();
    const after = Date.now();

    // The first 12 hex chars (before first '-') encode the 48-bit timestamp.
    const hex = uuid.replace(/-/g, "").slice(0, 12);
    const tsFromUuid = parseInt(hex, 16);

    expect(tsFromUuid).toBeGreaterThanOrEqual(before - 5000);
    expect(tsFromUuid).toBeLessThanOrEqual(after + 5000);
  });

  it("IDs generated in separate milliseconds are lexicographically increasing", async () => {
    // UUIDv7 encodes the epoch-millisecond in the top 48 bits, so an ID
    // produced after at least 1 ms must sort after any ID produced before it.
    // We use a microtask-yield + busy-wait to guarantee a clock tick without
    // relying on setTimeout (which can be imprecise in jsdom).
    const id1 = uuidv7();
    const start = Date.now();
    while (Date.now() === start) {
      /* busy-wait for clock to advance */
    }
    const id2 = uuidv7();
    expect(id2 > id1).toBe(true);
  });

  it("contains only lowercase hex digits and hyphens", () => {
    const uuid = uuidv7();
    expect(uuid).toMatch(/^[0-9a-f-]+$/);
  });
});
