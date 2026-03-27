/**
 * Fixture data for platform_connections mock tests.
 * Matches the shape returned by Supabase REST API.
 */

export interface MockConnection {
  id: string;
  platform: 'shopify' | 'meta' | 'google' | 'klaviyo';
  store_name: string | null;
  store_url: string | null;
  account_id: string | null;
  is_active: boolean;
  last_sync_at: string | null;
  client_id: string;
}

const CLIENT_ID = 'test-client-id';

export const allConnected: MockConnection[] = [
  {
    id: 'conn-shopify-1',
    platform: 'shopify',
    store_name: 'Test Store',
    store_url: 'test-store.myshopify.com',
    account_id: null,
    is_active: true,
    last_sync_at: '2026-03-25T12:00:00Z',
    client_id: CLIENT_ID,
  },
  {
    id: 'conn-meta-1',
    platform: 'meta',
    store_name: null,
    store_url: null,
    account_id: 'act_123456',
    is_active: true,
    last_sync_at: '2026-03-25T12:00:00Z',
    client_id: CLIENT_ID,
  },
  {
    id: 'conn-google-1',
    platform: 'google',
    store_name: null,
    store_url: null,
    account_id: '123-456-7890',
    is_active: true,
    last_sync_at: '2026-03-25T12:00:00Z',
    client_id: CLIENT_ID,
  },
  {
    id: 'conn-klaviyo-1',
    platform: 'klaviyo',
    store_name: null,
    store_url: null,
    account_id: 'pk_test123',
    is_active: true,
    last_sync_at: '2026-03-25T12:00:00Z',
    client_id: CLIENT_ID,
  },
];

export const noConnections: MockConnection[] = [];

export const partialConnections: MockConnection[] = [
  {
    id: 'conn-shopify-1',
    platform: 'shopify',
    store_name: 'Test Store',
    store_url: 'test-store.myshopify.com',
    account_id: null,
    is_active: true,
    last_sync_at: '2026-03-25T12:00:00Z',
    client_id: CLIENT_ID,
  },
  {
    id: 'conn-meta-1',
    platform: 'meta',
    store_name: null,
    store_url: null,
    account_id: 'act_123456',
    is_active: false,
    last_sync_at: null,
    client_id: CLIENT_ID,
  },
];

export const syncInProgress: MockConnection[] = [
  {
    id: 'conn-shopify-1',
    platform: 'shopify',
    store_name: 'Test Store',
    store_url: 'test-store.myshopify.com',
    account_id: null,
    is_active: true,
    last_sync_at: '2026-03-25T12:00:00Z',
    client_id: CLIENT_ID,
  },
];
