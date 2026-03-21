/**
 * MSW handlers for the Shopify Admin API (2025-01).
 * Matches the response shapes expected by:
 *   - src/routes/shopify/sync-shopify-metrics.ts (ShopifyOrder interface)
 *   - src/routes/shopify/fetch-shopify-products.ts
 */
import { http, HttpResponse } from 'msw';

const SHOPIFY_BASE = 'https://test-store.myshopify.com/admin/api/2025-01';

export const shopifyHandlers = [
  // ── Orders list ──
  http.get(`${SHOPIFY_BASE}/orders.json`, ({ request }) => {
    const url = new URL(request.url);
    const page = url.searchParams.get('page_info');

    if (page === 'page2') {
      // Page 2 — no Link next header
      return HttpResponse.json({
        orders: [
          {
            id: 5000000003,
            created_at: '2026-03-17T10:00:00-03:00',
            total_price: '29990',
            currency: 'CLP',
            financial_status: 'paid',
            name: '#1003',
            email: 'cliente3@test.cl',
            line_items: [
              { title: 'Producto C', quantity: 1, price: '29990' },
            ],
          },
        ],
      });
    }

    // Page 1
    return new HttpResponse(
      JSON.stringify({
        orders: [
          {
            id: 5000000001,
            created_at: '2026-03-18T14:30:00-03:00',
            total_price: '45990',
            currency: 'CLP',
            financial_status: 'paid',
            name: '#1001',
            email: 'cliente1@test.cl',
            line_items: [
              { title: 'Producto A', quantity: 2, price: '15990' },
              { title: 'Producto B', quantity: 1, price: '14010' },
            ],
          },
          {
            id: 5000000002,
            created_at: '2026-03-19T09:15:00-03:00',
            total_price: '0',
            currency: 'CLP',
            financial_status: 'refunded',
            name: '#1002',
            email: 'cliente2@test.cl',
            line_items: [
              { title: 'Producto A', quantity: 1, price: '15990' },
            ],
          },
        ],
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          Link: `<${SHOPIFY_BASE}/orders.json?page_info=page2>; rel="next"`,
        },
      },
    );
  }),

  // ── Products list ──
  http.get(`${SHOPIFY_BASE}/products.json`, () => {
    return HttpResponse.json({
      products: [
        {
          id: 7000000001,
          title: 'Crema Facial Hidratante',
          body_html: '<p>Crema hidratante con vitamina E</p>',
          vendor: 'Jardin de Eva',
          product_type: 'Skincare',
          status: 'active',
          tags: 'hidratante, facial, skincare',
          variants: [
            {
              id: 42000000001,
              title: 'Default',
              price: '15990',
              sku: 'CFH-001',
              inventory_quantity: 50,
            },
          ],
          images: [
            {
              id: 30000000001,
              src: 'https://cdn.shopify.com/s/files/1/test/product1.jpg',
              alt: 'Crema Facial',
            },
          ],
        },
        {
          id: 7000000002,
          title: 'Serum Anti-Edad',
          body_html: '<p>Serum con retinol y acido hialuronico</p>',
          vendor: 'Jardin de Eva',
          product_type: 'Skincare',
          status: 'active',
          tags: 'serum, anti-edad, skincare',
          variants: [
            {
              id: 42000000002,
              title: '30ml',
              price: '24990',
              sku: 'SAE-001',
              inventory_quantity: 30,
            },
            {
              id: 42000000003,
              title: '50ml',
              price: '34990',
              sku: 'SAE-002',
              inventory_quantity: 15,
            },
          ],
          images: [
            {
              id: 30000000002,
              src: 'https://cdn.shopify.com/s/files/1/test/product2.jpg',
              alt: 'Serum Anti-Edad',
            },
          ],
        },
      ],
    });
  }),

  // ── Single product ──
  http.get(`${SHOPIFY_BASE}/products/:productId.json`, ({ params }) => {
    return HttpResponse.json({
      product: {
        id: Number(params.productId),
        title: 'Crema Facial Hidratante',
        body_html: '<p>Crema hidratante con vitamina E</p>',
        vendor: 'Jardin de Eva',
        product_type: 'Skincare',
        status: 'active',
        variants: [
          {
            id: 42000000001,
            title: 'Default',
            price: '15990',
            sku: 'CFH-001',
            inventory_quantity: 50,
          },
        ],
        images: [],
      },
    });
  }),

  // ── Error: Invalid API token ──
  http.get('https://invalid-store.myshopify.com/admin/api/2025-01/orders.json', () => {
    return HttpResponse.json(
      { errors: '[API] Invalid API key or access token (unrecognized login or wrong password)' },
      { status: 401 },
    );
  }),

  // ── Error: Not found ──
  http.get('https://nonexistent.myshopify.com/admin/api/2025-01/orders.json', () => {
    return HttpResponse.json(
      { errors: 'Not Found' },
      { status: 404 },
    );
  }),

  // ── Error: Rate limit (429) ──
  http.get('https://rate-limited.myshopify.com/admin/api/2025-01/orders.json', () => {
    return new HttpResponse(
      JSON.stringify({ errors: 'Exceeded 2 calls per second for api client. Reduce request rates to resume uninterrupted service.' }),
      {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': '2.0',
        },
      },
    );
  }),
];
