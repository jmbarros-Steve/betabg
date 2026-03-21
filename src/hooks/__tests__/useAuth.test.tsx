import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import React, { ReactNode } from "react";

// Use vi.hoisted so mocks are available before vi.mock factory runs
const {
  mockOnAuthStateChange,
  mockGetSession,
  mockSignInWithPassword,
  mockSignOut,
  mockFunctionsInvoke,
} = vi.hoisted(() => ({
  mockOnAuthStateChange: vi.fn(),
  mockGetSession: vi.fn(),
  mockSignInWithPassword: vi.fn(),
  mockSignOut: vi.fn(),
  mockFunctionsInvoke: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      onAuthStateChange: mockOnAuthStateChange,
      getSession: mockGetSession,
      signInWithPassword: mockSignInWithPassword,
      signOut: mockSignOut,
    },
    functions: {
      invoke: mockFunctionsInvoke,
    },
  },
}));

import { AuthProvider, useAuth } from "../useAuth";

function wrapper({ children }: { children: ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockOnAuthStateChange.mockReturnValue({
    data: { subscription: { unsubscribe: vi.fn() } },
  });
  mockGetSession.mockResolvedValue({
    data: { session: null },
  });
});

describe("useAuth", () => {
  it("throws when used outside AuthProvider", () => {
    expect(() => {
      renderHook(() => useAuth());
    }).toThrow("useAuth must be used within an AuthProvider");
  });

  it("starts in loading state and resolves to no user", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.user).toBeNull();
    expect(result.current.session).toBeNull();
  });

  it("loads existing session on mount", async () => {
    const mockUser = { id: "user-1", email: "test@test.com" };
    const mockSession = { user: mockUser, access_token: "token-123" };
    mockGetSession.mockResolvedValue({ data: { session: mockSession } });

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.user).toEqual(mockUser);
    expect(result.current.session).toEqual(mockSession);
  });

  it("signIn calls signInWithPassword", async () => {
    mockSignInWithPassword.mockResolvedValue({ error: null });

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    let signInResult: any;
    await act(async () => {
      signInResult = await result.current.signIn("test@test.com", "pass123");
    });

    expect(mockSignInWithPassword).toHaveBeenCalledWith({
      email: "test@test.com",
      password: "pass123",
    });
    expect(signInResult.error).toBeNull();
  });

  it("signIn handles Email not confirmed by auto-confirming", async () => {
    mockSignInWithPassword
      .mockResolvedValueOnce({
        error: { message: "Email not confirmed" },
      })
      .mockResolvedValueOnce({ error: null });
    mockFunctionsInvoke.mockResolvedValue({ error: null });

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    let signInResult: any;
    await act(async () => {
      signInResult = await result.current.signIn("test@test.com", "pass123");
    });

    expect(mockFunctionsInvoke).toHaveBeenCalledWith("self-signup", {
      body: { email: "test@test.com", password: "pass123", action: "confirm" },
    });
    expect(signInResult.error).toBeNull();
  });

  it("signIn returns error on failure", async () => {
    const authError = { message: "Invalid credentials" };
    mockSignInWithPassword.mockResolvedValue({ error: authError });

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    let signInResult: any;
    await act(async () => {
      signInResult = await result.current.signIn("test@test.com", "wrong");
    });

    expect(signInResult.error).toEqual(authError);
  });

  it("signOut calls supabase signOut", async () => {
    mockSignOut.mockResolvedValue({ error: null });

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.signOut();
    });

    expect(mockSignOut).toHaveBeenCalledTimes(1);
  });

  it("signUp invokes self-signup edge function then signs in", async () => {
    mockFunctionsInvoke.mockResolvedValue({ data: { user_id: "new" }, error: null });
    mockSignInWithPassword.mockResolvedValue({ error: null });

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    let signUpResult: any;
    await act(async () => {
      signUpResult = await result.current.signUp("new@test.com", "Str0ng!Pass");
    });

    expect(mockFunctionsInvoke).toHaveBeenCalledWith("self-signup", {
      body: { email: "new@test.com", password: "Str0ng!Pass" },
    });
    expect(signUpResult.error).toBeNull();
  });

  it("signUp returns error when edge function fails", async () => {
    mockFunctionsInvoke.mockResolvedValue({
      data: { error: "User already exists" },
      error: null,
    });

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    let signUpResult: any;
    await act(async () => {
      signUpResult = await result.current.signUp("exists@test.com", "pass");
    });

    expect(signUpResult.error).toBeInstanceOf(Error);
    expect(signUpResult.error.message).toBe("User already exists");
  });

  it("updates user when auth state changes", async () => {
    let authCallback: any;
    mockOnAuthStateChange.mockImplementation((cb: any) => {
      authCallback = cb;
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    });

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    const newUser = { id: "user-2", email: "new@test.com" };
    const newSession = { user: newUser, access_token: "new-token" };

    act(() => {
      authCallback("SIGNED_IN", newSession);
    });

    expect(result.current.user).toEqual(newUser);
    expect(result.current.session).toEqual(newSession);
  });
});
