const { test, expect, DATA } = require('../../helpers/api-mocks');

const picker = (page) => page.getByRole('button', { name: 'Select Photos from Google' });

test.describe('ui: google photos (picker flow)', () => {
  test('starts with the picker prompt and the account selector', async ({ page, api }) => {
    await page.goto('/photos');
    await expect(page.getByRole('heading', { name: 'Select Photos to View' })).toBeVisible();
    await expect(page.locator('select')).toHaveValue(DATA.ACCOUNTS[0].email);
    expect(api.callsTo('POST', '/api/photos/session')).toHaveLength(0);
  });

  test('picking photos opens the Google picker, waits for the selection, then shows the grid', async ({ page, api }) => {
    let polls = 0;
    api.on('GET', /^\/api\/photos\/session\/([^/]+)$/, ({ params }) => {
      polls += 1;
      return { json: { id: params[0], mediaItemsSet: polls > 1 } };
    });
    await page.goto('/photos');

    const create = api.waitForCall('POST', '/api/photos/session');
    await picker(page).click();
    await create;

    await expect(page.getByRole('heading', { name: 'Waiting for selection...' })).toBeVisible();
    expect(await page.evaluate(() => window.__opened)).toEqual([[`${DATA.PHOTOS_SESSION.pickerUri}/autoclose`, '_blank']]);

    // The page polls the session every 3 s until the user has picked something.
    await expect(page.getByRole('img', { name: 'beach.jpg' })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('img', { name: 'mountain.jpg' })).toHaveAttribute('src', `${DATA.PHOTOS_MEDIA.mediaItems[1].baseUrl}=w500-h500-c`);
    expect(polls).toBeGreaterThanOrEqual(2);

    const media = api.callsTo('GET', '/api/photos/media')[0];
    expect(media.url.searchParams.get('sessionId')).toBe(DATA.PHOTOS_SESSION.id);
    expect(media.url.searchParams.get('pageSize')).toBe('50');
  });

  test('an empty selection offers to try again', async ({ page, api }) => {
    api.on('GET', '/api/photos/media', { json: {} });
    await page.goto('/photos');
    await picker(page).click();
    await expect(page.getByText('No photos returned.')).toBeVisible();
    await page.getByRole('button', { name: 'Try Again' }).click();
    await expect(picker(page)).toBeVisible();
  });

  test('a rejected session shows the authorization error with details', async ({ page, api }) => {
    api.fail('POST', '/api/photos/session', 403, { message: 'Request had insufficient authentication scopes.' });
    await page.goto('/photos');
    await picker(page).click();
    await expect(page.getByText('Authorization Error')).toBeVisible();
    await expect(page.getByText('Error details: Request had insufficient authentication scopes.')).toBeVisible();
  });

  test('a failing media listing also shows the authorization error', async ({ page, api }) => {
    api.fail('GET', '/api/photos/media', 500, { message: 'media boom' });
    await page.goto('/photos');
    await picker(page).click();
    await expect(page.getByText('Error details: media boom')).toBeVisible();
  });

  test('"Log Out & Re-Authenticate" ends the session and restarts the Google login', async ({ page, api }) => {
    api.fail('POST', '/api/photos/session', 403, { message: 'scopes' });
    await page.route('**/oauth2/authorization/google', (route) => route.fulfill({ contentType: 'text/html', body: '<h1>OAuth start</h1>' }));
    await page.goto('/photos');
    await picker(page).click();

    const logout = api.waitForCall('POST', '/api/auth/logout');
    await page.getByRole('button', { name: 'Log Out & Re-Authenticate' }).click();
    await logout;
    await expect(page).toHaveURL(/\/oauth2\/authorization\/google$/);
    await expect(page.getByRole('heading', { name: 'OAuth start' })).toBeVisible();
  });
});
