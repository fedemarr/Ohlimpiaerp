// Config separada a propósito (OHLIMPIA_TESTS_STAGING.md, Parte 2): estos
// tests pegan de verdad contra la base de staging (sin mocks, con `pg`),
// así que necesitan environment 'node' (no 'happy-dom') y NO tienen que
// correr con el `npm test` de todos los días — ese tiene que seguir siendo
// instantáneo y offline. Se corren con `npm run test:staging`.
import { defineConfig } from 'vite';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/staging/**/*.test.js'],
    testTimeout: 15000,
  },
});
