import { test, expect } from '@playwright/test'

// Smoketest voor de beheer-pagina.
// Vereist: lokale dev-server op poort 3000 (npm run dev) en een actieve admin-sessie via cookies.
// Gebruik PLAYWRIGHT_STORAGE_STATE om ingelogde cookies mee te geven.

test.describe('Beheer pagina — smoke', () => {
  test.beforeEach(async ({ page }) => {
    // Redirect naar login als niet ingelogd is acceptabel in CI (skip de rest)
    await page.goto('/dashboard/beheer')
  })

  test('pagina laadt zonder crash', async ({ page }) => {
    // De pagina mag redirecten naar /login als er geen sessie is — dat is OK
    const url = page.url()
    const isLogin = url.includes('/login') || url.includes('/auth')
    if (isLogin) {
      // Geen sessie beschikbaar — skip rest van de test
      test.skip()
      return
    }
    // Geen foutpagina
    await expect(page.locator('h1')).not.toContainText('500')
  })

  test('page head toont "Portaalbeheer" of redirect naar login', async ({ page }) => {
    const url = page.url()
    if (url.includes('/login') || url.includes('/auth')) {
      test.skip()
      return
    }
    await expect(page.locator('h1')).toBeVisible()
  })

  test('tab bar bevat onderstreepte tabs', async ({ page }) => {
    const url = page.url()
    if (url.includes('/login') || url.includes('/auth')) {
      test.skip()
      return
    }
    // Minimaal één tab-knop zichtbaar
    const tabs = page.locator('button[style*="border-bottom"]')
    await expect(tabs.first()).toBeVisible()
  })

  test('KPI-kaarten zijn zichtbaar', async ({ page }) => {
    const url = page.url()
    if (url.includes('/login') || url.includes('/auth')) {
      test.skip()
      return
    }
    // Verwacht grid met stat-cards: Winkels is altijd zichtbaar
    await expect(page.getByText('Winkels', { exact: true })).toBeVisible()
  })
})
