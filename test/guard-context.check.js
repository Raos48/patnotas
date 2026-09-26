/**
 * Verificação da guarda de vida do contexto da extensão (content.js).
 *
 * Roda em Node: `node test/guard-context.check.js`
 * Não é teste automatizado do produto — é a prova de que a guarda converte
 * o óbito de contexto em erro tipado em vez de TypeError solto, e que ela
 * NÃO mascara bugs reais de código quando o contexto está vivo.
 *
 * Mantém a mesma semântica de isContextAlive/markContextDead/guardContext
 * de content/content.js. Se você mudar lá, mude aqui.
 */
'use strict';

let contextDead = false;
const teardownFns = [];
const toasts = [];

function showToast(m, t) { toasts.push([t, m]); }

function isContextAlive() {
  try {
    const api = (typeof browser !== 'undefined' && browser.runtime) ? browser
              : (typeof chrome !== 'undefined' && chrome.runtime) ? chrome
              : null;
    if (!api || !api.runtime || !api.runtime.id) return false;
    if (!api.storage || !api.storage.local) return false;
    return true;
  } catch (e) {
    return false;
  }
}

function onTeardown(fn) { teardownFns.push(fn); }

function markContextDead(onde) {
  if (contextDead) return;
  contextDead = true;
  while (teardownFns.length) {
    try { teardownFns.pop()(); } catch (e) { /* contexto morto */ }
  }
  showToast('A extensão foi recarregue. Recarregue a página (F5) para continuar usando suas notas.', 'warning');
}

function guardContext(onde, fn) {
  if (contextDead) return Promise.reject(new Error('CONTEXT_DEAD'));
  if (!isContextAlive()) {
    markContextDead(onde);
    return Promise.reject(new Error('CONTEXT_DEAD'));
  }
  return Promise.resolve()
    .then(fn)
    .catch(err => {
      const msg = (err && err.message) || String(err);
      const recusou = msg.indexOf('Extension context') !== -1;
      if (!contextDead && (recusou || !isContextAlive())) {
        markContextDead(onde);
        return Promise.reject(new Error('CONTEXT_DEAD'));
      }
      return Promise.reject(err);
    });
}

const assert = require('assert');

function vivo() {
  global.chrome = {
    runtime: { id: 'abc123' },
    storage: { local: { get: (k, cb) => cb({}) }, sync: { get: (k, cb) => cb({}) } }
  };
}

(async () => {
  // 1. Contexto vivo devolve o valor de fn sem envolver
  vivo();
  const v = await guardContext('t', () => 42);
  assert.strictEqual(v, 42, 'guardContext deve devolver o valor de fn');
  assert.strictEqual(contextDead, false);
  console.log('1. contexto vivo devolve o valor ............ OK');

  // 2. O caminho do teste do usuario: salvar em contexto vivo
  const nota = await guardContext('save', () => Promise.resolve({ id: '48935396', text: 'oi' }));
  assert.strictEqual(nota.text, 'oi');
  console.log('2. salvamento em contexto vivo ............. OK');

  // 3. chrome.storage existe mas .local/.sum some -> erro tipado, nao TypeError
  contextDead = false; toasts.length = 0;
  global.chrome = { runtime: { id: 'abc123' }, storage: { sync: undefined, local: undefined } };
  let erro = null;
  await guardContext('save', () => global.chrome.storage.sync.get(['k'], () => {})).catch(e => erro = e);
  assert.strictEqual(erro.message, 'CONTEXT_DEAD', 'esperava CONTEXT_DEAD, veio: ' + (erro && erro.message));
  console.log('3. storage undefined vira CONTEXT_DEAD ..... OK');

  // 4. Aviso acionavel (com a solucao) e unico
  assert.strictEqual(toasts.length, 1, 'esperava 1 aviso, veio ' + toasts.length);
  assert.ok(toasts[0][1].indexOf('F5') !== -1, 'o aviso precisa dizer como resolver');
  console.log('4. aviso unico e acionavel (com F5) ........ OK');

  // 5. Depois da morte, para de tentar e nao repete aviso
  let erro2 = null;
  await guardContext('save', () => { throw new Error('nunca deve rodar'); }).catch(e => erro2 = e);
  assert.strictEqual(erro2.message, 'CONTEXT_DEAD');
  assert.strictEqual(toasts.length, 1);
  console.log('5. apos a morte, para de tentar ............ OK');

  // 6. "Extension context invalidated" explicito tambem e capturado
  contextDead = false; toasts.length = 0;
  vivo();
  let erro3 = null;
  await guardContext('read', () => Promise.reject(new Error('Extension context invalidated.')))
    .catch(e => erro3 = e);
  assert.strictEqual(erro3.message, 'CONTEXT_DEAD');
  console.log('6. "Extension context invalidated" ........ OK');

  // 7. Teardown roda (para observers/intervalos)
  contextDead = false; toasts.length = 0;
  let parou = false;
  onTeardown(() => { parou = true; });
  global.chrome = { runtime: { id: 'abc123' }, storage: {} };
  await guardContext('scan', () => {}).catch(() => {});
  assert.strictEqual(parou, true, 'teardown deveria ter rodado');
  console.log('7. teardown para observers ................ OK');

  // 8. O erro literal do usuario: TypeError "reading 'get'"
  contextDead = false; toasts.length = 0;
  global.chrome = { runtime: { id: 'abc123' }, storage: { sync: undefined, local: undefined } };
  let erro8 = null;
  await guardContext('save', () => global.chrome.storage.sync.get(['k'], () => {})).catch(e => erro8 = e);
  assert.strictEqual(erro8.message, 'CONTEXT_DEAD', 'TypeError do usuario vira CONTEXT_DEAD');
  console.log('8. TypeError "reading get" capturado ....... OK');

  // 9. Bug real de codigo NAO e mascarado quando o contexto esta vivo
  contextDead = false; toasts.length = 0;
  global.chrome = { runtime: { id: 'abc123' }, storage: { local: { get: (k, cb) => cb({}) }, sync: { get: (k, cb) => cb({}) } } };
  let erro9 = null;
  await guardContext('save', () => { const o = {}; return o.naoExiste.get; }).catch(e => erro9 = e);
  assert.ok(erro9 && erro9.message.indexOf('CONTEXT_DEAD') === -1, 'bug de codigo deve passar adiante');
  console.log('9. bug real nao e mascarado ................ OK');

  console.log('\n9/9 — guarda de contexto comprova o comportamento esperado');
})().catch(e => {
  console.error('\nFALHOU:', e.message);
  process.exit(1);
});
