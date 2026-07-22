import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  root: '.',
  publicDir: 'public',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        postularme: resolve(__dirname, 'postularme.html'),
        evaluacion: resolve(__dirname, 'evaluacion.html'),
      },
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@modules': resolve(__dirname, 'src/modules'),
      '@shared': resolve(__dirname, 'src/shared'),
      '@styles': resolve(__dirname, 'src/styles'),
    },
  },
  test: {
    // happy-dom (no 'node'): varios módulos hacen window.X = X a nivel
    // superior de su index.js (patrón del proyecto para exponer
    // funciones a los onclick inline) — sin un window global, con solo
    // importar ese archivo alcanza para que el test explote antes de
    // llegar a la lógica que se quiere probar.
    environment: 'happy-dom',
    include: ['src/**/*.test.js'],
  },
});
