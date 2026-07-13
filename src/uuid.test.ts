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
