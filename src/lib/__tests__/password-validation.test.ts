import { describe, it, expect } from "vitest";
import { passwordSchema, getPasswordStrength } from "../password-validation";

describe("passwordSchema", () => {
  it("accepts a valid strong password", () => {
    const result = passwordSchema.safeParse("Str0ng!Pass");
    expect(result.success).toBe(true);
  });

  it("rejects passwords shorter than 8 characters", () => {
    const result = passwordSchema.safeParse("Ab1!");
    expect(result.success).toBe(false);
  });

  it("rejects passwords without lowercase", () => {
    const result = passwordSchema.safeParse("STRONG1!");
    expect(result.success).toBe(false);
  });

  it("rejects passwords without uppercase", () => {
    const result = passwordSchema.safeParse("strong1!");
    expect(result.success).toBe(false);
  });

  it("rejects passwords without numbers", () => {
    const result = passwordSchema.safeParse("Strong!Pass");
    expect(result.success).toBe(false);
  });

  it("rejects passwords without special characters", () => {
    const result = passwordSchema.safeParse("Strong1Pass");
    expect(result.success).toBe(false);
  });

  it("rejects common passwords", () => {
    const result = passwordSchema.safeParse("password");
    expect(result.success).toBe(false);
  });

  it("rejects passwords with 3+ repeated characters", () => {
    const result = passwordSchema.safeParse("Aaaa1!bcde");
    expect(result.success).toBe(false);
  });

  it("rejects passwords that are too long", () => {
    const long = "A".repeat(50) + "a".repeat(50) + "1!";
    const result = passwordSchema.safeParse(long);
    expect(result.success).toBe(false);
  });
});

describe("getPasswordStrength", () => {
  it("returns score 0 for very short password", () => {
    const result = getPasswordStrength("ab");
    expect(result.score).toBe(0);
    expect(result.label).toBe("Muy débil");
  });

  it("returns score 1 for 8+ chars only", () => {
    const result = getPasswordStrength("abcdefgh");
    expect(result.score).toBe(1);
    expect(result.label).toBe("Débil");
  });

  it("returns higher score for mixed case + numbers + special", () => {
    const result = getPasswordStrength("MyP@ssw0rd12");
    expect(result.score).toBe(4);
    expect(result.label).toBe("Fuerte");
    expect(result.color).toBe("bg-green-500");
  });

  it("caps score at 4", () => {
    const result = getPasswordStrength("VeryStr0ng!P@ss");
    expect(result.score).toBeLessThanOrEqual(4);
  });
});
