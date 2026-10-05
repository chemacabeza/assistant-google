const { test, expect, DATA } = require('../../helpers/api-mocks');

const rows = (page) => page.locator('div.grid.cursor-pointer');
const lastQuery = (api) => api.callsTo('GET', '/api/drive/files').at(-1).url.searchParams.get('q');

test.describe('ui: google drive', () => {
  test('lists the root folder of the first linked account', async ({ page, api }) => {
    await page.goto('/drive');

    await expect(page.getByRole('heading', { name: 'My Drive' })).toBeVisible();
    await expect(page.locator('select')).toHaveValue(DATA.ACCOUNTS[0].email);
    await expect(rows(page)).toHaveCount(3);

    const budget = rows(page).filter({ hasText: 'Budget.xlsx' });
    await expect(budget).toContainText('Alice'); // owner
    await expect(budget).toContainText('2 KB');
    await expect(budget).toContainText('1 Feb 2026');
    await expect(rows(page).filter({ hasText: 'Projects' })).toContainText('me');
    await expect(rows(page).filter({ hasText: 'Holiday.png' })).toContainText('3 MB');

    await expect.poll(() => lastQuery(api)).toBe(`'${DATA.ACCOUNTS[0].email}' in owners and 'root' in parents and trashed=false`);
    expect(api.callsTo('GET', '/api/drive/files').at(-1).url.searchParams.get('maxResults')).toBe('50');
  });

  test('opening a folder lists its content and the breadcrumb leads back', async ({ page, api }) => {
    await page.goto('/drive');
    await rows(page).filter({ hasText: 'Projects' }).click();

    await expect(rows(page)).toHaveCount(1);
    await expect(rows(page)).toContainText('Roadmap.docx');
    expect(lastQuery(api)).toContain("'fold1' in parents");

    const crumbs = page.getByRole('button', { name: 'Projects' });
    await expect(crumbs).toBeVisible();
    await page.getByRole('button', { name: 'My Drive' }).click();
    await expect(page.getByRole('heading', { name: 'My Drive' })).toBeVisible();
    await expect(rows(page)).toHaveCount(3);
  });

  test('clicking a file does not navigate away', async ({ page }) => {
    await page.goto('/drive');
    await rows(page).filter({ hasText: 'Budget.xlsx' }).click();
    await expect(page).toHaveURL(/\/drive$/);
    await expect(page.getByRole('heading', { name: 'My Drive' })).toBeVisible();
  });

  test('search narrows the Drive query', async ({ page, api }) => {
    await page.goto('/drive');
    await expect(rows(page)).toHaveCount(3);
    await page.getByPlaceholder('Search in Drive').fill('Budget');
    await expect.poll(() => lastQuery(api)).toBe(
      `name contains 'Budget' and '${DATA.ACCOUNTS[0].email}' in owners and 'root' in parents and trashed=false`,
    );
  });

  // BUG: Drive.jsx interpolates the search term into the Drive query without escaping, so a
  // quote ("O'Brien") produces an invalid query and the Drive API answers 400.
  test.fixme('quotes in the search term are escaped in the Drive query', async ({ page, api }) => {
    await page.goto('/drive');
    await page.getByPlaceholder('Search in Drive').fill("O'Brien");
    await expect.poll(() => lastQuery(api)).toContain("name contains 'O\\'Brien'");
  });

  test('switching the account re-queries Drive for that owner', async ({ page, api }) => {
    await page.goto('/drive');
    await expect(rows(page)).toHaveCount(3);
    await page.locator('select').selectOption('work@example.com');
    await expect.poll(() => lastQuery(api)).toContain("'work@example.com' in owners");
  });

  test('an empty folder shows the empty state', async ({ page, api }) => {
    api.on('GET', '/api/drive/files', { json: { files: [] } });
    await page.goto('/drive');
    await expect(page.getByText('No files or folders found.')).toBeVisible();
  });

  test('a Drive outage ends in the empty state instead of a crash', async ({ page, api }) => {
    api.fail('GET', '/api/drive/files', 500);
    await page.goto('/drive');
    await expect(page.getByText('No files or folders found.')).toBeVisible({ timeout: 20_000 });
  });
});
