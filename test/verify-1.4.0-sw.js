/**
 * Verificacao da v1.4.0 - PARTE 1/2: service worker
 * ---------------------------------------------------------------
 * NAO faz parte do build. Nao entra no ZIP de release.
 *
 * ONDE COLAR: console do SERVICE WORKER
 *   chrome://extensions/ > card do NotasPat > "service worker"
 *   Se o Chrome pedir, digite "allow pasting" antes de colar.
 *
 * Esperado: 14/14.
 *   - Se D1/D2/D3 falharem, PARAR: ha risco de perda de dados.
 *   - No Bloco A5 deve ter aparecido uma notificacao do NotasPat COM o
 *     icone verde. Sem icone = o caminho do icone ainda esta errado.
 *
 * Rode uma unica vez por sessao do service worker.
 *
 * Por que e so isso: este console NAO tem lib/storage.js (o background.js
 * tem os proprios helpers de leitura). O CRUD de verdade roda no outro
 * arquivo, test/verify-1.4.0-ui.js, colado no console do POPUP.
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
    // os blocos, nao so o ultimo. Limpar fazia o resumo do fim mostrar "3/3"
    // apos 14 asserts e, pior, sumiria com qualquer FALHOU anterior.
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
  console.log('[NotasPat][TESTE] ===== PARTE 1/2 (service worker) =====');

  // =========================================================
  // BLOCO A — Task 7: migracao local -> sync
  // =========================================================
  console.log('[NotasPat][TESTE] --- Bloco A: migracao ---');
  await NotasPatTest.reset();

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
  await migrateNotesToSync();
  const sync2 = await new Promise(r => chrome.storage.sync.get(null, r));
  const local2 = await new Promise(r => chrome.storage.local.get(null, r));
  const totalSync = Object.keys(sync2).filter(k => k.startsWith('note_')).length;
  const totalLocal = Object.keys(local2).filter(k => k.startsWith('note_')).length;
  NotasPatTest.assertEquals('A7 nenhuma nota perdida nem duplicada', totalSync + totalLocal, 30);

  // Guard de recencia
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
  // BLOCO D — Task 10: usuario existente nao perde dados (CRITICO)
  // Conferido direto no storage: este console nao tem lib/storage.js.
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

  const dSync = await new Promise(r => chrome.storage.sync.get(null, r));
  const dLocal = await new Promise(r => chrome.storage.local.get(null, r));
  const qtdSync = Object.keys(dSync).filter(k => k.startsWith('note_')).length;
  const qtdLocal = Object.keys(dLocal).filter(k => k.startsWith('note_')).length;
  NotasPatTest.assertEquals('D1 as 40 notas continuam acessiveis', qtdSync + qtdLocal, 40);
  NotasPatTest.assert('D2 texto padrao preservado', Array.isArray(dSync.standard_texts) && dSync.standard_texts.length === 1);
  NotasPatTest.assertEquals('D3 conteudo intacto', dSync.note_705 && dSync.note_705.text, 'nota real 5');
  console.log('[NotasPat][TESTE]     esperado no Bloco D: 3/3');
  console.log('[NotasPat][TESTE]     *** SE D1/D2/D3 FALHAREM, PARAR: ha risco de perda de dados ***');

  // =========================================================
  // BLOCO E — lembretes continuam funcionando apos a migracao
  // (antes da correcao, setReminderForNote lia so de local e nao
  //  achava a nota, que ja mora no sync: o lembrete sumia em silencio)
  // =========================================================
  console.log('[NotasPat][TESTE] --- Bloco E: lembretes ---');
  await NotasPatTest.reset();

  await new Promise(r => chrome.storage.sync.set({
    note_999: {
      id: '999', text: 'so no sync', color: '#fff8c6', tags: [], reminder: null,
      createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2030-01-01T00:00:00.000Z'
    }
  }, r));

  await setReminderForNote('999', '2030-06-01T12:00:00.000Z');

  const eSync = await new Promise(r => chrome.storage.sync.get(['note_999'], r));
  NotasPatTest.assertEquals('E1 lembrete gravado em nota que so existe no sync',
    eSync.note_999 && eSync.note_999.reminder, '2030-06-01T12:00:00.000Z');

  const alarmes = await chrome.alarms.getAll();
  NotasPatTest.assert('E2 alarme do lembrete criado', alarmes.some(a => a.name === 'reminder_999'));

  const urlIcone = chrome.runtime.getURL('icons/icon128.png');
  NotasPatTest.assert('E3 icone resolve para a raiz da extensao',
    urlIcone.endsWith('/icons/icon128.png') && !urlIcone.includes('/background/'));
  console.log('[NotasPat][TESTE]     esperado no Bloco E: 3/3');

  NotasPatTest.report();
  console.log('[NotasPat][TESTE] ===== FIM parte 1 (total esperado: 14/14) =====');
  console.log('[NotasPat][TESTE] Proximo: clique direito no icone da extensao > Inspect popup > cole test/verify-1.4.0-ui.js');
})();
