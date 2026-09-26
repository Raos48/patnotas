/**
 * Harness de teste manual - NotasPat
 * NAO faz parte do build. Colar no console do service worker
 * (chrome://extensions > NotasPat > "service worker") ou na pagina do portal.
 *
 * ATENCAO: NotasPatTest.reset() APAGA todo o chrome.storage.sync e
 * chrome.storage.local da extensao. Por isso o primeiro reset() tira um
 * backup automatico (NotasPatTest._backup) e imprime o JSON no console -
 * copie e guarde essa linha se houver dados reais neste perfil.
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

  /** Le os dois namespaces e devolve um pacote restauravel. */
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

  /** Restaura um pacote devolvido por backup() (objeto ou string JSON). */
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
    // So o PRIMEIRO reset guarda o estado original; os seguintes ja rodam
    // sobre storage de teste e nao devem sobrescrever o backup.
    if (!this._backup) {
      this._backup = await this.backup();
    }
    await new Promise(r => chrome.storage.sync.clear(r));
    await new Promise(r => chrome.storage.local.clear(r));
    this.results = [];
    console.log('[NotasPat][TESTE] Storage limpo (sync + local). Desfazer: NotasPatTest.restore(NotasPatTest._backup)');
  },

  /**
   * Enche o sync ate aproximadamente `bytes` para testar estouro de quota.
   * Se o ultimo pedaco de 7 KB nao couber (alvo perto do limite, ex.: 100000),
   * completa o espaco que resta: o sync fica cheio de verdade.
   */
  async fillSyncTo(bytes) {
    const gravar = obj => new Promise(r => chrome.storage.sync.set(obj, () => r(!chrome.runtime.lastError)));
    const filler = 'x'.repeat(7000);
    let escrito = 0, i = 0;
    while (escrito < bytes) {
      const chave = `__fill_${i++}`;
      if (!(await gravar({ [chave]: filler }))) {
        const quota = chrome.storage.sync.QUOTA_BYTES || 102400;
        const emUso = await new Promise(r => chrome.storage.sync.getBytesInUse(null, r));
        const resto = quota - emUso - chave.length - 2; // 2 = aspas do JSON da string
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
