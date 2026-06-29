import { expect, test, type Page } from '@playwright/test';

async function loginAs(page: Page, account: string) {
  await page.goto('/login');
  await page.getByRole('button', { name: account, exact: true }).click();
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL('/');
}

test.describe('Employee directory', () => {
  test('lists seeded employees with pagination', async ({ page }) => {
    await loginAs(page, 'HR Admin');
    await page.getByRole('navigation').getByRole('link', { name: 'Directory', exact: true }).click();

    await expect(page).toHaveURL(/\/directory/);
    await expect(page.getByRole('heading', { name: 'Employee Directory' })).toBeVisible();
    await expect(page.locator('tbody tr').first()).toBeVisible();
    await expect(page.getByText(/people$/)).toBeVisible();
  });

  test('filters the directory by department', async ({ page }) => {
    await loginAs(page, 'HR Admin');
    await page.goto('/directory');

    await expect(page.locator('tbody tr').first()).toBeVisible();
    const rowsBefore = await page.locator('tbody tr').count();
    expect(rowsBefore).toBeGreaterThan(0);

    await page.getByRole('combobox').first().selectOption('Engineering');
    await expect(page.locator('tbody tr').first()).toBeVisible();
    await expect(page.getByRole('cell', { name: 'Engineering' }).first()).toBeVisible();
  });

  test('opens an employee profile from the directory', async ({ page }) => {
    await loginAs(page, 'HR Admin');
    await page.goto('/directory');

    await expect(page.locator('tbody tr').first()).toBeVisible();
    await page.locator('tbody tr').first().click();
    await expect(page).toHaveURL(/\/directory\/.+/);
    await expect(page.getByRole('tab', { name: 'Personal', exact: true })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Employment', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Direct reports' })).toBeVisible();
  });
});
