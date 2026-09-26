/**
 * Verificacao da v1.4.0 - PARTE 1/2: service worker
 * ---------------------------------------------------------------
 * NAO faz parte do build. Nao entra no ZIP de release.
 *
 * ONDE COLAR: console do SERVICE WORKER
 *   chrome://extensions/ > card do NotasPat > "service worker"
 *   Se o Chrome pedir, digite "allow pasting" antes de colar.
 *
 * Esperado: 24/24.
 *   - Se D1/D2/D3/D4/D5/D5b falharem, PARAR: ha risco de perda de dados.
 *   - O Bloco A NAO mostra notificacao: migrateNotesToSync() chamada direto
 *     (como o teste faz) usa notificar:false por padrao - so onInstalled
 *     passa true, para nao repetir o aviso a cada cold start do worker.
 *     O icone das notificacoes foi verificado manualmente antes (ver commit
 *     6d3b55e); nao ha mais um jeito facil de forcar uma notificacao real
 *     aqui sem tambem forcar um onInstalled.
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
  // Guarda de contexto: no console errado (popup, pagina do portal)
  // este arquivo falharia no meio do teste com ReferenceError.
  const ctx = {
    temWindow: typeof window !== 'undefined',
    temMigracao: typeof migrateNotesToSync === 'function',
    temSaveNote: typeof saveNote === 'function',
    titulo: (typeof document !== 'undefined' && document && document.title) || '(sem document)'
  };
  if (!ctx.temMigracao) {
    console.error('[NotasPat][TESTE] PARE - este console NAO e o do service worker. Nada foi alterado.');
    console.error('[NotasPat][TESTE] Onde voce esta: ' + JSON.stringify(ctx));
    if (ctx.temSaveNote) {
      console.error('[NotasPat][TESTE] -> CONSOLE DO POPUP (tem saveNote, nao tem migrateNotesToSync).');
    } else if (ctx.temWindow) {
      console.error('[NotasPat][TESTE] -> Pagina sem background carregado.');
    } else {
      console.error('[NotasPat][TESTE] -> Contexto desconhecido.');
    }
    console.error('[NotasPat][TESTE] COMO ABRIR O CONSOLE CERTO:');
    console.error('[NotasPat][TESTE]   chrome://extensions/ > card do NotasPat > link "service worker"');
    console.error('[NotasPat][TESTE]   Teste de sanidade la dentro: typeof migrateNotesToSync === "function"');
    return;
  }

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

  // Nota que ja estava em fallback (marcada de uma migracao anterior que nao
  // coube) e agora cabe: a marca _syncFallback NAO pode vazar para o sync
  // (bug encontrado em revisao - toda outra nota gravada no sync usa
  // withoutSyncFallback antes; a migracao gravava a nota como leu, marca
  // inclusive).
  await NotasPatTest.reset();
  await new Promise(r => chrome.storage.local.set({
    note_y: { id: 'y', text: 'ja em fallback', updatedAt: '2030-01-01T00:00:00.000Z', _syncFallback: true }
  }, r));
  await migrateNotesToSync();
  const sync4 = await new Promise(r => chrome.storage.sync.get(['note_y'], r));
  NotasPatTest.assert('A9 marca _syncFallback nao vaza para o sync', sync4.note_y && sync4.note_y._syncFallback !== true);

  // Snapshot pre-migracao: rede de seguranca contra o caso em que este
  // Chrome ainda nao baixou o sync de outro PC quando a migracao roda (o
  // sync do Chrome chega em segundo plano, de forma assincrona - nem o
  // guard de recencia nem o merge de textos ajudam se o dado do outro PC
  // simplesmente ainda nao chegou aqui). Existe apos a 1a migracao e NAO e
  // sobrescrito por uma 2a (senao a 2a chamada apagaria o snapshot da 1a
  // e a rede de seguranca perderia o sentido).
  await NotasPatTest.reset();
  await new Promise(r => chrome.storage.local.set({
    note_snap: { id: 'snap', text: 'para o snapshot', updatedAt: '2030-01-01T00:00:00.000Z' }
  }, r));
  await migrateNotesToSync();
  const snap1 = await new Promise(r => chrome.storage.local.get(['premigracao_1_4_0'], r));
  NotasPatTest.assert('A10 snapshot pre-migracao existe e guarda a nota original',
    snap1.premigracao_1_4_0 && snap1.premigracao_1_4_0.notas && !!snap1.premigracao_1_4_0.notas.note_snap);
  await migrateNotesToSync(); // 2a passada nao deve mexer no snapshot
  const snap2 = await new Promise(r => chrome.storage.local.get(['premigracao_1_4_0'], r));
  NotasPatTest.assertEquals('A11 snapshot nao e sobrescrito por uma 2a migracao',
    snap2.premigracao_1_4_0 && snap2.premigracao_1_4_0.quando, snap1.premigracao_1_4_0.quando);

  console.log('[NotasPat][TESTE]     esperado no Bloco A: 11/11');

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

  // Dois PCs, cada um com seus proprios textos padrao locais (nenhum viu o
  // sync do outro ainda): o PRIMEIRO a atualizar sobe os seus. O SEGUNDO,
  // ao atualizar, tem que mesclar com o que ja esta no sync - nao descartar
  // os proprios so porque "ja existe algo la" (bug encontrado em revisao).
  await new Promise(r => chrome.storage.sync.set({
    standard_texts: [{ id: 'pc1_texto', title: 'Do PC 1', text: 'y'.repeat(40), createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }]
  }, r));
  await new Promise(r => chrome.storage.local.set({
    standard_texts: [{ id: 'pc2_texto', title: 'Do PC 2', text: 'z'.repeat(40), createdAt: '2026-02-01T00:00:00.000Z', updatedAt: '2026-02-01T00:00:00.000Z' }]
  }, r));
  await migrateNotesToSync();
  const dSync2 = await new Promise(r => chrome.storage.sync.get(['standard_texts'], r));
  const idsTextos = (dSync2.standard_texts || []).map(t => t.id);
  NotasPatTest.assert('D4 textos padrao de dois PCs sao mesclados, nenhum se perde',
    idsTextos.includes('pc1_texto') && idsTextos.includes('pc2_texto'));

  // Mesmo cenario de D4, mas a uniao dos dois PCs NAO cabe em 8KB (bug
  // encontrado em revisao: se a gravacao da uniao falhar, local tem que
  // ficar com a UNIAO, nao so com os textos deste PC - senao os do outro
  // PC, que so existiam no sync, desapareceriam da UI deste PC e o proximo
  // salvamento aqui os apagaria tambem do sync).
  await NotasPatTest.reset();
  await new Promise(r => chrome.storage.sync.set({
    standard_texts: [{ id: 'pc1_grande', title: 'Grande do PC 1', text: 'w'.repeat(5000), createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }]
  }, r));
  await new Promise(r => chrome.storage.local.set({
    standard_texts: [{ id: 'pc2_grande', title: 'Grande do PC 2', text: 'z'.repeat(5000), createdAt: '2026-02-01T00:00:00.000Z', updatedAt: '2026-02-01T00:00:00.000Z' }]
  }, r));
  await migrateNotesToSync();
  const dLocalUniao = await new Promise(r => chrome.storage.local.get(['standard_texts'], r));
  const dSyncUniao = await new Promise(r => chrome.storage.sync.get(['standard_texts'], r));
  const idsLocalUniao = (dLocalUniao.standard_texts || []).map(t => t.id);
  NotasPatTest.assert('D5 uniao que nao cabe fica em local (nao so os textos deste PC)',
    idsLocalUniao.includes('pc1_grande') && idsLocalUniao.includes('pc2_grande'));
  NotasPatTest.assert('D5b sync mantem sua versao anterior intacta (nao apagou pc1_grande)',
    (dSyncUniao.standard_texts || []).some(t => t.id === 'pc1_grande'));

  console.log('[NotasPat][TESTE]     esperado no Bloco D: 6/6');
  console.log('[NotasPat][TESTE]     *** SE D1/D2/D3/D4/D5/D5b FALHAREM, PARAR: ha risco de perda de dados ***');

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

  // =========================================================
  // BLOCO F — lote unico de gravacoes (nao 1 write por nota)
  // Cada chrome.storage.sync.set() conta 1 write contra o limite de
  // 120/minuto. onInstalled e o cold-start podem disparar quase juntos
  // (ver log do proprio carregamento acima: duas linhas de "Migracao para
  // sync" seguidas); sem lote nem fila, ~60 notas reais bastariam para
  // estourar o limite numa atualizacao normal. Conta as chamadas reais.
  // =========================================================
  console.log('[NotasPat][TESTE] --- Bloco F: lote unico + fila ---');
  await NotasPatTest.reset();
  const muitasF = {};
  for (let i = 0; i < 100; i++) {
    muitasF[`note_f${i}`] = { id: `f${i}`, text: `nota ${i}`, updatedAt: new Date(2030, 0, i + 1).toISOString() };
  }
  await new Promise(r => chrome.storage.local.set(muitasF, r));

  let chamadasSet = 0;
  const setOriginal = chrome.storage.sync.set.bind(chrome.storage.sync);
  chrome.storage.sync.set = function (...args) { chamadasSet++; return setOriginal(...args); };
  // Confirma que a substituicao pegou ANTES de confiar em chamadasSet: em
  // modo nao-estrito uma atribuicao que falhasse silenciosamente deixaria
  // chamadasSet em 0 para sempre, e "0 <= 4" passaria sem testar nada.
  NotasPatTest.assert('F0 substituicao de sync.set esta ativa (pre-condicao do F1)', chrome.storage.sync.set !== setOriginal);
  let resultadosF;
  try {
    // Duas chamadas "ao mesmo tempo", como onInstalled e o cold-start
    // fariam na vida real - a fila deve serializar, nao dobrar as escritas.
    resultadosF = await Promise.all([migrateNotesToSync(), migrateNotesToSync({ notificar: true })]);
  } finally {
    chrome.storage.sync.set = setOriginal;
  }
  // Bloco F nao tem textos padrao, entao o lote de 100 notas e a UNICA
  // gravacao esperada: exatamente 1 chamada (nao 100, nao 0).
  NotasPatTest.assertEquals('F1 exatamente 1 chamada de sync.set para as 100 notas (nao 1 por nota)', chamadasSet, 1);
  const fSync = await new Promise(r => chrome.storage.sync.get(null, r));
  const fLocal = await new Promise(r => chrome.storage.local.get(null, r));
  const qtdSyncF = Object.keys(fSync).filter(k => k.startsWith('note_f')).length;
  const qtdLocalF = Object.keys(fLocal).filter(k => k.startsWith('note_f')).length;
  NotasPatTest.assertEquals('F2 as 100 notas continuam acessiveis (nenhuma perdida)', qtdSyncF + qtdLocalF, 100);
  NotasPatTest.assertEquals('F3 nenhuma sobrou nao migrada (100 notas cabem em 100KB)',
    resultadosF[0].naoMigradas + resultadosF[1].naoMigradas, 0);
  console.log('[NotasPat][TESTE]     esperado no Bloco F: 4/4 (chamadas de sync.set: ' + chamadasSet + ')');

  NotasPatTest.report();
  console.log('[NotasPat][TESTE] ===== FIM parte 1 (total esperado: 24/24) =====');
  console.log('[NotasPat][TESTE] Proximo: clique direito no icone da extensao > Inspect popup > cole test/verify-1.4.0-ui.js');
})();
