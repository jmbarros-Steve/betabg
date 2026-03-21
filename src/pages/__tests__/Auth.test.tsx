import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BrowserRouter } from "react-router-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";

/* ---------- hoisted mock variables ---------- */
const { mockSignIn, mockSignUp, mockSignOut, mockNavigate } = vi.hoisted(
  () => ({
    mockSignIn: vi.fn(),
    mockSignUp: vi.fn(),
    mockSignOut: vi.fn(),
    mockNavigate: vi.fn(),
  })
);

/* ---------- module mocks ---------- */

// Supabase client
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      setSession: vi.fn().mockResolvedValue({ data: {}, error: null }),
      exchangeCodeForSession: vi.fn().mockResolvedValue({ data: {}, error: null }),
      resetPasswordForEmail: vi.fn().mockResolvedValue({ error: null }),
      updateUser: vi.fn().mockResolvedValue({ error: null }),
      signInWithOAuth: vi.fn().mockResolvedValue({ error: null }),
    },
  },
}));

// react-router-dom: keep real exports but override useNavigate
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>(
    "react-router-dom"
  );
  return { ...actual, useNavigate: () => mockNavigate };
});

// useAuth hook
vi.mock("@/hooks/useAuth", () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useAuth: () => ({
    user: null,
    session: null,
    loading: false,
    signIn: mockSignIn,
    signUp: mockSignUp,
    signOut: mockSignOut,
  }),
}));

// useUserRole hook
vi.mock("@/hooks/useUserRole", () => ({
  useUserRole: () => ({
    role: null,
    isAdmin: false,
    isClient: false,
    isSuperAdmin: false,
    isShopifyUser: false,
    loading: false,
    clientData: null,
  }),
}));

// Logo asset import
vi.mock("@/assets/logo.jpg", () => ({ default: "logo.jpg" }));

// Sonner toast
vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
}));

/* ---------- import the component under test AFTER mocks ---------- */
import Auth from "../Auth";

/* ---------- helper ---------- */
function renderAuth() {
  return render(
    <BrowserRouter>
      <Auth />
    </BrowserRouter>
  );
}

/* ---------- tests ---------- */
describe("Auth page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders login form with email and password inputs", () => {
    renderAuth();

    // Heading
    expect(
      screen.getByRole("heading", { name: /acceder al panel/i })
    ).toBeInTheDocument();

    // Email input
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();

    // Password input
    expect(screen.getByLabelText(/contrase[ñn]a/i)).toBeInTheDocument();

    // Submit button
    expect(
      screen.getByRole("button", { name: /iniciar sesi[oó]n/i })
    ).toBeInTheDocument();
  });

  it("shows error message on invalid credentials", async () => {
    const user = userEvent.setup();

    mockSignIn.mockResolvedValueOnce({
      error: { message: "Invalid login credentials" },
    });

    renderAuth();

    await user.type(screen.getByLabelText(/email/i), "bad@example.com");
    await user.type(screen.getByLabelText(/contrase[ñn]a/i), "wrongpassword");
    await user.click(
      screen.getByRole("button", { name: /iniciar sesi[oó]n/i })
    );

    // The component displays an inline error div with the translated message
    await waitFor(() => {
      expect(
        screen.getByText(/credenciales incorrectas/i)
      ).toBeInTheDocument();
    });
  });

  it("calls signIn when login form is submitted", async () => {
    const user = userEvent.setup();

    mockSignIn.mockResolvedValueOnce({ error: null });

    renderAuth();

    await user.type(screen.getByLabelText(/email/i), "test@example.com");
    await user.type(screen.getByLabelText(/contrase[ñn]a/i), "secret123");
    await user.click(
      screen.getByRole("button", { name: /iniciar sesi[oó]n/i })
    );

    await waitFor(() => {
      expect(mockSignIn).toHaveBeenCalledWith("test@example.com", "secret123");
    });
  });

  it("has a button to switch between login and signup modes", async () => {
    const user = userEvent.setup();

    renderAuth();

    // In login mode the toggle button reads "No tienes cuenta? Registrate"
    const toggleButton = screen.getByRole("button", {
      name: /no tienes cuenta/i,
    });
    expect(toggleButton).toBeInTheDocument();

    // Click to switch to signup
    await user.click(toggleButton);

    // Now the heading should change to "Crear Cuenta"
    expect(
      screen.getByRole("heading", { name: /crear cuenta/i })
    ).toBeInTheDocument();

    // The toggle text should now offer to go back to login
    expect(
      screen.getByRole("button", { name: /ya tienes cuenta/i })
    ).toBeInTheDocument();

    // Submit button should now read "Crear Cuenta"
    expect(
      screen.getByRole("button", { name: /crear cuenta/i })
    ).toBeInTheDocument();
  });
});
