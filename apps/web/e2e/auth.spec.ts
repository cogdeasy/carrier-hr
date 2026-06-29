import { expect, test } from '@playwright/test';

test.describe('Authentication', () => {
  test('shows the branded login page', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
    await expect(page.getByText('The people platform for Carrier Global')).toBeVisible();
  });

  test('logs in via demo account and lands on the dashboard', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: 'HR Admin' }).click();
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page).toHaveURL('/');
    await expect(page.getByRole('heading', { name: /Welcome back,/ })).toBeVisible();
    await expect(page.getByText('Time off balance')).toBeVisible();
  });

  test('rejects invalid credentials', async ({ page }) => {
    await page.goto('/login');
    await page.getByPlaceholder('you@carrier.com').fill('nobody@carrier.com');
    await page.getByPlaceholder('••••••••').fill('wrong-password');
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page.getByText(/invalid|incorrect|credential/i)).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test('redirects unauthenticated users to login', async ({ page }) => {
    await page.goto('/directory');
    await expect(page).toHaveURL(/\/login/);
  });
});
