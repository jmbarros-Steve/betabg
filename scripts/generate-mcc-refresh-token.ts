#!/usr/bin/env npx tsx
/**
 * One-time script to generate a Google MCC refresh token.
 *
 * Prerequisites:
 *   1. Set GOOGLE_CLIENT_ID and GOOGLE_ADS_CLIENT_SECRET env vars (or edit below)
 *   2. Add http://localhost:3333/callback as an authorized redirect URI
 *      in Google Cloud Console → APIs & Services → Credentials
 *   3. Run: npx tsx scripts/generate-mcc-refresh-token.ts
 *   4. Browser opens → log in with the MCC owner Google account
 *   5. Copy the refresh_token printed in terminal
 *   6. Set it in Cloud Run:
 *      gcloud run services update steve-api --region=us-central1 --project=steveapp-agency \
 *        --update-env-vars="GOOGLE_MCC_REFRESH_TOKEN=<token>,GOOGLE_MCC_CUSTOMER_ID=<10-digit-id>"
 */

import http from 'node:http';
import { URL } from 'node:url';

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const CLIENT_SECRET = process.env.GOOGLE_ADS_CLIENT_SECRET || '';
const REDIRECT_URI = 'http://localhost:3333/callback';
const SCOPES = 'https://www.googleapis.com/auth/adwords';

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('Set GOOGLE_CLIENT_ID and GOOGLE_ADS_CLIENT_SECRET env vars first.');
  process.exit(1);
}

// Build authorization URL
const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
authUrl.searchParams.set('client_id', CLIENT_ID);
authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
authUrl.searchParams.set('scope', SCOPES);
authUrl.searchParams.set('response_type', 'code');
authUrl.searchParams.set('access_type', 'offline');
authUrl.searchParams.set('prompt', 'consent');

console.log('\n=== Google MCC Refresh Token Generator ===\n');
console.log('Opening browser...\n');
console.log(authUrl.toString());
console.log('');

// Open browser
import('child_process').then(({ exec }) => {
  exec(`open "${authUrl.toString()}"`);
});

// Start local server to catch the callback
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://localhost:3333`);

  if (url.pathname !== '/callback') {
    res.writeHead(404);
    res.end('Not found');
    return;
  }

  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error');

  if (error) {
    console.error('OAuth error:', error);
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`<h1>Error: ${error}</h1><p>Check terminal.</p>`);
    server.close();
    process.exit(1);
  }

  if (!code) {
    res.writeHead(400);
    res.end('Missing code');
    return;
  }

  // Exchange code for tokens
  try {
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri: REDIRECT_URI,
        grant_type: 'authorization_code',
      }),
    });

    const tokenData: any = await tokenResponse.json();

    if (tokenData.error) {
      console.error('Token exchange error:', tokenData);
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`<h1>Error</h1><pre>${JSON.stringify(tokenData, null, 2)}</pre>`);
      server.close();
      process.exit(1);
    }

    console.log('\n=== SUCCESS ===\n');
    console.log('Refresh Token:');
    console.log(tokenData.refresh_token);
    console.log('\nAccess Token (temporary):');
    console.log(tokenData.access_token);
    console.log('\nNow set in Cloud Run:');
    console.log(`gcloud run services update steve-api --region=us-central1 --project=steveapp-agency \\`);
    console.log(`  --update-env-vars="GOOGLE_MCC_REFRESH_TOKEN=${tokenData.refresh_token},GOOGLE_MCC_CUSTOMER_ID=YOUR_MCC_ID"`);
    console.log('');

    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`<h1>Done!</h1><p>Refresh token printed in terminal. You can close this window.</p>`);
  } catch (err) {
    console.error('Token exchange failed:', err);
    res.writeHead(500);
    res.end('Token exchange failed');
  }

  server.close();
  setTimeout(() => process.exit(0), 500);
});

server.listen(3333, () => {
  console.log('Waiting for OAuth callback on http://localhost:3333/callback ...\n');
});
