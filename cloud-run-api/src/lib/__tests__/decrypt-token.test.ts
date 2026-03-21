import { describe, it, expect, vi, beforeEach } from "vitest";
import "../../../src/test/setup.js";
import { decryptPlatformToken } from "../decrypt-token.js";

describe("decryptPlatformToken", () => {
  let mockSupabase: any;

  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockSupabase = {
      rpc: vi.fn(),
    };
  });

  it("returns null when encryptedToken is null", async () => {
    const result = await decryptPlatformToken(mockSupabase, null);
    expect(result).toBeNull();
    expect(mockSupabase.rpc).not.toHaveBeenCalled();
  });

  it("returns null when encryptedToken is undefined", async () => {
    const result = await decryptPlatformToken(mockSupabase, undefined);
    expect(result).toBeNull();
    expect(mockSupabase.rpc).not.toHaveBeenCalled();
  });

  it("returns null when encryptedToken is an empty string", async () => {
    const result = await decryptPlatformToken(mockSupabase, "");
    expect(result).toBeNull();
    expect(mockSupabase.rpc).not.toHaveBeenCalled();
  });

  it("returns null when encryptedToken is only whitespace", async () => {
    const result = await decryptPlatformToken(mockSupabase, "   ");
    expect(result).toBeNull();
    expect(mockSupabase.rpc).not.toHaveBeenCalled();
  });

  it("calls RPC with valid encrypted token and returns decrypted value", async () => {
    const decryptedValue = "decrypted-access-token-12345";
    mockSupabase.rpc.mockResolvedValue({ data: decryptedValue, error: null });

    const result = await decryptPlatformToken(mockSupabase, "encrypted-token-abc");
    expect(result).toBe(decryptedValue);
    expect(mockSupabase.rpc).toHaveBeenCalledWith("decrypt_platform_token", {
      encrypted_token: "encrypted-token-abc",
    });
  });

  it("returns null when RPC returns an error", async () => {
    mockSupabase.rpc.mockResolvedValue({
      data: null,
      error: { message: "function not found", code: "PGRST102" },
    });

    const result = await decryptPlatformToken(mockSupabase, "encrypted-token-xyz");
    expect(result).toBeNull();
  });

  it("returns null when RPC returns null data without error", async () => {
    mockSupabase.rpc.mockResolvedValue({ data: null, error: null });

    const result = await decryptPlatformToken(mockSupabase, "encrypted-token-null");
    expect(result).toBeNull();
  });
});
