import { describe, expect, it } from "vitest";
import { fmt, seconds } from "./format";

describe("fmt", () => {
  it("prints small numbers without a unit, one decimal only when fractional", () => {
    expect(fmt(0)).toBe("0");
    expect(fmt(7)).toBe("7");
    expect(fmt(7.5)).toBe("7.5");
    expect(fmt(42)).toBe("42");
    expect(fmt(942)).toBe("942");
  });

  it("carries the short-scale ladder from K all the way to Dc", () => {
    expect(fmt(1_240)).toBe("1.24K");
    expect(fmt(3_100_000)).toBe("3.10M");
    expect(fmt(2.5e9)).toBe("2.50B");
    expect(fmt(1e12)).toBe("1.00T");
    expect(fmt(1e15)).toBe("1.00Qa");
    expect(fmt(1e18)).toBe("1.00Qi");
    expect(fmt(1e21)).toBe("1.00Sx");
    expect(fmt(1e24)).toBe("1.00Sp");
    expect(fmt(1e27)).toBe("1.00Oc");
    expect(fmt(1e30)).toBe("1.00No");
    expect(fmt(1e33)).toBe("1.00Dc");
  });

  it("switches to scientific notation once the named units run out, never degrading", () => {
    // The old formatter clamped here and printed "1000.00Dc", then "1000000.00Dc" — a silently
    // growing suffix that stopped conveying scale. Exponential stays readable at any magnitude.
    expect(fmt(1e36)).toBe("1.00e36");
    expect(fmt(1.24e42)).toBe("1.24e42");
    expect(fmt(9.99e120)).toBe("9.99e120");
  });

  it("treats non-finite input as zero rather than throwing", () => {
    expect(fmt(Infinity)).toBe("0");
    expect(fmt(NaN)).toBe("0");
  });
});

describe("seconds", () => {
  it("keeps a decimal under ten seconds and drops it above", () => {
    expect(seconds(1_500)).toBe("1.5s");
    expect(seconds(45_000)).toBe("45s");
  });
});
