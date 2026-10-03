const { expect } = require('@playwright/test');
const { urls, USERS } = require('./env');

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Endpoints that call real Google APIs; the e2e stack must never reach them with a mock token. */
const GOOGLE_BACKED_API = /\/api\/(calendar|gmail|drive|photos|contacts|assistant)(\/|\?|$)/;

async function stubGoogleBackedApis(page) {
  await page.route(GOOGLE_BACKED_API, (route) => route.fulfill({ json: [] }));
}

/**
 * Signs in through the real UI: login page -> backend -> mock Google account chooser -> callback -> dashboard.
 * Everything after the click is the genuine OAuth2 authorization-code flow.
 */
async function loginThroughGoogle(page, user = USERS.primary) {
  await stubGoogleBackedApis(page);
  await page.goto('/login');
  await page.getByRole('button', { name: /continue with google/i }).click();

  await expect(page).toHaveURL(new RegExp(`^${escapeRegExp(urls.googleMock)}/o/oauth2/v2/auth`));
  await page.getByRole('link', { name: new RegExp(escapeRegExp(user.email)) }).click();

  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole('banner').getByText(user.name, { exact: true })).toBeVisible();
}

/** Counters kept by the mock provider, to prove the backend really talked to it. */
async function mockStats(request) {
  const res = await request.get(`${urls.googleMock}/__e2e/stats`);
  return res.json();
}

/** CSRF header for a request context that already holds the XSRF-TOKEN cookie. */
async function csrfHeaders(request) {
  const { cookies } = await request.storageState();
  const xsrf = cookies.find((c) => c.name === 'XSRF-TOKEN');
  return xsrf ? { 'X-XSRF-TOKEN': xsrf.value } : {};
}

module.exports = { loginThroughGoogle, stubGoogleBackedApis, mockStats, csrfHeaders, escapeRegExp };
