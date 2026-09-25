/**
 * Verificacao manual da v1.4.0 (sincronizacao entre computadores)
 * ---------------------------------------------------------------
 * NAO faz parte do build. Nao entra no ZIP de release.
 *
 * COMO RODAR:
 *   1. Carregue a extensao em chrome://extensions/ (Developer mode > Load unpacked)
 *      selecionando a pasta inss-notas-extensao/
 *   2. Clique em "service worker" no card da extensao para abrir o console
 *   3. Cole o conteudo de test/manual-harness.js e pressione Enter
 *   4. Cole o conteudo deste arquivo e pressione Enter
 *   5. No fim, rode NotasPatTest.report() se quiser o resumo
 *
 * Ao final de cada bloco ha o resultado esperado.
 */

(async function () {
  console.log('[NotasPat][TESTE] ===== VERIFICACAO v1.4.0 =====');

  // =========================================================
  // BLOCO A — Task 7: migracao local -> sync
  // =========================================================
  console.log('[NotasPat][TESTE] --- Bloco A: migracao ---');
  await NotasPatTest.reset();

  // Simular usuario existente: notas so em local, com datas diferentes
  await new Promise(r => chrome.storage.local.set({
    note_antiga: { id: 'antiga', text: 'de 2020', updatedAt: '2020-01-01T00:00:00.000Z', createdAt: '2020-01-01T00:00:00.000Z' },
    note_recente: { id: 'recente', text: 'de 2030', updatedAt: '2030-01-01T00:00:00.000Z', createdAt: '2030-01-01T00:00:00.000Z' }
  }, r));

  const res = await migrateNotesToSync();
  NotasPatTest.assertEquals('A1 as duas migraram', res.migradas, 2);

  const noSync = await new Promise(r => chrome.storage.sync.get(null, r));
  NotasPatTest.assert('A2 recente esta no sync', !!noSync.note_recente);
  NotasPatTest.assert('A3 antiga esta no sync', !!noSync.note_antiga);

  const noLocal = await new Promise(r => chrome.storage.local.get(null, r));
  NotasPatTest.assert('A4 local foi esvaziado das migradas', !noLocal.note_recente && !noLocal.note_antiga);

  // Nada se perde quando o sync esta cheio
  await NotasPatTest.reset();
  await NotasPatTest.fillSyncTo(100000);
  await new Promise(r => chrome.storage.local.set({ note_naocabe: { id: 'naocabe', text: 'fico local', updatedAt: '2030-01-01T00:00:00.000Z' } }, r));
  const res2 = await migrateNotesToSync();
  NotasPatTest.assertEquals('A5 contabilizou nao migrada', res2.naoMigradas, 1);
  const sobrou = await new Promise(r => chrome.storage.local.get(['note_naocabe'], r));
  NotasPatTest.assert('A6 nota que nao coube NAO foi perdida', !!sobrou.note_naocabe);
  await NotasPatTest.clearFill();

  // Idempotencia: rodar 2x nao perde nem duplica
  await NotasPatTest.reset();
  const muitas = {};
  for (let i = 0; i < 30; i++) {
    muitas[`note_9${i}`] = { id: `9${i}`, text: `nota ${i}`, updatedAt: new Date(2030, 0, i + 1).toISOString() };
  }
  await new Promise(r => chrome.storage.local.set(muitas, r));
  await migrateNotesToSync();
  await migrateNotesToSync(); // 2a passada
  const sync2 = await new Promise(r => chrome.storage.sync.get(null, r));
  const local2 = await new Promise(r => chrome.storage.local.get(null, r));
  const totalSync = Object.keys(sync2).filter(k => k.startsWith('note_')).length;
  const totalLocal = Object.keys(local2).filter(k => k.startsWith('note_')).length;
  NotasPatTest.assertEquals('A7 nenhuma nota perdida nem duplicada', totalSync + totalLocal, 30);

  // Guard de recencia: migracao interrompida nao regride dado mais novo do sync
  await NotasPatTest.reset();
  await new Promise(r => chrome.storage.sync.set({
    note_x: { id: 'x', text: 'sync novo', updatedAt: '2030-01-01T00:00:00.000Z' }
  }, r));
  await new Promise(r => chrome.storage.local.set({
    note_x: { id: 'x', text: 'local velho', updatedAt: '2020-01-01T00:00:00.000Z' }
  }, r));
  await migrateNotesToSync();
  const sync3 = await new Promise(r => chrome.storage.sync.get(['note_x'], r));
  NotasPatTest.assertEquals('A8 sync mais novo nao foi sobrescrito', sync3.note_x.text, 'sync novo');
  console.log('[NotasPat][TESTE]     esperado no Bloco A: 8/8');

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

  // =========================================================
  // BLOCO D — Task 10: usuario existente na atualizacao (CRITICO)
  // =========================================================
  console.log('[NotasPat][TESTE] --- Bloco D: dados reais preservados ---');
  await NotasPatTest.reset();
  const antesD = {};
  for (let i = 0; i < 40; i++) {
    antesD[`note_70${i}`] = {
      id: `70${i}`, text: `nota real ${i}`, color: '#fff8c6', tags: [],
      reminder: null, createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: new Date(2026, 0, i + 1).toISOString()
    };
  }
  antesD.standard_texts = [{ id: 'st_1', title: 'Modelo', text: 'x'.repeat(60), createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }];
  await new Promise(r => chrome.storage.local.set(antesD, r));

  await migrateNotesToSync();

  const todasD = await getAllNotes();
  NotasPatTest.assertEquals('D1 as 40 notas continuam acessiveis', Object.keys(todasD).length, 40);
  const textosD = await getStandardTexts();
  NotasPatTest.assertEquals('D2 texto padrao preservado', textosD.length, 1);
  NotasPatTest.assertEquals('D3 conteudo intacto', todasD['705'].text, 'nota real 5');
  console.log('[NotasPat][TESTE]     esperado no Bloco D: 3/3');
  console.log('[NotasPat][TESTE]     *** SE D1/D2/D3 FALHAREM, PARAR: ha risco de perda de dados ***');

  // =========================================================
  // RESUMO
  // =========================================================
  NotasPatTest.report();
  console.log('[NotasPat][TESTE] ===== FIM (total esperado: 28/28) =====');
})();
