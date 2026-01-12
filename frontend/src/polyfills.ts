// Polyfills necessários para bibliotecas no browser
import 'zone.js';

// Configurar ambiente global para bibliotecas que esperam globals
(globalThis as any).global = globalThis;

// Process polyfill para bibliotecas que dependem de Node.js globals
if (typeof (globalThis as any).process === 'undefined') {
  (globalThis as any).process = {
    env: {},
    nextTick: (fn: Function) => Promise.resolve().then(() => fn()),
    browser: true
  };
}