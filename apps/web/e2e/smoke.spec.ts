import { test, expect } from '@playwright/test';

test.describe('@smoke Auth flow', () => {
  test('landing page renders', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /La clínica veterinaria/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /Empezar 10 días gratis/i }).first()).toBeVisible();
  });

  test('login page renders', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('img', { name: 'SyncVete' })).toBeVisible();
    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(page.getByLabel('Contraseña')).toBeVisible();
  });

  test('register page renders', async ({ page }) => {
    await page.goto('/register');
    await expect(page.getByRole('heading', { name: /Registrá tu clínica/ })).toBeVisible();
    await expect(page.getByLabel('Nombre de la clínica')).toBeVisible();
  });

  test('redirects unauthenticated users to login', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe('@smoke Settings import/export', () => {
  test('configuracion redirects unauthenticated users', async ({ page }) => {
    await page.goto('/configuracion?tab=import-export');
    await expect(page).toHaveURL(/\/login/);
  });
});
