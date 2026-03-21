/**
 * MSW server for Node.js test environment.
 * Intercepts outgoing HTTP requests and returns mock responses
 * defined in the handler files.
 */
import { setupServer } from 'msw/node';
import { metaHandlers } from './handlers/meta-api.js';
import { shopifyHandlers } from './handlers/shopify-api.js';
import { klaviyoHandlers } from './handlers/klaviyo-api.js';
import { resendHandlers } from './handlers/resend-api.js';

export const server = setupServer(
  ...metaHandlers,
  ...shopifyHandlers,
  ...klaviyoHandlers,
  ...resendHandlers,
);
