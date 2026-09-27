/**
 * Verificacao da v1.4.0 - PARTE 1/2: service worker
 * ---------------------------------------------------------------
 * NAO faz parte do build. Nao entra no ZIP de release.
 *
 * ONDE COLAR: console do SERVICE WORKER
 *   chrome://extensions/ > card do NotasPat > "service worker"
 *   Se o Chrome pedir, digite "allow pasting" antes de colar.
 *
 * Esperado: 37/37.
 *   - Se D1/D2/D3/D4/D5/D5b/D6/D6b/D7 falharem, PARAR: ha risco de perda de dados.
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
 *
 * GUARDA DE DADOS REAIS: reset() se RECUSA a limpar se encontrar qualquer
 * nota cujo protocolo pareca um protocolo real do PAT (5+ digitos, todos
 * numericos) ou standard_texts com titulo/id alem dos padroes de teste
 * conhecidos. Um "Load Temporary Add-on" no Firefox NAO e sandbox
 * descartavel - o manifest fixa gecko.id, entao esse carregamento
 * compartilha o MESMO storage.sync (e, com Conta Firefox + sync de
 * complementos ativado, o mesmo storage sincronizado entre computadores)
 * que a extensao publicada usaria neste perfil.
 */
function pareceDadoReal(local, sync) {
  const suspeitos = [];
  const verificar = (obj, origem) => {
    if (!obj) return;
    Object.keys(obj).forEach(chave => {
      if (!chave.startsWith('note_')) return;
      const protocolo = chave.substring('note_'.length);
      if (/^\d{5,}$/.test(protocolo)) suspeitos.push(`${origem}.${chave} (parece protocolo real)`);
    });
    if (Array.isArray(obj.standard_texts) && obj.standard_texts.length > 0) {
      const idsTeste = /^(st_1774|st_1790|texto_a_seed|pc1_|pc2_)/;
      const temTextoNaoTeste = obj.standard_texts.some(t => !idsTeste.test(t.id || ''));
      if (temTextoNaoTeste) suspeitos.push(`${origem}.standard_texts (titulo(s): ${obj.standard_texts.map(t => JSON.stringify(t.title)).join(', ')})`);
    }
  };
  verificar(local, 'local');
  verificar(sync, 'sync');
  return suspeitos;
}

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

  async reset(opcoes) {
    const forcar = opcoes && opcoes.confirmoApagarDadosReais === true;
    if (!this._backup) this._backup = await this.backup();

    if (this._resetCount === undefined) this._resetCount = 0;
    if (this._resetCount === 0 && !forcar) {
      const suspeitos = pareceDadoReal(this._backup.local, this._backup.sync);
      if (suspeitos.length > 0) {
        console.error('[NotasPat][TESTE] ==================================================');
        console.error('[NotasPat][TESTE] PARE - reset() RECUSOU apagar: isto parece dado REAL,');
        console.error('[NotasPat][TESTE] nao dado de teste. NADA foi alterado.');
        console.error('[NotasPat][TESTE] Encontrado:');
        suspeitos.forEach(s => console.error('[NotasPat][TESTE]   - ' + s));
        console.error('[NotasPat][TESTE] Se voce tem CERTEZA de que quer apagar mesmo assim,');
        console.error('[NotasPat][TESTE] rode: NotasPatTest.reset({ confirmoApagarDadosReais: true })');
        console.error('[NotasPat][TESTE] ==================================================');
        throw new Error('reset() recusado: storage parece conter dados reais (ver console)');
      }
    }
    this._resetCount++;

    await new Promise(r => chrome.storage.sync.clear(r));
    await new Promise(r => chrome.storage.local.clear(r));
    // Nao limpar this.results aqui: o report() do fim precisa enxergar todos
    // os blocos, nao so o ultimo. Limpar fazia o resumo do fim mostrar "3/3"
    // apos 14 asserts e, pior, sumiria com qualquer FALHOU anterior.
    console.log('[NotasPat][TESTE] Storage limpo (sync + local). Desfazer: NotasPatTest.restore(NotasPatTest._backup)');
  },

  // O calculo do "resto" e uma ESTIMATIVA (quota - emUso - overhead da
  // chave). Medido na pratica: o Chrome aceitou completar ate exatamente
  // 102400 bytes, mas o Firefox recusou entre 102392-102400 e so aceitou a
  // partir de 102336 - exige ~64 bytes de folga que o Chrome nao exige. Por
  // isso o resultado da gravacao do resto e checado e recuado ate caber, em
  // vez de assumir que sempre funciona.
  async fillSyncTo(bytes) {
    const gravar = obj => new Promise(r => chrome.storage.sync.set(obj, () => r(!chrome.runtime.lastError)));
    const filler = 'x'.repeat(7000);
    let escrito = 0, i = 0;
    while (escrito < bytes) {
      const chave = `__fill_${i++}`;
      if (!(await gravar({ [chave]: filler }))) {
        const quota = chrome.storage.sync.QUOTA_BYTES || 102400;
        const emUso = await new Promise(r => chrome.storage.sync.getBytesInUse(null, r));
        let resto = quota - emUso - chave.length - 2;
        while (resto > 0 && !(await gravar({ [chave]: 'x'.repeat(resto) }))) {
          resto -= 32;
        }
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
  const usoA5 = await NotasPatTest.fillSyncTo(100000);
  const notaNaocabe = { id: 'naocabe', text: 'fico local', updatedAt: '2030-01-01T00:00:00.000Z' };
  // Pre-condicao: se fillSyncTo nao deixou o sync cheio o bastante para a
  // propria nota do teste NAO caber, A5/A6 nao provam nada (a nota
  // simplesmente migraria com sucesso, e o teste passaria por acidente ou
  // falharia por um motivo que nao e o que se quer medir aqui). Isso ja
  // aconteceu na pratica antes do fix em fillSyncTo: o Firefox recusava a
  // gravacao do resto perto do teto exato, entao um fillSyncTo(100000)
  // parava em 98144 bytes (4256 de sobra) - espaco de sobra suficiente para
  // a nota pequena do teste caber e migrar mesmo assim, quando o objetivo
  // era testar exatamente o caso em que ela NAO cabe.
  const espacoLivreA5 = SYNC_QUOTA_BYTES_TOTAL - usoA5;
  const tamanhoNaocabe = getItemByteSize('note_naocabe', notaNaocabe);
  NotasPatTest.assert('A5-pre sync esta cheio o bastante para a nota do teste NAO caber',
    espacoLivreA5 < tamanhoNaocabe);
  await new Promise(r => chrome.storage.local.set({ note_naocabe: notaNaocabe }, r));
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

  // 2a passada com uma nota NOVA desde a 1a: prova que o snapshot nao e
  // sobrescrito (nem para incluir a nota nova) - se fosse, o snapshot
  // deixaria de representar fielmente o estado ANTES da 1a migracao.
  await new Promise(r => chrome.storage.local.set({
    note_snap2: { id: 'snap2', text: 'depois da 1a migracao', updatedAt: '2030-02-01T00:00:00.000Z' }
  }, r));
  await migrateNotesToSync();
  const snap2 = await new Promise(r => chrome.storage.local.get(['premigracao_1_4_0'], r));
  NotasPatTest.assertEquals('A11 snapshot nao e sobrescrito por uma 2a migracao (mesmo "quando")',
    snap2.premigracao_1_4_0 && snap2.premigracao_1_4_0.quando, snap1.premigracao_1_4_0.quando);
  NotasPatTest.assert('A12 snapshot nao ganha a nota criada depois da 1a migracao',
    snap2.premigracao_1_4_0 && !snap2.premigracao_1_4_0.notas.note_snap2);

  // Snapshot vencido (>30 dias) e removido e NUNCA recriado - so pode ser
  // criado uma vez, na primeira migracao (flag premigracao_1_4_0_criado).
  // Bug corrigido em revisao: a 1a versao recriava o snapshot toda vez que
  // ele vencesse, se o usuario ainda tivesse QUALQUER nota em local - o que
  // e permanente para quem tem notas presas em fallback (nunca cabem no
  // sync). Isso e exatamente o crescimento sem fim que a expiracao deveria
  // evitar.
  await NotasPatTest.reset();
  const quarentaDiasAtras = new Date(Date.now() - 40 * 86400000).toISOString();
  await new Promise(r => chrome.storage.local.set({
    premigracao_1_4_0: { quando: quarentaDiasAtras, notas: {}, standard_texts: [] },
    premigracao_1_4_0_criado: true,
    textosPadraoMigrados1_4_0: true,
    note_velha_fallback: { id: 'velha_fallback', text: 'presa em fallback', updatedAt: '2020-01-01T00:00:00.000Z', _syncFallback: true }
  }, r));
  await migrateNotesToSync();
  const snap3 = await new Promise(r => chrome.storage.local.get(['premigracao_1_4_0'], r));
  NotasPatTest.assert('A13 snapshot vencido e removido e NAO recriado', !snap3.premigracao_1_4_0);

  // Uma nota grande o bastante faria o snapshot (que copia local inteiro)
  // arriscar o teto de 10 MB do proprio storage.local do Chrome - o
  // snapshot tem que ser pulado nesse caso (bug corrigido em revisao: a
  // 1a versao nao tinha limite de tamanho nenhum).
  await NotasPatTest.reset();
  await new Promise(r => chrome.storage.local.set({
    note_grande: { id: 'grande', text: 'x'.repeat(3.5 * 1024 * 1024), updatedAt: '2030-01-01T00:00:00.000Z' }
  }, r));
  await migrateNotesToSync();
  const snap4 = await new Promise(r => chrome.storage.local.get(['premigracao_1_4_0', 'premigracao_1_4_0_criado', 'note_grande'], r));
  NotasPatTest.assert('A14 snapshot muito grande e pulado (nao arrisca o teto de 10MB)', !snap4.premigracao_1_4_0);
  NotasPatTest.assert('A14b flag de criacao marcada mesmo pulando (nunca mais tenta)', snap4.premigracao_1_4_0_criado === true);
  NotasPatTest.assert('A14c a nota grande em si nao foi tocada/perdida', !!snap4.note_grande);

  console.log('[NotasPat][TESTE]     esperado no Bloco A: 17/17');

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
  // reset() e obrigatorio aqui: o merge so roda na PRIMEIRA migracao (flag
  // textosPadraoMigrados1_4_0) - sem reset(), a chamada de D1/D2/D3 acima
  // ja teria consumido essa unica chance e D4 falharia por um motivo
  // errado (nao por o merge estar quebrado, so por ja ter rodado antes).
  await NotasPatTest.reset();
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

  // Cenario que o gate textosPadraoMigrados1_4_0 existe para evitar: DEPOIS
  // da migracao, local.standard_texts nao-vazio e o fallback normal do dia
  // a dia (storage.js.writeStandardTexts salvou local porque a uniao atual
  // nao coube no sync naquele momento) - NAO mais material bruto de dois
  // PCs pre-migracao. Sync ainda guarda uma versao anterior que inclui um
  // texto ('texto_b') que o usuario ja excluiu depois. Sem o gate, o merge
  // rodaria de novo neste cold start e ressuscitaria texto_b.
  await NotasPatTest.reset();
  await migrateNotesToSync(); // 1a migracao: storage vazio, so seta a flag
  await new Promise(r => chrome.storage.sync.set({
    standard_texts: [
      { id: 'texto_a', title: 'A', text: 'a'.repeat(40), createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
      { id: 'texto_b', title: 'B (sera excluido)', text: 'b'.repeat(40), createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }
    ]
  }, r));
  await new Promise(r => chrome.storage.local.set({
    standard_texts: [{ id: 'texto_a', title: 'A', text: 'a'.repeat(40), createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-03-01T00:00:00.000Z' }]
  }, r));
  await migrateNotesToSync(); // cold start seguinte, com o gate ja setado
  const usados = await new Promise(r => chrome.storage.local.get(['standard_texts'], r));
  const usadosSync = await new Promise(r => chrome.storage.sync.get(['standard_texts'], r));
  // getStandardTexts prefere local quando nao-vazio (ver lib/storage.js) -
  // e o que a UI de fato mostraria neste PC.
  const idsUsados = ((usados.standard_texts && usados.standard_texts.length ? usados : usadosSync).standard_texts || []).map(t => t.id);
  NotasPatTest.assert('D6 texto excluido apos a migracao NAO ressuscita (com o gate ativo)',
    idsUsados.includes('texto_a') && !idsUsados.includes('texto_b'));

  // Controle negativo: desarma o gate de proposito e roda a MESMA sequencia
  // - se D6 so passa por acaso (por nao testar nada), este controle nao
  // detectaria a ressurreicao. Prova que o teste sabe reconhecer o bug.
  await NotasPatTest.reset();
  await migrateNotesToSync();
  await new Promise(r => chrome.storage.sync.set({
    standard_texts: [
      { id: 'texto_a', title: 'A', text: 'a'.repeat(40), createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
      { id: 'texto_b', title: 'B (sera excluido)', text: 'b'.repeat(40), createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }
    ]
  }, r));
  await new Promise(r => chrome.storage.local.set({
    standard_texts: [{ id: 'texto_a', title: 'A', text: 'a'.repeat(40), createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-03-01T00:00:00.000Z' }]
  }, r));
  await chrome.storage.local.remove('textosPadraoMigrados1_4_0'); // desarma de proposito
  await migrateNotesToSync();
  const usadosSemGate = await new Promise(r => chrome.storage.sync.get(['standard_texts'], r));
  const idsSemGate = (usadosSemGate.standard_texts || []).map(t => t.id);
  NotasPatTest.assertEquals('D6b controle: sem o gate, texto_b de fato ressuscita', idsSemGate.includes('texto_b'), true);

  // D7: syncSetComRetryDeRate rejeitando (RATE) durante a mescla de textos
  // padrao nao pode apagar a copia local (bug corrigido em 0e8b4f7 - o
  // catch em volta da chamada nunca via a falha, porque essa funcao nunca
  // REJEITA, so RESOLVE com o limitType). Substitui a funcao globalmente
  // (e uma DECLARACAO DE FUNCAO no topo do arquivo, propriedade gravavel
  // de self/globalThis - diferente de uma const, que nao apareceria la)
  // para forcar a falha de forma deterministica.
  await NotasPatTest.reset();
  const syncSetOriginal = syncSetComRetryDeRate;
  self.syncSetComRetryDeRate = async () => 'RATE';
  NotasPatTest.assert('D7-pre substituicao de syncSetComRetryDeRate esta ativa', self.syncSetComRetryDeRate !== syncSetOriginal);
  try {
    await new Promise(r => chrome.storage.sync.set({
      standard_texts: [{ id: 'texto_a', title: 'A', text: 'a'.repeat(40), createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }]
    }, r));
    await new Promise(r => chrome.storage.local.set({
      standard_texts: [{ id: 'texto_c', title: 'C', text: 'c'.repeat(40), createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }]
    }, r));
    await migrateNotesToSync();
    const localAposRate = await new Promise(r => chrome.storage.local.get(['standard_texts'], r));
    const idsAposRate = (localAposRate.standard_texts || []).map(t => t.id);
    NotasPatTest.assert('D7 RATE na gravacao dos textos NAO apaga a copia local (a uniao continua la)',
      idsAposRate.includes('texto_a') && idsAposRate.includes('texto_c'));
  } finally {
    self.syncSetComRetryDeRate = syncSetOriginal;
  }

  console.log('[NotasPat][TESTE]     esperado no Bloco D: 10/10');
  console.log('[NotasPat][TESTE]     *** SE D1/D2/D3/D4/D5/D5b/D6/D6b/D7 FALHAREM, PARAR: ha risco de perda de dados ***');

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
  // BLOCO G — lembrete sobrevive a migracao local -> sync (CRITICO)
  // Bug de revisao: o listener de storage.onChanged tratava a remocao local
  // (que a migracao faz DEPOIS de confirmar a gravacao no sync - grava,
  // confirma, so entao remove) como uma EXCLUSAO REAL, e limpava o alarme
  // que a propria gravacao no sync tinha acabado de criar. O lembrete
  // sumia toda vez que uma nota com lembrete migrava - silenciosamente.
  // =========================================================
  console.log('[NotasPat][TESTE] --- Bloco G: lembrete sobrevive a migracao ---');
  await NotasPatTest.reset();
  await new Promise(r => chrome.storage.local.set({
    note_777: {
      id: '777', text: 'com lembrete', color: '#fff8c6', tags: [],
      reminder: new Date(Date.now() + 86400000).toISOString(), // 24h a frente
      createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2030-01-01T00:00:00.000Z'
    }
  }, r));
  await new Promise(r => setTimeout(r, 300)); // listener de storage.onChanged e assincrono

  const alarmesAntes = await chrome.alarms.getAll();
  NotasPatTest.assert('G0 alarme existe ANTES da migracao (confirma que o cenario e real)',
    alarmesAntes.some(a => a.name === 'reminder_777'));

  await migrateNotesToSync();
  await new Promise(r => setTimeout(r, 800));

  const gSync = await new Promise(r => chrome.storage.sync.get(['note_777'], r));
  const gLocal = await new Promise(r => chrome.storage.local.get(['note_777'], r));
  NotasPatTest.assert('G1a a nota de fato migrou (esta no sync, nao mais em local)',
    !!gSync.note_777 && !gLocal.note_777);

  const alarmesDepois = await chrome.alarms.getAll();
  NotasPatTest.assert('G1 alarme continua existindo DEPOIS da migracao (nao foi limpo por engano)',
    alarmesDepois.some(a => a.name === 'reminder_777'));

  console.log('[NotasPat][TESTE]     esperado no Bloco G: 3/3');

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
  console.log('[NotasPat][TESTE] ===== FIM parte 1 (total esperado: 37/37) =====');
  console.log('[NotasPat][TESTE] Proximo: clique direito no icone da extensao > Inspect popup > cole test/verify-1.4.0-ui.js');
})();
