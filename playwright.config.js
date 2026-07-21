// Tests E2E — simulan un usuario real navegando la app (a diferencia
// de los tests de Vitest, que corren la lógica sin navegador). Se
// enfocan en los flujos que más bugs reales dieron esta sesión:
// selects que quedaban vacíos, tabs que se salían del modal, campos
// que no matcheaban la selección.
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5173',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
});
