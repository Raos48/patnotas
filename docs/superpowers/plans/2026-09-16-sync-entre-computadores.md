# Sincronização de Notas Entre Computadores — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer as notas e textos padrão do NotasPat sincronizarem automaticamente entre computadores, migrando de `chrome.storage.local` para `chrome.storage.sync`, sem que nenhum usuário existente perca dados ou precise recadastrar nada.

**Architecture:** Um novo módulo `lib/quota.js` centraliza os limites do `storage.sync` e checa a quota antes de cada gravação. `lib/storage.js` passa a gravar em `sync`, com fallback automático para `local` quando um item não cabe (nunca perde o dado do usuário). Leituras consultam os dois namespaces e resolvem conflitos pelo `updatedAt` mais recente. Uma migração única move os dados existentes de `local` para `sync`, priorizando as notas mais recentes, sempre na ordem grava-confirma-remove.

**Tech Stack:** JavaScript vanilla (sem build, sem npm, sem transpilação). APIs `chrome.storage.sync` / `browser.storage.sync` (WebExtensions). Manifest V3 (Chrome) e V2/V3 (Firefox).

**Spec:** `docs/superpowers/specs/2026-09-16-sync-entre-computadores-design.md`

## Global Constraints

- **Sem build system.** JavaScript vanilla puro. Nenhuma dependência npm, nenhum transpilador. Arquivos são carregados diretamente pelo manifest.
- **Sem testes automatizados no projeto.** O projeto não tem test runner (conforme CLAUDE.md: "No automated tests: QA is manual"). Este plano usa um **harness de teste manual via console do navegador** (Task 1) para dar ciclo de verificação real a cada task. Não instalar Jest/Vitest/qualquer runner.
- **Prevenção de XSS:** sempre `element.textContent = text`, nunca `innerHTML` com dados do usuário.
- **Console logging:** todo `console.log` usa o prefixo `[NotasPat]`.
- **Sem requisições externas.** Todos os dados permanecem no storage do navegador.
- **Duas builds:** `inss-notas-extensao/` (Chrome, namespace `chrome.*`) e `inss-notas-extensao-firefox/` (Firefox, namespace `browser.*`). O Firefox **não** é cópia literal — ver Task 9.
- **Limites do `storage.sync` (valores exatos):** `QUOTA_BYTES` = 102400, `QUOTA_BYTES_PER_ITEM` = 8192, `MAX_ITEMS` = 512, `MAX_WRITE_OPERATIONS_PER_MINUTE` = 120, `MAX_WRITE_OPERATIONS_PER_HOUR` = 1800.
- **Tamanho de item** = bytes UTF-8 da chave + bytes UTF-8 de `JSON.stringify(valor)`.
- **Ordem inviolável na migração:** grava em `sync` → confirma sucesso → só então remove de `local`. Nunca inverter.
- **Versão alvo:** 1.4.0 em ambos os manifests.

---

## File Structure

| Arquivo | Responsabilidade | Ação |
|---|---|---|
| `lib/quota.js` | Constantes de quota, cálculo de tamanho, checagem pré-gravação, erro tipado | **Criar** |
| `lib/storage.js` | CRUD de notas/textos padrão; passa a usar `sync` + fallback + merge | Modificar |
| `background/background.js` | Migração `local`→`sync`, listener `onChanged`, alarmes, badge | Modificar |
| `content/content.js` | Tratar `QUOTA_EXCEEDED` ao salvar nota inline | Modificar |
| `popup/popup.js` | Tratar `QUOTA_EXCEEDED` ao salvar/editar nota e textos padrão | Modificar |
| `stdtexts/stdtexts.js` | Tratar `QUOTA_EXCEEDED` ao salvar texto padrão | Modificar |
| `manifest.json` | Registrar `lib/quota.js`, bump de versão | Modificar |
| `inss-notas-extensao-firefox/**` | Espelhar tudo no namespace `browser.*` | Modificar |

---

## Task 1: Harness de teste manual

O projeto não tem test runner. Sem um jeito de verificar, as tasks seguintes viram "escrevi e espero que funcione". Esta task cria o mínimo para ter ciclo de feedback real.

**Files:**
- Create: `test/manual-harness.js`

**Interfaces:**
- Produces: `NotasPatTest.assert(nome, condicao)`, `NotasPatTest.assertEquals(nome, atual, esperado)`, `NotasPatTest.reset()`, `NotasPatTest.report()`, `NotasPatTest.fillSyncTo(bytes)`

- [ ] **Step 1: Criar o harness**

Criar `test/manual-harness.js`. Este arquivo NÃO entra no ZIP de release — é ferramenta de desenvolvimento, colada no console do service worker ou da página.

```javascript
/**
 * Harness de teste manual - NotasPat
 * NAO faz parte do build. Colar no console do service worker
 * (chrome://extensions > NotasPat > "service worker") ou na pagina do portal.
 */
const NotasPatTest = {
  results: [],

  assert(nome, condicao) {
    this.results.push({ nome, ok: !!condicao });
    console.log(`[NotasPat][TESTE] ${condicao ? 'PASSOU' : 'FALHOU'}: ${nome}`);
    return !!condicao;
  },

  assertEquals(nome, atual, esperado) {
    const ok = JSON.stringify(atual) === JSON.stringify(esperado);
    if (!ok) console.log(`[NotasPat][TESTE]   esperado: ${JSON.stringify(esperado)} | atual: ${JSON.stringify(atual)}`);
    return this.assert(nome, ok);
  },

  async reset() {
    await new Promise(r => chrome.storage.sync.clear(r));
    await new Promise(r => chrome.storage.local.clear(r));
    this.results = [];
    console.log('[NotasPat][TESTE] Storage limpo (sync + local)');
  },

  /** Enche o sync ate aproximadamente `bytes` para testar estouro de quota */
  async fillSyncTo(bytes) {
    const filler = 'x'.repeat(7000);
    let escrito = 0, i = 0;
    while (escrito < bytes) {
      const chave = `__fill_${i++}`;
      await new Promise(r => chrome.storage.sync.set({ [chave]: filler }, r));
      escrito += filler.length + chave.length;
    }
    const uso = await new Promise(r => chrome.storage.sync.getBytesInUse(null, r));
    console.log(`[NotasPat][TESTE] sync preenchido: ${uso} bytes`);
    return uso;
  },

  async clearFill() {
    const tudo = await new Promise(r => chrome.storage.sync.get(null, r));
    const chaves = Object.keys(tudo).filter(k => k.startsWith('__fill_'));
    if (chaves.length) await new Promise(r => chrome.storage.sync.remove(chaves, r));
    console.log(`[NotasPat][TESTE] ${chaves.length} chaves de preenchimento removidas`);
  },

  report() {
    const falhas = this.results.filter(r => !r.ok);
    console.log(`[NotasPat][TESTE] === ${this.results.length - falhas.length}/${this.results.length} passaram ===`);
    falhas.forEach(f => console.log(`[NotasPat][TESTE] FALHOU: ${f.nome}`));
    return falhas.length === 0;
  }
};
```

- [ ] **Step 2: Verificar que o harness carrega**

Carregar a extensão em `chrome://extensions/`, abrir o console do service worker, colar o arquivo inteiro e rodar:

```javascript
NotasPatTest.assert('harness vivo', true);
NotasPatTest.report();
```

Esperado: `PASSOU: harness vivo` e `=== 1/1 passaram ===`.

- [ ] **Step 3: Commit**

```bash
git add test/manual-harness.js
git commit -m "test: adiciona harness manual para validar migracao de storage

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 2: Módulo de quota (`lib/quota.js`)

**Files:**
- Create: `inss-notas-extensao/lib/quota.js`
- Modify: `inss-notas-extensao/manifest.json` (registrar o script)

**Interfaces:**
- Produces:
  - `SYNC_QUOTA_BYTES_TOTAL` (102400), `SYNC_QUOTA_BYTES_PER_ITEM` (8192), `SYNC_MAX_ITEMS` (512)
  - `getItemByteSize(key, value) -> number`
  - `checkQuotaBeforeWrite(key, value) -> Promise<{ok: true} | {ok: false, limitType: 'PER_ITEM'|'TOTAL'|'MAX_ITEMS', ...}>`
  - `createQuotaError(limitType) -> Error` com `.code === 'QUOTA_EXCEEDED'` e `.limitType`
  - `isQuotaError(err) -> boolean`

- [ ] **Step 1: Escrever o teste que falha**

Colar no console do service worker (com o harness já carregado):

```javascript
await NotasPatTest.reset();
NotasPatTest.assert('getItemByteSize existe', typeof getItemByteSize === 'function');
NotasPatTest.assertEquals('tamanho de item ASCII', getItemByteSize('ab', 'cd'), 6); // 'ab'=2 + '"cd"'=4
NotasPatTest.assert('acentuacao conta como multibyte', getItemByteSize('a', 'ç') > getItemByteSize('a', 'c'));
const r = await checkQuotaBeforeWrite('note_1', { text: 'x'.repeat(9000) });
NotasPatTest.assertEquals('item gigante rejeitado', r.limitType, 'PER_ITEM');
NotasPatTest.report();
```

- [ ] **Step 2: Rodar e confirmar que falha**

Esperado: `ReferenceError: getItemByteSize is not defined` — o módulo ainda não existe.

- [ ] **Step 3: Criar `lib/quota.js`**

```javascript
/**
 * Modulo de Quota - NotasPat
 * Limites do chrome.storage.sync e checagem previa de gravacao.
 *
 * O storage.sync tem limites rigidos. Checar ANTES de gravar permite
 * dar mensagem util ao usuario em vez de falhar com erro generico.
 */

const SYNC_QUOTA_BYTES_TOTAL = 102400;   // 100 KB no total
const SYNC_QUOTA_BYTES_PER_ITEM = 8192;  // 8 KB por chave
const SYNC_MAX_ITEMS = 512;              // 512 chaves

/**
 * Tamanho que o Chrome contabiliza: bytes UTF-8 da chave + do JSON do valor.
 */
function getItemByteSize(key, value) {
  const encoder = new TextEncoder();
  return encoder.encode(key).length + encoder.encode(JSON.stringify(value)).length;
}

function createQuotaError(limitType) {
  const mensagens = {
    PER_ITEM: 'Esta nota e muito longa para sincronizar (maximo 8 KB). Ela foi salva apenas neste computador. Reduza o texto para sincronizar.',
    TOTAL: 'Limite de sincronizacao atingido - esta nota foi salva apenas neste computador. Exclua notas de tarefas ja concluidas para voltar a sincronizar.',
    MAX_ITEMS: 'Limite de 512 itens sincronizados atingido - esta nota foi salva apenas neste computador. Exclua notas de tarefas ja concluidas.'
  };
  const err = new Error(mensagens[limitType] || mensagens.TOTAL);
  err.code = 'QUOTA_EXCEEDED';
  err.limitType = limitType;
  return err;
}

function isQuotaError(err) {
  return !!err && err.code === 'QUOTA_EXCEEDED';
}

/**
 * Checa se uma gravacao cabe no storage.sync.
 * Nao substitui o tratamento de chrome.runtime.lastError: existe corrida
 * entre checar e gravar (outra aba, ou dado chegando via sync).
 */
function checkQuotaBeforeWrite(key, value) {
  const itemBytes = getItemByteSize(key, value);

  if (itemBytes > SYNC_QUOTA_BYTES_PER_ITEM) {
    return Promise.resolve({ ok: false, limitType: 'PER_ITEM', itemBytes });
  }

  return Promise.all([
    new Promise(r => chrome.storage.sync.getBytesInUse(null, r)),
    new Promise(r => chrome.storage.sync.getBytesInUse(key, r))
  ]).then(([currentTotal, existingBytes]) => {
    const projectedTotal = currentTotal - existingBytes + itemBytes;
    if (projectedTotal > SYNC_QUOTA_BYTES_TOTAL) {
      return { ok: false, limitType: 'TOTAL', projectedTotal };
    }

    // MAX_ITEMS so importa para chave nova (existingBytes === 0 = nao existe ainda)
    if (existingBytes === 0) {
      return new Promise(r => chrome.storage.sync.get(null, v => r(Object.keys(v).length)))
        .then(itemCount => {
          if (itemCount + 1 > SYNC_MAX_ITEMS) {
            return { ok: false, limitType: 'MAX_ITEMS', itemCount };
          }
          return { ok: true };
        });
    }

    return { ok: true };
  });
}
```

- [ ] **Step 4: Registrar no manifest**

Em `inss-notas-extensao/manifest.json`, `lib/quota.js` precisa vir **antes** de `lib/storage.js` (é dependência dele):

```json
      "js": [
        "lib/quota.js",
        "lib/storage.js",
        "content/content.js"
      ],
```

- [ ] **Step 5: Rodar o teste e confirmar que passa**

Recarregar a extensão em `chrome://extensions/`, recolar o harness e o teste do Step 1.
Esperado: `=== 4/4 passaram ===`.

- [ ] **Step 6: Testar o limite TOTAL de verdade**

```javascript
await NotasPatTest.reset();
await NotasPatTest.fillSyncTo(100000);
const r = await checkQuotaBeforeWrite('note_novo', { text: 'pequena' });
NotasPatTest.assertEquals('quota total estourada detectada', r.limitType, 'TOTAL');
await NotasPatTest.clearFill();
const r2 = await checkQuotaBeforeWrite('note_novo', { text: 'pequena' });
NotasPatTest.assert('cabe depois de liberar espaco', r2.ok === true);
NotasPatTest.report();
```

Esperado: `=== 2/2 passaram ===`.

- [ ] **Step 7: Commit**

```bash
git add inss-notas-extensao/lib/quota.js inss-notas-extensao/manifest.json
git commit -m "feat: adiciona modulo de quota para storage.sync

Centraliza limites do storage.sync e checagem previa de gravacao,
permitindo mensagem util ao usuario em vez de falha generica.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 3: Escrita de notas em `sync` com fallback

**Files:**
- Modify: `inss-notas-extensao/lib/storage.js:89-121` (`saveNote`)

**Interfaces:**
- Consumes: `checkQuotaBeforeWrite`, `createQuotaError`, `SYNC_*` (Task 2)
- Produces: `saveNote(protocolo, text, color, tags, reminder) -> Promise<nota>` — rejeita com erro `QUOTA_EXCEEDED` após ter salvo a nota em `local` com `_syncFallback: true`
- Produces: `writeNoteWithFallback(key, note) -> Promise<note>` — usado também pela Task 4 na auto-promoção
- Produces: `saveToLocalFallback(key, note, limitType) -> Promise` (sempre rejeita, após gravar)
- Produces: `readExistingNote(key) -> Promise<note|null>` — lê os dois namespaces

- [ ] **Step 1: Escrever o teste que falha**

```javascript
await NotasPatTest.reset();
const n = await saveNote('111', 'teste', '#fff8c6', []);
NotasPatTest.assertEquals('nota salva tem o texto', n.text, 'teste');
const noSync = await new Promise(r => chrome.storage.sync.get(['note_111'], r));
NotasPatTest.assert('nota foi para o sync', !!noSync.note_111);

// Com o sync cheio, a nota deve cair no local e AINDA ASSIM nao se perder
await NotasPatTest.fillSyncTo(100000);
let capturado = null;
try {
  await saveNote('222', 'cai no fallback', '#fff8c6', []);
} catch (e) { capturado = e; }
NotasPatTest.assert('erro de quota foi lancado', capturado && capturado.code === 'QUOTA_EXCEEDED');
const noLocal = await new Promise(r => chrome.storage.local.get(['note_222'], r));
NotasPatTest.assert('nota NAO foi perdida (esta em local)', !!noLocal.note_222);
NotasPatTest.assert('nota marcada como fallback', noLocal.note_222._syncFallback === true);
await NotasPatTest.clearFill();

// createdAt da nota original nao pode ser sobrescrito ao editar
await NotasPatTest.reset();
await saveNote('333', 'primeira versao', '#fff8c6', []);
const original = await new Promise(r => chrome.storage.sync.get(['note_333'], r));
const criadoEm = original.note_333.createdAt;
await new Promise(r => setTimeout(r, 20));
await saveNote('333', 'segunda versao', '#fff8c6', []);
const editada = await new Promise(r => chrome.storage.sync.get(['note_333'], r));
NotasPatTest.assertEquals('createdAt preservado ao editar', editada.note_333.createdAt, criadoEm);
NotasPatTest.assert('updatedAt avancou', editada.note_333.updatedAt > criadoEm);
NotasPatTest.report();
```

- [ ] **Step 2: Rodar e confirmar que falha**

Esperado: falha em "nota foi para o sync" — `saveNote` ainda grava em `chrome.storage.local`.

- [ ] **Step 3: Implementar**

Em `lib/storage.js`, adicionar o helper antes de `saveNote` e reescrever `saveNote`:

```javascript
/**
 * Grava uma nota no sync; se nao couber, cai para local marcando _syncFallback.
 * A nota digitada nunca e descartada.
 */
function writeNoteWithFallback(key, note) {
  return checkQuotaBeforeWrite(key, note).then(check => {
    if (!check.ok) {
      return saveToLocalFallback(key, note, check.limitType);
    }
    return new Promise((resolve, reject) => {
      chrome.storage.sync.set({ [key]: note }, () => {
        const erro = chrome.runtime.lastError;
        if (erro) {
          // Corrida entre checar e gravar, ou limite de taxa de escrita.
          console.warn('[NotasPat] Falha ao gravar no sync, usando fallback local:', erro.message);
          saveToLocalFallback(key, note, 'TOTAL').then(resolve, reject);
          return;
        }
        // Gravou no sync: qualquer copia antiga em local esta obsoleta
        chrome.storage.local.remove(key, () => resolve(note));
      });
    });
  });
}

function saveToLocalFallback(key, note, limitType) {
  const noteFallback = Object.assign({}, note, { _syncFallback: true });
  return new Promise((resolve, reject) => {
    chrome.storage.local.set({ [key]: noteFallback }, () => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
        return;
      }
      reject(createQuotaError(limitType));
    });
  });
}
```

Substituir o corpo de `saveNote` (linhas 89-121) por:

```javascript
/**
 * Le a nota existente dos DOIS namespaces para preservar createdAt.
 * Nao usa getNote() porque nesta etapa getNote ainda le so um namespace;
 * ler so um lado perderia o createdAt original de uma nota ja no sync.
 */
function readExistingNote(key) {
  return Promise.all([
    new Promise(r => chrome.storage.sync.get([key], v => r((v || {})[key]))),
    new Promise(r => chrome.storage.local.get([key], v => r((v || {})[key])))
  ]).then(([doSync, doLocal]) => doSync || doLocal || null);
}

function saveNote(protocolo, text, color, tags = [], reminder = null) {
  const key = NOTE_PREFIX + protocolo;
  return readExistingNote(key).then(existing => {
    const now = new Date().toISOString();
    const note = {
      id: protocolo,
      text: text,
      color: color || '#fff8c6',
      tags: tags || [],
      reminder: reminder,
      createdAt: existing ? existing.createdAt : now,
      updatedAt: now
    };
    return writeNoteWithFallback(key, note);
  });
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Recarregar a extensão, recolar harness e teste do Step 1.
Esperado: `=== 7/7 passaram ===`.

- [ ] **Step 5: Commit**

```bash
git add inss-notas-extensao/lib/storage.js
git commit -m "feat: grava notas no storage.sync com fallback local

Notas passam a sincronizar entre computadores. Quando a quota
nao permite, a nota e salva localmente em vez de ser perdida.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 4: Leitura dos dois namespaces com resolução de conflito

**Files:**
- Modify: `inss-notas-extensao/lib/storage.js:16-78` (`getAllNotes`, `getNote`, `getNotesForProtocolos`)

**Interfaces:**
- Consumes: `writeNoteWithFallback` (Task 3)
- Produces: `mergeNotesByRecency(syncNotes, localNotes) -> {merged, obsoleteLocalKeys, promotableKeys}`
- Produces: `getAllNotes()`, `getNote(protocolo)`, `getNotesForProtocolos(array)` — todos leem `sync` + `local`

- [ ] **Step 1: Escrever o teste que falha**

```javascript
await NotasPatTest.reset();
// Mesma chave nos dois lados: local e MAIS RECENTE
await new Promise(r => chrome.storage.sync.set({ note_333: { id:'333', text:'antiga', updatedAt:'2020-01-01T00:00:00.000Z' } }, r));
await new Promise(r => chrome.storage.local.set({ note_333: { id:'333', text:'nova', updatedAt:'2030-01-01T00:00:00.000Z', _syncFallback:true } }, r));
const todas = await getAllNotes();
NotasPatTest.assertEquals('vence a versao mais recente', todas['333'].text, 'nova');
NotasPatTest.assertEquals('sem duplicata', Object.keys(todas).filter(k => k === '333').length, 1);

// Agora o sync e o mais recente: a copia local e obsoleta e deve sumir
await NotasPatTest.reset();
await new Promise(r => chrome.storage.sync.set({ note_444: { id:'444', text:'sync novo', updatedAt:'2030-01-01T00:00:00.000Z' } }, r));
await new Promise(r => chrome.storage.local.set({ note_444: { id:'444', text:'local velho', updatedAt:'2020-01-01T00:00:00.000Z', _syncFallback:true } }, r));
const todas2 = await getAllNotes();
NotasPatTest.assertEquals('vence o sync quando mais recente', todas2['444'].text, 'sync novo');
await new Promise(r => setTimeout(r, 300)); // limpeza assincrona
const sobrou = await new Promise(r => chrome.storage.local.get(['note_444'], r));
NotasPatTest.assert('copia local obsoleta foi limpa', !sobrou.note_444);
NotasPatTest.report();
```

- [ ] **Step 2: Rodar e confirmar que falha**

Esperado: falha em "vence a versao mais recente" — `getAllNotes()` só lê `sync` (ou só `local`), ignorando o outro.

- [ ] **Step 3: Implementar**

Adicionar o merge e reescrever os leitores em `lib/storage.js`:

```javascript
/**
 * Resolve a mesma chave presente nos dois namespaces.
 * Regra: vence updatedAt mais recente. "Sync sempre vence" descartaria
 * uma edicao local mais nova que o usuario acabou de fazer.
 */
function mergeNotesByRecency(syncNotes, localNotes) {
  const merged = {};
  const obsoleteLocalKeys = [];
  const promotableKeys = [];

  Object.keys(syncNotes).forEach(p => { merged[p] = syncNotes[p]; });

  Object.keys(localNotes).forEach(p => {
    const local = localNotes[p];
    const sync = syncNotes[p];

    if (!sync) {
      merged[p] = local;
      promotableKeys.push(p); // so existe em local: tentar promover ao sync
      return;
    }

    const tLocal = new Date(local.updatedAt || 0).getTime();
    const tSync = new Date(sync.updatedAt || 0).getTime();

    if (tLocal > tSync) {
      merged[p] = local;
      promotableKeys.push(p);
    } else {
      merged[p] = sync;
      obsoleteLocalKeys.push(p); // sync venceu: copia local nao serve mais
    }
  });

  return { merged, obsoleteLocalKeys, promotableKeys };
}

function readNotesFromArea(area, keys) {
  return new Promise((resolve) => {
    const query = keys === null ? null : keys;
    chrome.storage[area].get(query, (result) => {
      if (chrome.runtime.lastError) { resolve({}); return; }
      const notes = {};
      Object.keys(result || {}).forEach(key => {
        if (key.startsWith(NOTE_PREFIX)) {
          notes[key.substring(NOTE_PREFIX.length)] = result[key];
        }
      });
      resolve(notes);
    });
  });
}

/**
 * Limpa copias locais obsoletas e tenta promover ao sync as que ficaram
 * so em local. Isso faz notas em fallback se auto-recuperarem quando o
 * usuario libera espaco, sem exigir acao manual.
 */
function reconcileNamespaces(merged, obsoleteLocalKeys, promotableKeys) {
  if (obsoleteLocalKeys.length > 0) {
    chrome.storage.local.remove(obsoleteLocalKeys.map(p => NOTE_PREFIX + p), () => {
      if (chrome.runtime.lastError) console.warn('[NotasPat] Falha ao limpar copias locais obsoletas');
    });
  }

  promotableKeys.forEach(p => {
    const note = merged[p];
    if (!note) return;
    const limpa = Object.assign({}, note);
    delete limpa._syncFallback;
    writeNoteWithFallback(NOTE_PREFIX + p, limpa).catch(() => {
      // Continua sem caber: segue em local, sem alarde
    });
  });
}

function getAllNotes() {
  return Promise.all([
    readNotesFromArea('sync', null),
    readNotesFromArea('local', null)
  ]).then(([syncNotes, localNotes]) => {
    const { merged, obsoleteLocalKeys, promotableKeys } = mergeNotesByRecency(syncNotes, localNotes);
    reconcileNamespaces(merged, obsoleteLocalKeys, promotableKeys);
    return merged;
  });
}

function getNote(protocolo) {
  return getNotesForProtocolos([protocolo]).then(notes => notes[protocolo] || null);
}

function getNotesForProtocolos(protocolos) {
  if (!protocolos || protocolos.length === 0) return Promise.resolve({});
  const keys = protocolos.map(p => NOTE_PREFIX + p);
  return Promise.all([
    readNotesFromArea('sync', keys),
    readNotesFromArea('local', keys)
  ]).then(([syncNotes, localNotes]) => {
    const { merged, obsoleteLocalKeys, promotableKeys } = mergeNotesByRecency(syncNotes, localNotes);
    reconcileNamespaces(merged, obsoleteLocalKeys, promotableKeys);
    return merged;
  });
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Esperado: `=== 4/4 passaram ===`.

- [ ] **Step 5: Verificar a auto-recuperação do fallback**

```javascript
await NotasPatTest.reset();
await NotasPatTest.fillSyncTo(100000);
try { await saveNote('555', 'presa no local', '#fff8c6', []); } catch (e) {}
const antes = await new Promise(r => chrome.storage.local.get(['note_555'], r));
NotasPatTest.assert('ficou em local enquanto cheio', !!antes.note_555);
await NotasPatTest.clearFill();
await getAllNotes(); // dispara a promocao
await new Promise(r => setTimeout(r, 500));
const noSync = await new Promise(r => chrome.storage.sync.get(['note_555'], r));
NotasPatTest.assert('subiu para o sync sozinha', !!noSync.note_555);
NotasPatTest.report();
```

Esperado: `=== 2/2 passaram ===`.

- [ ] **Step 6: Commit**

```bash
git add inss-notas-extensao/lib/storage.js
git commit -m "feat: le notas dos dois namespaces com resolucao por updatedAt

Notas em fallback local continuam visiveis e sobem para o sync
sozinhas quando o usuario libera espaco.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 5: Exclusão nos dois namespaces

Sem isso, excluir uma nota que tem cópia em fallback a faz **reaparecer** na próxima leitura.

**Files:**
- Modify: `inss-notas-extensao/lib/storage.js:128-156` (`deleteNote`, `deleteAllNotes`)

**Interfaces:**
- Produces: `deleteNote(protocolo) -> Promise<true>`, `deleteAllNotes() -> Promise<void>` — ambos removem de `sync` e `local`

- [ ] **Step 1: Escrever o teste que falha**

```javascript
await NotasPatTest.reset();
await new Promise(r => chrome.storage.sync.set({ note_666: { id:'666', text:'no sync', updatedAt:'2030-01-01T00:00:00.000Z' } }, r));
await new Promise(r => chrome.storage.local.set({ note_666: { id:'666', text:'no local', updatedAt:'2029-01-01T00:00:00.000Z', _syncFallback:true } }, r));
await deleteNote('666');
const todas = await getAllNotes();
NotasPatTest.assert('nota excluida nao ressuscita', !todas['666']);
NotasPatTest.report();
```

- [ ] **Step 2: Rodar e confirmar que falha**

Esperado: falha — a cópia em `local` sobrevive e reaparece no merge.

- [ ] **Step 3: Implementar**

```javascript
function deleteNote(protocolo) {
  const key = NOTE_PREFIX + protocolo;
  // Remove dos DOIS namespaces: uma copia sobrevivente ressuscitaria a nota
  return Promise.all([
    new Promise(r => chrome.storage.sync.remove(key, r)),
    new Promise(r => chrome.storage.local.remove(key, r))
  ]).then(() => true);
}

function deleteAllNotes() {
  return getAllNotes().then(notes => {
    const keys = Object.keys(notes).map(p => NOTE_PREFIX + p);
    if (keys.length === 0) return;
    return Promise.all([
      new Promise(r => chrome.storage.sync.remove(keys, r)),
      new Promise(r => chrome.storage.local.remove(keys, r))
    ]).then(() => undefined);
  });
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Esperado: `=== 1/1 passaram ===`.

- [ ] **Step 5: Commit**

```bash
git add inss-notas-extensao/lib/storage.js
git commit -m "fix: exclui nota dos dois namespaces

Sem isso, uma copia em fallback local fazia a nota excluida
reaparecer na leitura seguinte.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 6: Textos padrão em `sync` e `checkStorageHealth` recalibrado

**Files:**
- Modify: `inss-notas-extensao/lib/storage.js:346-359` (`checkStorageHealth`)
- Modify: `inss-notas-extensao/lib/storage.js:433-527` (`getStandardTexts`, `saveStandardText`, `updateStandardText`, `deleteStandardText`)
- Modify: `inss-notas-extensao/lib/storage.js:553-590` (`importStandardTexts`)

**Interfaces:**
- Produces: `checkStorageHealth() -> Promise<{ok, percentUsed, warning}>` — campo `count` removido (não era consumido em lugar nenhum; confirmado por busca)
- Produces: textos padrão gravam em `sync`, caindo para `local` inteiros quando a chave passa de 8 KB

- [ ] **Step 1: Escrever o teste que falha**

```javascript
await NotasPatTest.reset();
const s1 = await checkStorageHealth();
NotasPatTest.assert('vazio esta saudavel', s1.ok === true);
NotasPatTest.assert('reporta percentUsed', typeof s1.percentUsed === 'number');
await NotasPatTest.fillSyncTo(75000); // ~73% de 102400
const s2 = await checkStorageHealth();
NotasPatTest.assert('avisa acima de 70%', s2.ok === false && !!s2.warning);
await NotasPatTest.clearFill();

await saveStandardText('Titulo teste', 'x'.repeat(50));
const noSync = await new Promise(r => chrome.storage.sync.get(['standard_texts'], r));
NotasPatTest.assert('textos padrao vao para o sync', Array.isArray(noSync.standard_texts) && noSync.standard_texts.length === 1);
NotasPatTest.report();
```

- [ ] **Step 2: Rodar e confirmar que falha**

Esperado: falha em "reporta percentUsed" — a versão atual retorna `{ok, count, warning}` baseado em contagem de notas.

- [ ] **Step 3: Implementar**

Substituir `checkStorageHealth` (linhas 346-359):

```javascript
/**
 * Saude do storage medida em BYTES do sync, nao em contagem de notas.
 * O gargalo agora e o teto de 100 KB, nao a quantidade.
 * Avisa a 70% para dar folga antes do bloqueio rigido.
 */
function checkStorageHealth() {
  return new Promise((resolve) => {
    chrome.storage.sync.getBytesInUse(null, (bytesInUse) => {
      if (chrome.runtime.lastError) {
        resolve({ ok: true, percentUsed: 0, warning: null });
        return;
      }
      const percentUsed = bytesInUse / SYNC_QUOTA_BYTES_TOTAL;
      let warning = null;
      if (percentUsed >= 0.7) {
        warning = `Voce esta usando ${Math.round(percentUsed * 100)}% do limite de sincronizacao. Considere excluir notas de tarefas ja concluidas para manter a sincronizacao entre computadores.`;
      }
      resolve({ ok: percentUsed < 0.7, percentUsed, warning });
    });
  });
}
```

Em `getStandardTexts` (linha 433), ler dos dois namespaces preferindo `sync`:

```javascript
function getStandardTexts() {
  return Promise.all([
    new Promise(r => chrome.storage.sync.get([STANDARD_TEXTS_KEY], v => r((v || {})[STANDARD_TEXTS_KEY]))),
    new Promise(r => chrome.storage.local.get([STANDARD_TEXTS_KEY], v => r((v || {})[STANDARD_TEXTS_KEY])))
  ]).then(([doSync, doLocal]) => doSync || doLocal || []);
}

/**
 * standard_texts e UMA chave com o array inteiro, entao esta sujeita ao
 * teto de 8 KB como um todo. Se nao couber, a chave inteira fica em local.
 */
function writeStandardTexts(texts) {
  return checkQuotaBeforeWrite(STANDARD_TEXTS_KEY, texts).then(check => {
    if (!check.ok) {
      return new Promise((resolve, reject) => {
        chrome.storage.local.set({ [STANDARD_TEXTS_KEY]: texts }, () => {
          if (chrome.runtime.lastError) { reject(chrome.runtime.lastError); return; }
          reject(createQuotaError(check.limitType));
        });
      });
    }
    return new Promise((resolve, reject) => {
      chrome.storage.sync.set({ [STANDARD_TEXTS_KEY]: texts }, () => {
        if (chrome.runtime.lastError) { reject(chrome.runtime.lastError); return; }
        chrome.storage.local.remove(STANDARD_TEXTS_KEY, () => resolve(texts));
      });
    });
  });
}
```

Trocar, em `saveStandardText`, `updateStandardText`, `deleteStandardText` e `importStandardTexts`, cada `chrome.storage.local.set({ [STANDARD_TEXTS_KEY]: X }, cb)` por `writeStandardTexts(X).then(...)`, propagando o erro para o chamador. Exemplo em `saveStandardText`:

```javascript
      texts.push(entry);
      writeStandardTexts(texts).then(() => resolve(entry), reject);
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Esperado: `=== 4/4 passaram ===`.

- [ ] **Step 5: Commit**

```bash
git add inss-notas-extensao/lib/storage.js
git commit -m "feat: sincroniza textos padrao e mede saude do storage em bytes

checkStorageHealth passa a medir uso real do sync (aviso a 70%)
em vez de contar notas, que nao reflete mais o gargalo.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 7: Migração dos dados existentes

O ponto mais sensível: aqui estão os dados reais dos ~1000 usuários. A ordem grava-confirma-remove não pode ser invertida.

**Files:**
- Modify: `inss-notas-extensao/background/background.js:13-36` (`onInstalled`), `:53-87` (migração existente), `:204-221` (`onChanged`), `:94-113`, `:164`, `:295-302`

**Interfaces:**
- Produces: `migrateNotesToSync() -> Promise<{migradas, naoMigradas}>`

- [ ] **Step 1: Escrever o teste que falha**

```javascript
await NotasPatTest.reset();
// Simular usuario existente: notas so em local, com datas diferentes
await new Promise(r => chrome.storage.local.set({
  note_antiga: { id:'antiga', text:'de 2020', updatedAt:'2020-01-01T00:00:00.000Z', createdAt:'2020-01-01T00:00:00.000Z' },
  note_recente: { id:'recente', text:'de 2030', updatedAt:'2030-01-01T00:00:00.000Z', createdAt:'2030-01-01T00:00:00.000Z' }
}, r));
const res = await migrateNotesToSync();
NotasPatTest.assertEquals('as duas migraram', res.migradas, 2);
const noSync = await new Promise(r => chrome.storage.sync.get(null, r));
NotasPatTest.assert('recente esta no sync', !!noSync.note_recente);
NotasPatTest.assert('antiga esta no sync', !!noSync.note_antiga);
const noLocal = await new Promise(r => chrome.storage.local.get(null, r));
NotasPatTest.assert('local foi esvaziado das notas migradas', !noLocal.note_recente && !noLocal.note_antiga);

// Nada se perde quando o sync esta cheio
await NotasPatTest.reset();
await NotasPatTest.fillSyncTo(100000);
await new Promise(r => chrome.storage.local.set({ note_naocabe: { id:'naocabe', text:'fico local', updatedAt:'2030-01-01T00:00:00.000Z' } }, r));
const res2 = await migrateNotesToSync();
NotasPatTest.assertEquals('contabilizou nao migrada', res2.naoMigradas, 1);
const sobrou = await new Promise(r => chrome.storage.local.get(['note_naocabe'], r));
NotasPatTest.assert('nota que nao coube NAO foi perdida', !!sobrou.note_naocabe);
await NotasPatTest.clearFill();
NotasPatTest.report();
```

- [ ] **Step 2: Rodar e confirmar que falha**

Esperado: `ReferenceError: migrateNotesToSync is not defined`.

- [ ] **Step 3: Implementar a migração**

Adicionar em `background/background.js`, após `migrateToGranularStorage()`:

```javascript
const SYNC_QUOTA_BYTES_TOTAL_BG = 102400;
const SYNC_QUOTA_BYTES_PER_ITEM_BG = 8192;
const SYNC_MAX_ITEMS_BG = 512;

function getItemByteSizeBg(key, value) {
  const encoder = new TextEncoder();
  return encoder.encode(key).length + encoder.encode(JSON.stringify(value)).length;
}

/**
 * Move notas e textos padrao de local para sync.
 *
 * ORDEM INVIOLAVEL: grava no sync -> confirma sucesso -> so entao remove
 * do local. Nunca existe um instante em que o dado nao esta em lugar nenhum.
 *
 * Ordena por updatedAt desc: se nem tudo couber, o que sincroniza e o
 * trabalho mais recente, nao uma fatia arbitraria.
 */
async function migrateNotesToSync() {
  let migradas = 0;
  let naoMigradas = 0;

  try {
    const local = await chrome.storage.local.get(null);
    const chavesNota = Object.keys(local).filter(k => k.startsWith(NOTE_PREFIX));

    chavesNota.sort((a, b) => {
      const ta = new Date((local[a] || {}).updatedAt || 0).getTime();
      const tb = new Date((local[b] || {}).updatedAt || 0).getTime();
      return tb - ta; // mais recente primeiro
    });

    for (const key of chavesNota) {
      const nota = local[key];
      const itemBytes = getItemByteSizeBg(key, nota);

      const usado = await chrome.storage.sync.getBytesInUse(null);
      const existentes = await chrome.storage.sync.get(null);
      const totalItens = Object.keys(existentes).length;

      const cabe = itemBytes <= SYNC_QUOTA_BYTES_PER_ITEM_BG
        && (usado + itemBytes) <= SYNC_QUOTA_BYTES_TOTAL_BG
        && (totalItens + 1) <= SYNC_MAX_ITEMS_BG;

      if (!cabe) {
        await chrome.storage.local.set({ [key]: Object.assign({}, nota, { _syncFallback: true }) });
        naoMigradas++;
        continue;
      }

      try {
        await chrome.storage.sync.set({ [key]: nota });   // 1. grava
        await chrome.storage.sync.get([key]);             // 2. confirma
        await chrome.storage.local.remove(key);           // 3. so entao remove
        migradas++;
      } catch (e) {
        // Falhou a gravacao: a nota FICA no local, intacta
        await chrome.storage.local.set({ [key]: Object.assign({}, nota, { _syncFallback: true }) });
        naoMigradas++;
      }
    }

    // Textos padrao: chave unica, migra inteira ou nao migra
    if (local.standard_texts && Array.isArray(local.standard_texts) && local.standard_texts.length > 0) {
      const jaNoSync = await chrome.storage.sync.get(['standard_texts']);
      if (!jaNoSync.standard_texts) {
        const bytes = getItemByteSizeBg('standard_texts', local.standard_texts);
        const usado = await chrome.storage.sync.getBytesInUse(null);
        if (bytes <= SYNC_QUOTA_BYTES_PER_ITEM_BG && (usado + bytes) <= SYNC_QUOTA_BYTES_TOTAL_BG) {
          try {
            await chrome.storage.sync.set({ standard_texts: local.standard_texts });
            await chrome.storage.sync.get(['standard_texts']);
            await chrome.storage.local.remove('standard_texts');
          } catch (e) {
            naoMigradas++;
          }
        } else {
          naoMigradas++;
        }
      }
    }

    console.log(`[NotasPat] Migracao para sync: ${migradas} migradas, ${naoMigradas} mantidas localmente`);

    if (naoMigradas > 0) {
      chrome.notifications.create('notaspat_migracao', {
        type: 'basic',
        iconUrl: 'icons/icon128.png',
        title: 'NotasPat - Sincronizacao',
        message: `${migradas} notas agora sincronizam entre computadores. ${naoMigradas} nao couberam e seguem salvas apenas neste computador - exclua notas antigas para sincroniza-las.`,
        priority: 2
      });
    }
  } catch (error) {
    console.error('[NotasPat] Erro na migracao para sync:', error);
  }

  return { migradas, naoMigradas };
}
```

- [ ] **Step 4: Ligar a migração ao ciclo de vida e trocar os namespaces**

Em `onInstalled` (linha 32), após `await migrateToGranularStorage();`:

```javascript
  await migrateToGranularStorage();
  await migrateNotesToSync();
```

Na inicialização (linha 344):

```javascript
migrateToGranularStorage()
  .then(() => migrateNotesToSync())
  .then(() => { updateBadge(); });
```

Em `getAllNotesFromStorage` (linha 94-104), ler os dois namespaces:

```javascript
async function getAllNotesFromStorage() {
  const [doSync, doLocal] = await Promise.all([
    chrome.storage.sync.get(null),
    chrome.storage.local.get(null)
  ]);
  const notes = {};
  for (const key of Object.keys(doLocal)) {
    if (key.startsWith(NOTE_PREFIX)) notes[key.substring(NOTE_PREFIX.length)] = doLocal[key];
  }
  for (const key of Object.keys(doSync)) {
    if (key.startsWith(NOTE_PREFIX)) {
      const p = key.substring(NOTE_PREFIX.length);
      const atual = notes[p];
      if (!atual || new Date(doSync[key].updatedAt || 0) >= new Date(atual.updatedAt || 0)) {
        notes[p] = doSync[key];
      }
    }
  }
  return notes;
}
```

Em `getNoteFromStorage` (linha 109-113):

```javascript
async function getNoteFromStorage(protocolo) {
  const notes = await getAllNotesFromStorage();
  return notes[protocolo] || null;
}
```

Nas gravações de lembrete (linhas 164 e 302), trocar `chrome.storage.local.set` por `chrome.storage.sync.set`, mantendo `local` como fallback:

```javascript
      try {
        await chrome.storage.sync.set({ [NOTE_PREFIX + protocolo]: nota });
      } catch (e) {
        await chrome.storage.local.set({ [NOTE_PREFIX + protocolo]: nota });
      }
```

No listener `onChanged` (linha 205), aceitar os dois namespaces:

```javascript
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace !== 'sync' && namespace !== 'local') return;
```

- [ ] **Step 5: Rodar o teste e confirmar que passa**

Recarregar a extensão e rodar o teste do Step 1 no console do service worker.
Esperado: `=== 6/6 passaram ===`.

- [ ] **Step 6: Testar migração interrompida**

```javascript
await NotasPatTest.reset();
const muitas = {};
for (let i = 0; i < 30; i++) {
  muitas[`note_9${i}`] = { id:`9${i}`, text:`nota ${i}`, updatedAt:new Date(2030, 0, i+1).toISOString() };
}
await new Promise(r => chrome.storage.local.set(muitas, r));
await migrateNotesToSync();
await migrateNotesToSync(); // rodar 2x: deve ser idempotente
const sync = await new Promise(r => chrome.storage.sync.get(null, r));
const local = await new Promise(r => chrome.storage.local.get(null, r));
const totalSync = Object.keys(sync).filter(k => k.startsWith('note_')).length;
const totalLocal = Object.keys(local).filter(k => k.startsWith('note_')).length;
NotasPatTest.assertEquals('nenhuma nota perdida nem duplicada', totalSync + totalLocal, 30);
NotasPatTest.report();
```

Esperado: `=== 1/1 passaram ===`.

- [ ] **Step 7: Commit**

```bash
git add inss-notas-extensao/background/background.js
git commit -m "feat: migra notas existentes de local para sync

Migracao automatica na atualizacao, sem acao do usuario. Prioriza
notas recentes e usa ordem grava-confirma-remove: nenhuma nota fica
sem copia em nenhum instante.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 8: Aviso de quota chegando ao usuário

Sem esta task, os `.catch()` genéricos engolem a mensagem e **o recurso pedido não funciona**, mesmo com todo o resto pronto.

**Files:**
- Modify: `inss-notas-extensao/content/content.js:606-609`
- Modify: `inss-notas-extensao/popup/popup.js:786-789`, `:1169-1180`
- Modify: `inss-notas-extensao/stdtexts/stdtexts.js:192-200`

**Interfaces:**
- Consumes: `isQuotaError(err)` e `err.message` (Task 2)

- [ ] **Step 1: Verificar o comportamento errado atual**

Com o sync cheio, salvar uma nota pela interface do portal e observar o toast.

```javascript
await NotasPatTest.fillSyncTo(100000);
```

Agora criar uma nota pela UI do portal INSS.
Esperado **antes da correção**: aparece `"Erro ao salvar nota"` — genérico, sem explicar o limite. É o bug.

- [ ] **Step 2: Corrigir `content.js`**

Substituir o `.catch` das linhas 606-609:

```javascript
  }).catch(err => {
    console.error('[NotasPat] Erro ao salvar nota:', err);
    if (isQuotaError(err)) {
      // A nota FOI salva localmente; o texto do erro explica isso ao usuario
      showToast(err.message, 'warning');
      if (typeof atualizarStickyAposFallback === 'function') {
        atualizarStickyAposFallback(container, protocolo, text, color, tags);
      }
    } else {
      showToast('Erro ao salvar nota', 'error');
    }
  });
```

Adicionar o helper logo acima de `saveNoteForProtocolo` — a nota foi salva, então a UI precisa refletir isso:

```javascript
/**
 * A nota caiu no fallback local: foi salva, so nao sincroniza.
 * A UI precisa mostrar o sticky mesmo assim.
 */
function atualizarStickyAposFallback(container, protocolo, text, color, tags) {
  const nota = { id: protocolo, text, color, tags: tags || [], reminder: null,
                 createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  notasCache[protocolo] = nota;
  container.innerHTML = '';
  const novo = createNoteSticky(protocolo, nota);
  const sticky = novo.querySelector('.inss-nota-sticky');
  if (sticky) container.appendChild(sticky);
}
```

- [ ] **Step 3: Corrigir `popup.js`**

Linhas 786-789:

```javascript
  } catch (error) {
    console.error('[NotasPat] Erro ao salvar nota:', error);
    if (isQuotaError(error)) {
      notasData[currentEditProtocolo] = Object.assign({}, notasData[currentEditProtocolo], {
        text, color: selectedColor, tags: selectedTags, updatedAt: new Date().toISOString()
      });
      renderNotes();
      updateStatistics();
      closeEditModal();
      showToast(error.message, 'warning');
    } else {
      showToast('Erro ao salvar nota. Tente novamente.', 'error');
    }
  }
```

No handler de textos padrão (linha ~1169), aplicar o mesmo padrão:

```javascript
  } catch (error) {
    console.error('[NotasPat] Erro ao salvar texto padrao:', error);
    showToast(isQuotaError(error) ? error.message : 'Erro ao salvar texto padrao.', isQuotaError(error) ? 'warning' : 'error');
  }
```

- [ ] **Step 4: Corrigir `stdtexts.js`**

No `catch` do salvamento (linha ~192):

```javascript
  } catch (error) {
    console.error('[NotasPat] Erro ao salvar texto padrao:', error);
    showToast(isQuotaError(error) ? error.message : 'Erro ao salvar texto padrao.', isQuotaError(error) ? 'warning' : 'error');
  }
```

- [ ] **Step 5: Registrar `quota.js` nas páginas de extensão**

`isQuotaError` precisa existir no popup e na página de textos padrão. Adicionar antes de `storage.js` em `popup/popup.html` e `stdtexts/stdtexts.html`:

```html
<script src="../lib/quota.js"></script>
<script src="../lib/storage.js"></script>
```

- [ ] **Step 6: Verificar a correção**

Recarregar a extensão. Com o sync ainda cheio, salvar uma nota pela UI do portal.
Esperado: toast com `"Limite de sincronizacao atingido - esta nota foi salva apenas neste computador..."` e **o sticky aparece** (a nota não se perdeu).

Repetir pelo popup e pela página de textos padrão. Depois limpar:

```javascript
await NotasPatTest.clearFill();
```

- [ ] **Step 7: Commit**

```bash
git add inss-notas-extensao/content/content.js inss-notas-extensao/popup/popup.js inss-notas-extensao/stdtexts/stdtexts.js inss-notas-extensao/popup/popup.html inss-notas-extensao/stdtexts/stdtexts.html
git commit -m "fix: mostra aviso especifico de limite de sincronizacao

Os catch genericos engoliam o erro de quota e mostravam
'Erro ao salvar nota', escondendo do usuario o motivo real
e o fato de a nota ter sido salva localmente.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 9: Porte para Firefox

`storage.js`, `popup.js`, `stdtexts.js` e `background.js` são **byte-idênticos** entre as builds (verificado com `diff`), então podem ser copiados. `content.js` **difere em 58 linhas** e usa o namespace `browser.*` — não pode ser copiado.

**Files:**
- Create: `inss-notas-extensao-firefox/lib/quota.js`
- Modify: `inss-notas-extensao-firefox/lib/storage.js`, `background/background.js`, `popup/popup.js`, `stdtexts/stdtexts.js` (cópia)
- Modify: `inss-notas-extensao-firefox/content/content.js` (porte manual)
- Modify: `inss-notas-extensao-firefox/manifest.json`, `popup/popup.html`, `stdtexts/stdtexts.html`

- [ ] **Step 1: Confirmar quais arquivos são copiáveis**

```bash
cd "F:/PYTHON/Extensão Chrome Notas PAT"
git stash
for f in lib/storage.js popup/popup.js stdtexts/stdtexts.js background/background.js content/content.js; do
  if diff -q "inss-notas-extensao/$f" "inss-notas-extensao-firefox/$f" >/dev/null 2>&1; then echo "COPIAVEL: $f"; else echo "PORTAR:   $f"; fi
done
git stash pop
```

Esperado: `COPIAVEL` para os quatro primeiros, `PORTAR` para `content.js`.

- [ ] **Step 2: Copiar os arquivos idênticos**

```bash
cd "F:/PYTHON/Extensão Chrome Notas PAT"
cp inss-notas-extensao/lib/quota.js      inss-notas-extensao-firefox/lib/quota.js
cp inss-notas-extensao/lib/storage.js    inss-notas-extensao-firefox/lib/storage.js
cp inss-notas-extensao/popup/popup.js    inss-notas-extensao-firefox/popup/popup.js
cp inss-notas-extensao/stdtexts/stdtexts.js inss-notas-extensao-firefox/stdtexts/stdtexts.js
cp inss-notas-extensao/background/background.js inss-notas-extensao-firefox/background/background.js
```

O Firefox suporta o namespace `chrome.*` por compatibilidade, então esses arquivos funcionam sem tradução.

- [ ] **Step 3: Portar as mudanças de `content.js` manualmente**

Aplicar **apenas** a alteração da Task 8 em `inss-notas-extensao-firefox/content/content.js`, preservando as diferenças específicas do Firefox (o `insertTextIntoDraftEditor` assíncrono via clipboard, o `browser.*`, o tratamento de overflow). Localizar o `.catch` de `saveNoteForProtocolo` e aplicar o mesmo bloco do Step 2 da Task 8, mais o helper `atualizarStickyAposFallback`.

**Não copiar o arquivo inteiro do Chrome** — isso reverteria correções específicas do Firefox.

- [ ] **Step 4: Atualizar manifest e HTMLs do Firefox**

Em `inss-notas-extensao-firefox/manifest.json`, adicionar `lib/quota.js` antes de `lib/storage.js` no `content_scripts.js` e bump da versão para `1.4.0`. Nos HTMLs do popup e de textos padrão, adicionar `<script src="../lib/quota.js"></script>` antes do `storage.js`.

- [ ] **Step 5: Verificar no Firefox**

Carregar via `about:debugging` > "Este Firefox" > "Carregar extensão temporária" > selecionar `manifest.json`. No console, rodar o harness e repetir os testes das Tasks 3, 4 e 5.
Esperado: mesmos resultados do Chrome.

- [ ] **Step 6: Confirmar que o diff do Firefox continua só no esperado**

```bash
cd "F:/PYTHON/Extensão Chrome Notas PAT"
diff inss-notas-extensao/content/content.js inss-notas-extensao-firefox/content/content.js | grep -c "^[<>]"
```

Esperado: próximo de 58 (as diferenças pré-existentes preservadas), **não** 0 e **não** um número muito maior.

- [ ] **Step 7: Commit**

```bash
git add inss-notas-extensao-firefox/
git commit -m "feat: porta sincronizacao via storage.sync para o Firefox

content.js portado manualmente para preservar as diferencas
especificas do Firefox; demais arquivos sao identicos ao Chrome.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 10: Verificação fim-a-fim e bump de versão

**Files:**
- Modify: `inss-notas-extensao/manifest.json` (version 1.4.0)
- Modify: `inss-notas-extensao/background/background.js:348` (string de log da versão)

- [ ] **Step 1: Simular um usuário existente sendo atualizado**

Este é o cenário que mais importa: ninguém pode perder nada.

```javascript
await NotasPatTest.reset();
const antes = {};
for (let i = 0; i < 40; i++) {
  antes[`note_70${i}`] = { id:`70${i}`, text:`nota real ${i}`, color:'#fff8c6', tags:[],
                           reminder:null, createdAt:'2026-01-01T00:00:00.000Z',
                           updatedAt:new Date(2026, 0, i+1).toISOString() };
}
antes.standard_texts = [{ id:'st_1', title:'Modelo', text:'x'.repeat(60), createdAt:'2026-01-01T00:00:00.000Z', updatedAt:'2026-01-01T00:00:00.000Z' }];
await new Promise(r => chrome.storage.local.set(antes, r));

await migrateNotesToSync();

const todas = await getAllNotes();
NotasPatTest.assertEquals('as 40 notas continuam acessiveis', Object.keys(todas).length, 40);
const textos = await getStandardTexts();
NotasPatTest.assertEquals('texto padrao preservado', textos.length, 1);
NotasPatTest.assertEquals('conteudo intacto', todas['705'].text, 'nota real 5');
NotasPatTest.report();
```

Esperado: `=== 3/3 passaram ===`. **Se qualquer uma falhar, parar e investigar** — significa risco de perda de dados real.

- [ ] **Step 2: Verificar o ciclo completo na interface**

Com a extensão recarregada e o portal INSS aberto:
1. Criar uma nota nova → aparece o sticky, sem erro
2. Editar a nota pelo popup → altera corretamente
3. Excluir a nota → some e **não volta** ao recarregar a página
4. Criar um texto padrão → salva e aparece na lista
5. Verificar no console: `await chrome.storage.sync.get(null)` mostra as chaves `note_*`

- [ ] **Step 3: Verificar sincronização real entre dois computadores**

Este é o objetivo do projeto e nenhum teste de console substitui.

1. No PC A (logado com conta Google, sync ativo): criar uma nota no protocolo de teste
2. Aguardar ~30 segundos
3. No PC B (mesma conta Google): abrir o portal INSS
4. Esperado: **a nota aparece no PC B**

Se não aparecer, checar em `chrome://settings/syncSetup` se "Extensões" está marcado na sincronização.

- [ ] **Step 4: Bump de versão**

Em `inss-notas-extensao/manifest.json` e `inss-notas-extensao-firefox/manifest.json`: `"version": "1.4.0"`.
Em `background/background.js` (ambas as builds), atualizar a string final de log para `v1.4.0`.

- [ ] **Step 5: Limpar o storage de teste**

```javascript
await NotasPatTest.reset();
```

- [ ] **Step 6: Commit**

```bash
git add inss-notas-extensao/manifest.json inss-notas-extensao-firefox/manifest.json inss-notas-extensao/background/background.js inss-notas-extensao-firefox/background/background.js
git commit -m "chore: bump para v1.4.0 (sincronizacao entre computadores)

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Checklist final antes do release

- [ ] Notas criadas no PC A aparecem no PC B com a mesma conta Google
- [ ] Nenhum usuário existente precisou recadastrar nota ou texto padrão
- [ ] Nota excluída não reaparece após recarregar
- [ ] Com o sync cheio, o aviso específico aparece (não o genérico "Erro ao salvar nota") e a nota continua salva
- [ ] Nota em fallback sobe para o sync sozinha depois de liberar espaço
- [ ] Aviso de 70% aparece antes do bloqueio
- [ ] Chrome e Firefox se comportam igual
- [ ] `test/manual-harness.js` **não** entra no ZIP de release
- [ ] Versão 1.4.0 nos dois manifests
