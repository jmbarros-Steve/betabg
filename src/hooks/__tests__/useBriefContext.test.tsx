import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";

const mockFrom = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (...args: any[]) => mockFrom(...args),
  },
}));

import { useBriefContext } from "../useBriefContext";

beforeEach(() => {
  vi.clearAllMocks();
});

function setupMockQueries(
  brandResearch: any[] | null = [],
  buyerPersona: any = null,
) {
  mockFrom.mockImplementation((table: string) => {
    if (table === "brand_research") {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockImplementation(() =>
            Promise.resolve({ data: brandResearch, error: null }),
          ),
        }),
      };
    }
    if (table === "buyer_personas") {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockImplementation(() =>
                Promise.resolve({ data: buyerPersona, error: null }),
              ),
            }),
          }),
        }),
      };
    }
    return { select: vi.fn().mockReturnThis() };
  });
}

describe("useBriefContext", () => {
  it("starts as not loaded then resolves", async () => {
    setupMockQueries();

    const { result } = renderHook(() => useBriefContext("client-1"));

    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.chips).toEqual([]);
  });

  it("extracts ventaja from brand_research", async () => {
    setupMockQueries([
      {
        research_data: { ventaja_competitiva: "Mejor precio del mercado" },
        research_type: "analysis",
      },
    ]);

    const { result } = renderHook(() => useBriefContext("client-1"));

    await waitFor(() => expect(result.current.loaded).toBe(true));
    const ventajaChip = result.current.chips.find((c) => c.key === "ventaja");
    expect(ventajaChip).toBeTruthy();
    expect(ventajaChip!.value).toBe("Mejor precio del mercado");
    // ventaja is a default active chip
    expect(result.current.activeChips.has("ventaja")).toBe(true);
  });

  it("extracts tono from brand_research", async () => {
    setupMockQueries([
      {
        research_data: {
          ventaja_competitiva: "Calidad premium",
          tono_comunicacion: "Profesional y cercano",
        },
        research_type: "brand",
      },
    ]);

    const { result } = renderHook(() => useBriefContext("client-1"));

    await waitFor(() => expect(result.current.loaded).toBe(true));
    const tono = result.current.chips.find((c) => c.key === "tono");
    expect(tono).toBeTruthy();
    expect(tono!.value).toBe("Profesional y cercano");
  });

  it("extracts dolor from buyer_persona", async () => {
    setupMockQueries([], {
      persona_data: { dolor_principal: "Falta de tiempo para marketing" },
    });

    const { result } = renderHook(() => useBriefContext("client-1"));

    await waitFor(() => expect(result.current.loaded).toBe(true));
    const dolor = result.current.chips.find((c) => c.key === "dolor");
    expect(dolor).toBeTruthy();
    expect(dolor!.value).toBe("Falta de tiempo para marketing");
    // dolor is a default active chip
    expect(result.current.activeChips.has("dolor")).toBe(true);
  });

  it("deduplicates chips by key", async () => {
    setupMockQueries([
      { research_data: { ventaja_competitiva: "First" }, research_type: "a" },
      { research_data: { ventaja_competitiva: "Second" }, research_type: "b" },
    ]);

    const { result } = renderHook(() => useBriefContext("client-1"));

    await waitFor(() => expect(result.current.loaded).toBe(true));
    const ventajaChips = result.current.chips.filter((c) => c.key === "ventaja");
    expect(ventajaChips).toHaveLength(1);
    expect(ventajaChips[0].value).toBe("First"); // first occurrence wins
  });

  it("toggleChip adds and removes from active set", async () => {
    setupMockQueries([
      { research_data: { tono_comunicacion: "Formal" }, research_type: "a" },
    ]);

    const { result } = renderHook(() => useBriefContext("client-1"));
    await waitFor(() => expect(result.current.loaded).toBe(true));

    // tono is not active by default
    expect(result.current.activeChips.has("tono")).toBe(false);

    // Toggle on
    act(() => result.current.toggleChip("tono"));
    expect(result.current.activeChips.has("tono")).toBe(true);

    // Toggle off
    act(() => result.current.toggleChip("tono"));
    expect(result.current.activeChips.has("tono")).toBe(false);
  });

  it("getActiveChipsText returns formatted text of active chips", async () => {
    setupMockQueries(
      [
        {
          research_data: {
            ventaja_competitiva: "Precio bajo",
            tono_comunicacion: "Amigable",
          },
          research_type: "a",
        },
      ],
      { persona_data: { dolor_principal: "Poco tráfico" } },
    );

    const { result } = renderHook(() => useBriefContext("client-1"));
    await waitFor(() => expect(result.current.loaded).toBe(true));

    // Default active: ventaja + dolor
    const text = result.current.getActiveChipsText();
    expect(text).toContain("Mencionar: Precio bajo");
    expect(text).toContain("Dolor: Poco tráfico");
    expect(text).not.toContain("Amigable"); // tono not active by default
  });

  it("handles errors gracefully", async () => {
    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockImplementation(() =>
          Promise.reject(new Error("DB Error")),
        ),
      }),
    }));

    const { result } = renderHook(() => useBriefContext("client-1"));

    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.chips).toEqual([]);
  });
});
