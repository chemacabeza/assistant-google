const { test, expect } = require('../../helpers/api-mocks');

// The Google Maps JavaScript API is an external script; the ui fixture blocks it so the run is
// deterministic. These tests cover what the page does without it.

test.describe('ui: maps', () => {
  test('requests the Maps script with the Places library and waits for it', async ({ page, api }) => {
    const script = page.waitForRequest((r) => r.url().startsWith('https://maps.googleapis.com/maps/api/js'));
    await page.goto('/maps');
    const url = new URL((await script).url());

    expect(url.searchParams.get('libraries')).toBe('places');
    await expect(page.getByRole('heading', { name: 'Geographic Explorer' })).toBeVisible();
    await expect(page.getByText('Initializing Google Maps Platform...')).toBeVisible();
    // The search box only appears once the script has loaded.
    await expect(page.getByPlaceholder('Search for an address or place...')).toHaveCount(0);
    expect(api.external.some((u) => u.startsWith('https://maps.googleapis.com/'))).toBe(true);
  });

  test('the rest of the app stays usable when Maps cannot load', async ({ page }) => {
    await page.goto('/maps');
    await expect(page.getByText('Initializing Google Maps Platform...')).toBeVisible();
    await page.locator('aside nav').getByRole('link', { name: 'Dashboard' }).click();
    await expect(page.getByText('System Dashboard')).toBeVisible();
  });
});
