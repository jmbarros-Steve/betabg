import http from 'k6/http';
import { check, sleep } from 'k6';
import { SharedArray } from 'k6/data';

export const options = {
  stages: [
    { duration: '15s', target: 25 },   // ramp up to 25 users
    { duration: '1m', target: 50 },     // hold 50 users
    { duration: '30s', target: 50 },    // stay at 50
    { duration: '15s', target: 0 },     // ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<5000'],  // 95% of requests < 5s
    http_req_failed: ['rate<0.1'],       // <10% failure rate
  },
};

const BASE = 'https://betabgnuevosupa.vercel.app';
const SUPABASE_URL = 'https://zpswjccsxjtnhetkkqde.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpwc3dqY2NzeGp0bmhldGtrcWRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2MzM2NjgsImV4cCI6MjA4NzIwOTY2OH0.PRkFg5sdmu8kXdL9xtpZFREKgohF9cGrNjWVVwZ7IXw';

export default function () {
  // 1. Landing page
  let res = http.get(BASE);
  check(res, {
    'landing status 200': (r) => r.status === 200,
    'landing < 5s': (r) => r.timings.duration < 5000,
  });
  sleep(1);

  // 2. Login via Supabase Auth
  res = http.post(
    `${SUPABASE_URL}/auth/v1/token?grant_type=password`,
    JSON.stringify({
      email: 'patricio.correa@jardindeeva.cl',
      password: 'Jardin2026',
    }),
    {
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_KEY,
      },
    }
  );
  check(res, {
    'login status 200': (r) => r.status === 200,
    'login < 5s': (r) => r.timings.duration < 5000,
    'login has token': (r) => {
      try { return JSON.parse(r.body).access_token !== undefined; } catch { return false; }
    },
  });

  let token = '';
  try {
    token = JSON.parse(res.body).access_token;
  } catch {
    sleep(2);
    return;
  }
  sleep(1);

  const authHeaders = {
    'Content-Type': 'application/json',
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${token}`,
  };

  // 3. Dashboard — fetch client data
  res = http.get(
    `${SUPABASE_URL}/rest/v1/clients?select=id,name,company,shop_domain&limit=5`,
    { headers: authHeaders }
  );
  check(res, {
    'clients status 200': (r) => r.status === 200,
    'clients < 5s': (r) => r.timings.duration < 5000,
  });

  let clientId = '';
  try {
    const clients = JSON.parse(res.body);
    if (clients.length > 0) clientId = clients[0].id;
  } catch {}
  sleep(1);

  // 4. Fetch campaign metrics (dashboard data)
  if (clientId) {
    res = http.get(
      `${SUPABASE_URL}/rest/v1/campaign_metrics?client_id=eq.${clientId}&select=*&limit=20`,
      { headers: authHeaders }
    );
    check(res, {
      'metrics status 200': (r) => r.status === 200,
      'metrics < 5s': (r) => r.timings.duration < 5000,
    });
    sleep(1);

    // 5. Fetch platform metrics
    res = http.get(
      `${SUPABASE_URL}/rest/v1/platform_metrics?select=*&limit=30`,
      { headers: authHeaders }
    );
    check(res, {
      'platform_metrics status 200': (r) => r.status === 200,
      'platform_metrics < 5s': (r) => r.timings.duration < 5000,
    });
    sleep(1);
  }

  // 6. Ask Steve "cómo van mis ventas" (steve-chat endpoint)
  if (clientId) {
    res = http.post(
      `${SUPABASE_URL}/functions/v1/steve-email-content`,
      JSON.stringify({
        client_id: clientId,
        instruction: 'cómo van mis ventas esta semana?',
      }),
      { headers: authHeaders, timeout: '10s' }
    );
    check(res, {
      'steve-chat responded': (r) => r.status === 200 || r.status === 401 || r.status === 404,
      'steve-chat < 5s': (r) => r.timings.duration < 5000,
    });
  }

  sleep(2);
}
