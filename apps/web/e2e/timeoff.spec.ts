import { expect, test, type Page } from '@playwright/test';

async function loginAs(page: Page, account: string) {
  await page.goto('/login');
  await page.getByRole('button', { name: account, exact: true }).click();
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL('/');
}

test.describe('Time off', () => {
  test('shows balances and lets an employee submit a request', async ({ page }) => {
    await loginAs(page, 'Employee');
    await page.getByRole('navigation').getByRole('link', { name: 'Time Off', exact: true }).click();

    await expect(page).toHaveURL(/\/time-off/);
    await expect(page.getByText('days available').first()).toBeVisible();

    await page.getByRole('button', { name: 'New request' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    const start = new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10);
    const end = new Date(Date.now() + 16 * 86_400_000).toISOString().slice(0, 10);
    await page.locator('input[type="date"]').first().fill(start);
    await page.locator('input[type="date"]').nth(1).fill(end);
    await page.getByRole('button', { name: 'Submit request' }).click();

    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(page.getByText('Pending').first()).toBeVisible();
  });

  test('managers see an approvals queue', async ({ page }) => {
    await loginAs(page, 'Manager');
    await page.goto('/time-off');
    await expect(page.getByRole('button', { name: 'Approvals' })).toBeVisible();
  });
});
