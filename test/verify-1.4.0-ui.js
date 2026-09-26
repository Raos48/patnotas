/**
 * Verificacao da v1.4.0 - PARTE 2/2: popup
 * ---------------------------------------------------------------
 * NAO faz parte do build. Nao entra no ZIP de release.
 *
 * ONDE COLAR: console do POPUP
 *   1. Clique com o botao direito no icone do NotasPat na barra
 *   2. "Inspecionar popup" (Inspect popup)
 *   3. Aba Console, cole este arquivo todo e de Enter
 *   Se pedir, digite "allow pasting" antes.
 *
 * Esperado: 17/17.
 *
 * Rode uma unica vez por sessao do popup.
 *
 * Por que em outro console: saveNote/getAllNotes/deleteCheck vivem em
 * lib/storage.js, que carrega no popup e no content script, mas NAO no
 * service worker. A migracao em si foi testada no
 * test/verify-1.4.0-sw.js (console do service worker).
 */

const NotasPatTest = {
  results: [],
  _backup: null,

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

  async backup() {
    const [sync, local] = await Promise.all([
      new Promise(r => chrome.storage.sync.get(null, r)),
      new Promise(r => chrome.storage.local.get(null, r))
    ]);
    const pacote = { quando: new Date().toISOString(), sync, local };
    console.log('[NotasPat][TESTE] === BACKUP - copie e guarde a proxima linha se houver dados reais ===');
    console.log(JSON.stringify(pacote));
    return pacote;
  },

  async restore(pacote) {
    if (typeof pacote === 'string') pacote = JSON.parse(pacote);
    await new Promise(r => chrome.storage.sync.clear(r));
    await new Promise(r => chrome.storage.local.clear(r));
    if (pacote.sync && Object.keys(pacote.sync).length) {
      await new Promise(r => chrome.storage.sync.set(pacote.sync, r));
    }
    if (pacote.local && Object.keys(pacote.local).length) {
      await new Promise(r => chrome.storage.local.set(pacote.local, r));
    }
    console.log('[NotasPat][TESTE] Backup restaurado');
    return true;
  },

  async reset() {
    if (!this._backup) this._backup = await this.backup();
    await new Promise(r => chrome.storage.sync.clear(r));
    await new Promise(r => chrome.storage.local.clear(r));
    // Nao limpar this.results aqui: o report() do fim precisa enxergar todos
    // os blocos, nao so o ultimo. Limpar fazia o resumo do fim mostrar "4/4"
    // apos 17 asserts e, pior, sumiria com qualquer FALHOU anterior.
    console.log('[NotasPat][TESTE] Storage limpo (sync + local). Desfazer: NotasPatTest.restore(NotasPatTest._backup)');
  },

  async fillSyncTo(bytes) {
    const gravar = obj => new Promise(r => chrome.storage.sync.set(obj, () => r(!chrome.runtime.lastError)));
    const filler = 'x'.repeat(7000);
    let escrito = 0, i = 0;
    while (escrito < bytes) {
      const chave = `__fill_${i++}`;
      if (!(await gravar({ [chave]: filler }))) {
        const quota = chrome.storage.sync.QUOTA_BYTES || 102400;
        const emUso = await new Promise(r => chrome.storage.sync.getBytesInUse(null, r));
        const resto = quota - emUso - chave.length - 2;
        if (resto > 0) await gravar({ [chave]: 'x'.repeat(resto) });
        break;
      }
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

(async function () {
  console.log('[NotasPat][TESTE] ===== PARTE 2/2 (popup) =====');

  // =========================================================
  // BLOCO B — Tasks 3/4/5: escrita, leitura e exclusao nos 2 namespaces
  // =========================================================
  console.log('[NotasPat][TESTE] --- Bloco B: CRUD ---');
  await NotasPatTest.reset();

  const n = await saveNote('111', 'teste', '#fff8c6', []);
  NotasPatTest.assertEquals('B1 nota salva tem o texto', n.text, 'teste');
  const noSyncB = await new Promise(r => chrome.storage.sync.get(['note_111'], r));
  NotasPatTest.assert('B2 nota foi para o sync', !!noSyncB.note_111);

  // Fallback: sync cheio -> vai para local e NAO se perde
  await NotasPatTest.fillSyncTo(100000);
  let capturado = null;
  try { await saveNote('222', 'cai no fallback', '#fff8c6', []); } catch (e) { capturado = e; }
  NotasPatTest.assert('B3 erro de quota lancado', capturado && capturado.code === 'QUOTA_EXCEEDED');
  const noLocalB = await new Promise(r => chrome.storage.local.get(['note_222'], r));
  NotasPatTest.assert('B4 nota NAO foi perdida (esta em local)', !!noLocalB.note_222);
  NotasPatTest.assert('B5 marcada como fallback', noLocalB.note_222._syncFallback === true);
  await NotasPatTest.clearFill();

  // createdAt preservado ao editar
  await NotasPatTest.reset();
  await saveNote('333', 'primeira versao', '#fff8c6', []);
  const original = await new Promise(r => chrome.storage.sync.get(['note_333'], r));
  const criadoEm = original.note_333.createdAt;
  await new Promise(r => setTimeout(r, 20));
  await saveNote('333', 'segunda versao', '#fff8c6', []);
  const editada = await new Promise(r => chrome.storage.sync.get(['note_333'], r));
  NotasPatTest.assertEquals('B6 createdAt preservado ao editar', editada.note_333.createdAt, criadoEm);
  NotasPatTest.assert('B7 updatedAt avancou', editada.note_333.updatedAt > criadoEm);

  // Merge por recencia
  await NotasPatTest.reset();
  await new Promise(r => chrome.storage.sync.set({ note_333: { id: '333', text: 'antiga', updatedAt: '2020-01-01T00:00:00.000Z' } }, r));
  await new Promise(r => chrome.storage.local.set({ note_333: { id: '333', text: 'nova', updatedAt: '2030-01-01T00:00:00.000Z', _syncFallback: true } }, r));
  const todas = await getAllNotes();
  NotasPatTest.assertEquals('B8 vence a versao mais recente', todas['333'].text, 'nova');

  await NotasPatTest.reset();
  await new Promise(r => chrome.storage.sync.set({ note_444: { id: '444', text: 'sync novo', updatedAt: '2030-01-01T00:00:00.000Z' } }, r));
  await new Promise(r => chrome.storage.local.set({ note_444: { id: '444', text: 'local velho', updatedAt: '2020-01-01T00:00:00.000Z', _syncFallback: true } }, r));
  const todas2 = await getAllNotes();
  NotasPatTest.assertEquals('B9 vence o sync quando mais recente', todas2['444'].text, 'sync novo');
  await new Promise(r => setTimeout(r, 300));
  const sobrouB = await new Promise(r => chrome.storage.local.get(['note_444'], r));
  NotasPatTest.assert('B10 copia local obsoleta foi limpa', !sobrouB.note_444);

  // Auto-recuperacao do fallback
  await NotasPatTest.reset();
  await NotasPatTest.fillSyncTo(100000);
  try { await saveNote('555', 'presa no local', '#fff8c6', []); } catch (e) { }
  const antes = await new Promise(r => chrome.storage.local.get(['note_555'], r));
  NotasPatTest.assert('B11 ficou em local enquanto cheio', !!antes.note_555);
  await NotasPatTest.clearFill();
  await getAllNotes(); // dispara a promocao
  await new Promise(r => setTimeout(r, 500));
  const noSyncB2 = await new Promise(r => chrome.storage.sync.get(['note_555'], r));
  NotasPatTest.assert('B12 subiu para o sync sozinha', !!noSyncB2.note_555);

  // Exclusao nos dois namespaces
  await NotasPatTest.reset();
  await new Promise(r => chrome.storage.sync.set({ note_666: { id: '666', text: 'no sync', updatedAt: '2030-01-01T00:00:00.000Z' } }, r));
  await new Promise(r => chrome.storage.local.set({ note_666: { id: '666', text: 'no local', updatedAt: '2029-01-01T00:00:00.000Z', _syncFallback: true } }, r));
  await deleteNote('666');
  const todas3 = await getAllNotes();
  NotasPatTest.assert('B13 nota excluida nao ressuscita', !todas3['666']);
  console.log('[NotasPat][TESTE]     esperado no Bloco B: 13/13');

  // =========================================================
  // BLOCO C — Task 6: textos padrao + saude do storage
  // =========================================================
  console.log('[NotasPat][TESTE] --- Bloco C: textos padrao ---');
  await NotasPatTest.reset();
  const s1 = await checkStorageHealth();
  NotasPatTest.assert('C1 vazio esta saudavel', s1.ok === true);
  NotasPatTest.assert('C2 reporta percentUsed', typeof s1.percentUsed === 'number');
  await NotasPatTest.fillSyncTo(75000); // ~73% de 102400
  const s2 = await checkStorageHealth();
  NotasPatTest.assert('C3 avisa acima de 70%', s2.ok === false && !!s2.warning);
  await NotasPatTest.clearFill();

  await saveStandardText('Titulo teste', 'x'.repeat(50));
  const noSyncC = await new Promise(r => chrome.storage.sync.get(['standard_texts'], r));
  NotasPatTest.assert('C4 textos padrao vao para o sync', Array.isArray(noSyncC.standard_texts) && noSyncC.standard_texts.length === 1);
  console.log('[NotasPat][TESTE]     esperado no Bloco C: 4/4');

  NotasPatTest.report();
  console.log('[NotasPat][TESTE] ===== FIM parte 2 (total esperado: 17/17) =====');
  console.log('[NotasPat][TESTE] Ao terminar as duas partes: NotasPatTest.restore(NotasPatTest._backup) se quiser os dados de volta.');
})();
