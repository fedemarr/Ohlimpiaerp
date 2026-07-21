// Helpers compartidos para tests de lógica pura (Vitest). NO es un
// archivo *.test.js — no lo levanta el runner como suite, solo se
// importa desde los tests reales.

import { DB, setCurrentUser } from '@shared/state.js';

// DB es un singleton mutable (src/shared/state.js) compartido por todo
// el árbol de imports — sin resetearlo entre tests, un test contamina
// el siguiente (mismo patrón de bug que ya vimos en producción con
// datos que "se pegan" entre pantallas).
export function resetDB(claves) {
  for (const k of claves) DB[k] = [];
}

export function setUsuarioDeTest(nombre = 'Test User', perfil = 'RRHH') {
  setCurrentUser({ nombre, perfil });
}
