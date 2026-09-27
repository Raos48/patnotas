/**
 * Harness de teste manual - NotasPat
 * NAO faz parte do build. Colar no console do service worker
 * (chrome://extensions > NotasPat > "service worker") ou na pagina do portal.
 *
 * ATENCAO: NotasPatTest.reset() APAGA todo o chrome.storage.sync e
 * chrome.storage.local da extensao. Por isso o primeiro reset() tira um
 * backup automatico (NotasPatTest._backup) e imprime o JSON no console -
 * copie e guarde essa linha se houver dados reais neste perfil.
 *
 * GUARDA DE DADOS REAIS: reset() se RECUSA a limpar se encontrar qualquer
 * nota cujo protocolo pareca um protocolo real do PAT (5+ digitos, todos
 * numericos - o formato de verdade das tarefas do INSS) ou qualquer texto
 * padrao com titulo/conteudo alem dos poucos padroes de teste conhecidos.
 * Isso existe porque um "Load Temporary Add-on" no Firefox NAO e sandbox
 * descartavel: o manifest fixa gecko.id, entao esse carregamento
 * compartilha o MESMO storage.sync (e, se a Conta Firefox tiver sync de
 * complementos ativado, o MESMO storage sincronizado entre computadores)
 * que a extensao publicada de verdade usaria neste perfil. Ja aconteceu
 * de reset() apagar 4 notas reais de marco/2026 e 3 textos padrao reais
 * (recuperados via NotasPatTest.restore() a tempo, mas so porque o
 * primeiro reset() ja tinha guardado o backup).
 */
function pareceDadoReal(local, sync) {
  const suspeitos = [];
  const verificar = (obj, origem) => {
    if (!obj) return;
    Object.keys(obj).forEach(chave => {
      if (!chave.startsWith('note_')) return;
      const protocolo = chave.substring('note_'.length);
      // Protocolo real do PAT: 5+ digitos, so numeros (ver content.js:
      // /^\d{5,}$/). IDs de teste usam palavras, numeros curtos (<5 digitos)
      // ou nomes obviamente artificiais (antiga, recente, naocabe, grande...).
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

  async reset(opcoes) {
    const forcar = opcoes && opcoes.confirmoApagarDadosReais === true;

    // So o PRIMEIRO reset guarda o estado original; os seguintes ja rodam
    // sobre storage de teste e nao devem sobrescrever o backup.
    if (!this._backup) {
      this._backup = await this.backup();
    }

    // Guarda: recusa apagar se o QUE JA ESTA LA (nao o backup, que acabou
    // de ser tirado) parecer dado real. So roda contra o backup do
    // PRIMEIRO reset - resets seguintes ja estao sobre storage de teste,
    // que sempre teria protocolos curtos/artificiais e dispararia falso
    // positivo (ex.: sync preenchido de fillSyncTo, ou as proprias notas de
    // teste do bloco anterior).
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

  /**
   * Enche o sync ate aproximadamente `bytes` para testar estouro de quota.
   * Se o ultimo pedaco de 7 KB nao couber (alvo perto do limite, ex.: 100000),
   * completa o espaco que resta: o sync fica cheio de verdade.
   *
   * O calculo do "resto" e uma ESTIMATIVA (quota - emUso - overhead da chave).
   * Medido na pratica (perfil Firefox descartavel): ambos os navegadores
   * recusam corretamente o 15o item cheio de 7000 bytes (98144 + 7011 >
   * 102400) - isso nao e o problema. O problema e so a gravacao do RESTO:
   * com 98144 em uso, o Chrome aceitou completar ate exatamente 102400
   * bytes, mas o Firefox recusou totais entre 102392 e 102400 e so aceitou a
   * partir de 102336 - exige ~64 bytes de folga que o Chrome nao exige. Por
   * isso o resultado da gravacao do resto agora e checado: se o Firefox
   * recusar mesmo perto do teto, o codigo recua o tamanho ate um valor que
   * caiba, em vez de assumir que sempre funciona.
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
        let resto = quota - emUso - chave.length - 2; // 2 = aspas do JSON da string
        // Recua ate a gravacao ser aceita (Firefox precisa de mais folga que
        // o Chrome perto do teto exato) ou nao sobrar mais nada para tentar.
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
