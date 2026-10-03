'use strict';
// Minimal stand-in for Google's OpenID Connect provider, used only by the e2e stack.
// It implements just what Spring Security's oauth2Login needs: authorize, token, userinfo and JWKS.
const http = require('node:http');
const crypto = require('node:crypto');

const PORT = Number(process.env.PORT || 9000);
const CLIENT_ID = process.env.CLIENT_ID || 'e2e-client-id';
const CLIENT_SECRET = process.env.CLIENT_SECRET || 'e2e-client-secret';
// Spring validates the id_token issuer against the one built into its "google" registration.
const ISSUER = 'https://accounts.google.com';
const KID = 'e2e-key-1';

const USERS = {
  'e2e@example.com': {
    sub: '100000000000000000001',
    email: 'e2e@example.com',
    email_verified: true,
    name: 'E2E User',
    picture: 'https://example.test/e2e.png',
  },
  'second@example.com': {
    sub: '100000000000000000002',
    email: 'second@example.com',
    email_verified: true,
    name: 'Second User',
    picture: 'https://example.test/second.png',
  },
};

const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: KID, use: 'sig', alg: 'RS256' };

const codes = new Map(); // authorization code -> grant
const tokens = new Map(); // access token -> user
const stats = { authorizations: 0, tokenExchanges: 0, userinfoCalls: 0, lastAccessToken: null, lastRefreshToken: null };

const b64u = (value) => Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)).toString('base64url');
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function signJwt(claims) {
  const input = `${b64u({ alg: 'RS256', typ: 'JWT', kid: KID })}.${b64u(claims)}`;
  const signature = crypto.sign('RSA-SHA256', Buffer.from(input), privateKey).toString('base64url');
  return `${input}.${signature}`;
}

function send(res, status, body, headers = {}) {
  const isJson = typeof body === 'object' && body !== null;
  res.writeHead(status, {
    'Content-Type': isJson ? 'application/json' : 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers,
  });
  res.end(isJson ? JSON.stringify(body) : body);
}

function redirect(res, location) {
  res.writeHead(302, { Location: location, 'Cache-Control': 'no-store' });
  res.end();
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (chunk) => (data += chunk));
    req.on('end', () => resolve(data));
  });
}

function clientCredentials(req, form) {
  const header = req.headers.authorization || '';
  if (header.startsWith('Basic ')) {
    const [id, secret] = Buffer.from(header.slice(6), 'base64').toString().split(':');
    return { id: decodeURIComponent(id), secret: decodeURIComponent(secret || '') };
  }
  return { id: form.get('client_id'), secret: form.get('client_secret') };
}

function authorizeParams(url) {
  const p = url.searchParams;
  return {
    clientId: p.get('client_id'),
    redirectUri: p.get('redirect_uri'),
    state: p.get('state') || '',
    nonce: p.get('nonce') || '',
    scope: p.get('scope') || 'openid',
    responseType: p.get('response_type'),
  };
}

function callbackUrl(redirectUri, params) {
  const target = new URL(redirectUri);
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') target.searchParams.set(k, v);
  return target.toString();
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === '/health') return send(res, 200, { status: 'ok' });
  if (url.pathname === '/jwks') return send(res, 200, { keys: [jwk] });
  if (url.pathname === '/__e2e/stats') return send(res, 200, stats);

  if (url.pathname === '/o/oauth2/v2/auth') {
    const a = authorizeParams(url);
    if (a.clientId !== CLIENT_ID || !a.redirectUri || a.responseType !== 'code') {
      return send(res, 400, '<h1>Error 400: invalid_request</h1>');
    }
    const carry = (extra) => {
      const q = new URLSearchParams({ client_id: a.clientId, redirect_uri: a.redirectUri, state: a.state, nonce: a.nonce, scope: a.scope, ...extra });
      return esc(q.toString());
    };
    const accounts = Object.values(USERS)
      .map((u) => `<li><a href="/o/oauth2/v2/auth/choose?${carry({ email: u.email })}">${esc(u.name)} (${esc(u.email)})</a></li>`)
      .join('');
    return send(
      res,
      200,
      `<!doctype html><title>Mock Google sign-in</title><h1>Choose an account</h1><ul>${accounts}</ul>` +
        `<p><a href="/o/oauth2/v2/auth/deny?${carry({})}">Cancel</a></p>`,
    );
  }

  if (url.pathname === '/o/oauth2/v2/auth/choose') {
    const a = authorizeParams(url);
    const user = USERS[url.searchParams.get('email')];
    if (a.clientId !== CLIENT_ID || !a.redirectUri || !user) return send(res, 400, '<h1>Error 400</h1>');
    const code = crypto.randomBytes(16).toString('hex');
    codes.set(code, { user, nonce: a.nonce, redirectUri: a.redirectUri, scope: a.scope, used: false });
    stats.authorizations += 1;
    return redirect(res, callbackUrl(a.redirectUri, { code, state: a.state }));
  }

  if (url.pathname === '/o/oauth2/v2/auth/deny') {
    const a = authorizeParams(url);
    if (!a.redirectUri) return send(res, 400, '<h1>Error 400</h1>');
    return redirect(res, callbackUrl(a.redirectUri, { error: 'access_denied', state: a.state }));
  }

  if (url.pathname === '/token' && req.method === 'POST') {
    const form = new URLSearchParams(await readBody(req));
    const { id, secret } = clientCredentials(req, form);
    if (id !== CLIENT_ID || secret !== CLIENT_SECRET) return send(res, 401, { error: 'invalid_client' });

    const grant = codes.get(form.get('code'));
    if (form.get('grant_type') !== 'authorization_code' || !grant || grant.used || grant.redirectUri !== form.get('redirect_uri')) {
      return send(res, 400, { error: 'invalid_grant' });
    }
    grant.used = true;

    const now = Math.floor(Date.now() / 1000);
    const accessToken = `ya29.e2e-${crypto.randomBytes(16).toString('hex')}`;
    const refreshToken = `1//e2e-${crypto.randomBytes(16).toString('hex')}`;
    tokens.set(accessToken, grant.user);
    stats.tokenExchanges += 1;
    stats.lastAccessToken = accessToken;
    stats.lastRefreshToken = refreshToken;

    const idToken = signJwt({
      iss: ISSUER,
      aud: CLIENT_ID,
      azp: CLIENT_ID,
      sub: grant.user.sub,
      email: grant.user.email,
      email_verified: true,
      name: grant.user.name,
      picture: grant.user.picture,
      nonce: grant.nonce,
      iat: now,
      exp: now + 3600,
    });
    return send(res, 200, {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: 3599,
      refresh_token: refreshToken,
      scope: grant.scope,
      id_token: idToken,
    });
  }

  if (url.pathname === '/userinfo') {
    const user = tokens.get((req.headers.authorization || '').replace(/^Bearer /, ''));
    if (!user) return send(res, 401, { error: 'invalid_token' });
    stats.userinfoCalls += 1;
    return send(res, 200, user);
  }

  return send(res, 404, { error: 'not_found' });
});

server.listen(PORT, '0.0.0.0', () => console.log(`mock google listening on ${PORT}`));
