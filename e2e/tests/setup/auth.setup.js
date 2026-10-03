const { test: setup } = require('@playwright/test');
const { loginThroughGoogle } = require('../../helpers/auth');
const { AUTH_FILE } = require('../../helpers/env');

// Signs in once and saves the session so the "authenticated" project can reuse it.
setup('sign in through the mock Google provider', async ({ page }) => {
  await loginThroughGoogle(page);
  await page.context().storageState({ path: AUTH_FILE });
});
