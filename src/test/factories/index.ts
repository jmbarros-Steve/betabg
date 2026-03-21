/**
 * Test factories — builders for common domain objects.
 */

let counter = 0;
function nextId() {
  counter++;
  return `test-${counter.toString().padStart(4, "0")}`;
}

// ---- User ----
export function buildUser(overrides: Record<string, any> = {}) {
  const id = overrides.id ?? nextId();
  return {
    id,
    email: overrides.email ?? `user-${id}@test.com`,
    role: overrides.role ?? "authenticated",
    app_metadata: overrides.app_metadata ?? {},
    user_metadata: overrides.user_metadata ?? {},
    aud: "authenticated",
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

// ---- Session ----
export function buildSession(overrides: Record<string, any> = {}) {
  const user = overrides.user ?? buildUser();
  return {
    access_token: overrides.access_token ?? "test-access-token",
    refresh_token: overrides.refresh_token ?? "test-refresh-token",
    expires_in: overrides.expires_in ?? 3600,
    expires_at: overrides.expires_at ?? Math.floor(Date.now() / 1000) + 3600,
    token_type: "bearer",
    user,
    ...overrides,
  };
}

// ---- Client ----
export function buildClient(overrides: Record<string, any> = {}) {
  const id = overrides.id ?? nextId();
  return {
    id,
    name: overrides.name ?? `Client ${id}`,
    company: overrides.company ?? `Company ${id}`,
    shop_domain: overrides.shop_domain ?? null,
    user_id: overrides.user_id ?? nextId(),
    client_user_id: overrides.client_user_id ?? nextId(),
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

// ---- PlatformConnection ----
export function buildPlatformConnection(overrides: Record<string, any> = {}) {
  const id = overrides.id ?? nextId();
  return {
    id,
    client_id: overrides.client_id ?? nextId(),
    platform: overrides.platform ?? "meta",
    is_active: overrides.is_active ?? true,
    access_token_encrypted: overrides.access_token_encrypted ?? null,
    metadata: overrides.metadata ?? {},
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

// ---- CampaignMetric ----
export function buildCampaignMetric(overrides: Record<string, any> = {}) {
  return {
    id: overrides.id ?? nextId(),
    client_id: overrides.client_id ?? nextId(),
    platform: overrides.platform ?? "meta",
    campaign_name: overrides.campaign_name ?? "Test Campaign",
    impressions: overrides.impressions ?? 1000,
    clicks: overrides.clicks ?? 50,
    spend: overrides.spend ?? 25.0,
    conversions: overrides.conversions ?? 5,
    revenue: overrides.revenue ?? 100.0,
    date: overrides.date ?? new Date().toISOString().split("T")[0],
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

// ---- EmailCampaign ----
export function buildEmailCampaign(overrides: Record<string, any> = {}) {
  return {
    id: overrides.id ?? nextId(),
    client_id: overrides.client_id ?? nextId(),
    subject: overrides.subject ?? "Test Email Subject",
    status: overrides.status ?? "draft",
    html_content: overrides.html_content ?? "<p>Hello</p>",
    send_at: overrides.send_at ?? null,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

// ---- BriefChip ----
export function buildBriefChip(overrides: Record<string, any> = {}) {
  return {
    key: overrides.key ?? "ventaja",
    emoji: overrides.emoji ?? "💪",
    label: overrides.label ?? "Mencionar",
    value: overrides.value ?? "Mejor precio del mercado",
    ...overrides,
  };
}
