import http from 'k6/http';
import { check, sleep } from 'k6';

const API_URL = __ENV.API_URL || 'https://steve-api-850416724643.us-central1.run.app';
const AUTH_TOKEN = __ENV.AUTH_TOKEN || '';

export const options = {
  scenarios: {
    // Scenario 1: Steve Chat (AI) — heaviest endpoint
    steve_chat: {
      executor: 'constant-vus',
      vus: 10,
      duration: '2m',
      exec: 'steveChat',
      tags: { scenario: 'steve-chat' },
    },
    // Scenario 2: Sync Metrics — moderate load
    sync_metrics: {
      executor: 'constant-vus',
      vus: 5,
      duration: '2m',
      exec: 'syncMetrics',
      startTime: '10s',
      tags: { scenario: 'sync-metrics' },
    },
    // Scenario 3: Spike test — sudden burst
    spike: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 50 },
        { duration: '30s', target: 50 },
        { duration: '30s', target: 0 },
      ],
      exec: 'healthCheck',
      startTime: '2m30s',
      tags: { scenario: 'spike' },
    },
  },
  thresholds: {
    'http_req_duration{scenario:steve-chat}': ['p(95)<10000'], // AI: p95 < 10s
    'http_req_duration{scenario:sync-metrics}': ['p(95)<5000'], // Sync: p95 < 5s
    'http_req_duration{scenario:spike}': ['p(95)<2000'], // Health: p95 < 2s
    'http_req_failed': ['rate<0.05'], // Error rate < 5%
  },
};

const headers = {
  'Content-Type': 'application/json',
  ...(AUTH_TOKEN ? { Authorization: `Bearer ${AUTH_TOKEN}` } : {}),
};

export function steveChat() {
  const res = http.post(
    `${API_URL}/api/steve-chat`,
    JSON.stringify({
      message: 'Resumen de metricas esta semana',
      shopId: 'test-load',
    }),
    { headers, timeout: '30s' },
  );

  check(res, {
    'steve-chat status is 200 or 401': (r) => r.status === 200 || r.status === 401,
  });

  sleep(2);
}

export function syncMetrics() {
  const res = http.post(
    `${API_URL}/api/sync-meta-metrics`,
    JSON.stringify({ client_id: 'test-load' }),
    { headers, timeout: '15s' },
  );

  check(res, {
    'sync-metrics responds': (r) => r.status < 500,
  });

  sleep(3);
}

export function healthCheck() {
  const res = http.get(`${API_URL}/health`);

  check(res, {
    'health is 200': (r) => r.status === 200,
    'health has status ok': (r) => {
      try {
        return JSON.parse(r.body).status === 'ok';
      } catch {
        return false;
      }
    },
  });

  sleep(0.5);
}
