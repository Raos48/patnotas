/**
 * Background Service Worker - NotasPat
 * Manifest V3 - Versão 1.4.0
 * Com suporte a notificações, lembretes e storage granular
 */

// Modulo de quota do storage.sync (no Firefox e carregado via background.scripts)
if (typeof importScripts === 'function') {
  importScripts('/lib/quota.js');
}

const NOTE_PREFIX = 'note_';
const ALARM_PREFIX = 'reminder_';
const OLD_STORAGE_KEY = 'notes'; // Para migração do formato antigo

// ============ INSTALAÇÃO E ATUALIZAÇÃO ============

chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    // Inicializar storage apenas para chaves ausentes (nunca sobrescrever dados existentes)
    const existing = await chrome.storage.local.get(['templates', 'theme', 'standard_texts']);
    const toSet = {};
    if (!existing.templates) toSet.templates = getDefaultTemplates();
    if (!existing.theme) toSet.theme = 'light';
    if (!existing.standard_texts) toSet.standard_texts = [];
    if (Object.keys(toSet).length > 0) {
      await chrome.storage.local.set(toSet);
    }
    console.log('[NotasPat] Storage inicializado');
  } else if (details.reason === 'update') {
    const previousVersion = details.previousVersion;
    const currentVersion = chrome.runtime.getManifest().version;
    console.log(`[NotasPat] Atualizado de v${previousVersion} para v${currentVersion}`);
  }

  // Migrar formato antigo (notes: {}) para granular (note_<protocolo>)
  await migrateToGranularStorage();

  // Migrar notas/textos de local para sync (sincronizacao entre computadores).
  // notificar so em install/update (nao em chrome_update/shared_module_update,
  // que tambem disparam onInstalled a cada atualizacao do proprio Chrome,
  // por volta de uma vez por mes): sem essa distincao o aviso de "notas nao
  // couberam" reapareceria nessas ocasioes tambem, alem de a cada cold start
  // do service worker se nao fosse pelo notificar:false la (MV3 recicla o
  // worker com frequencia).
  const ehInstallOuUpdate = details.reason === 'install' || details.reason === 'update';
  await migrateNotesToSync({ notificar: ehInstallOuUpdate });

  // Reconfigurar todos os alarmes (apenas na instalação/atualização)
  await setupReminders();
});

function getDefaultTemplates() {
  return [
    { id: 'aguardando-doc', nome: 'Aguardando documentação', texto: 'Aguardando envio de documentação complementar pelo interessado.' },
    { id: 'ligar', nome: 'Ligar para interessado', texto: 'Ligar para o interessado para esclarecer pendências.' },
    { id: 'analise', nome: 'Em análise', texto: 'Processo em análise técnica.' },
    { id: 'retorno', nome: 'Aguardando retorno', texto: 'Aguardando retorno do interessado.' }
  ];
}

// ============ MIGRAÇÃO ============

/**
 * Migra o formato antigo { notes: { protocolo: nota } }
 * para o formato granular { note_<protocolo>: nota }
 */
async function migrateToGranularStorage() {
  try {
    const result = await chrome.storage.local.get([OLD_STORAGE_KEY]);
    const oldNotes = result[OLD_STORAGE_KEY];

    if (!oldNotes || typeof oldNotes !== 'object') return;

    const keys = Object.keys(oldNotes);
    if (keys.length === 0) {
      // Objeto vazio, apenas limpar
      await chrome.storage.local.remove(OLD_STORAGE_KEY);
      console.log('[NotasPat] Chave antiga removida (vazia)');
      return;
    }

    // Gravar cada nota com chave individual
    const keysToSet = {};
    keys.forEach(protocolo => {
      const note = oldNotes[protocolo];
      // Garantir campos novos
      if (!note.tags) note.tags = [];
      if (note.reminder === undefined) note.reminder = null;
      keysToSet[NOTE_PREFIX + protocolo] = note;
    });

    await chrome.storage.local.set(keysToSet);

    // Remover chave antiga
    await chrome.storage.local.remove(OLD_STORAGE_KEY);

    console.log(`[NotasPat] Migradas ${keys.length} notas para storage granular`);
  } catch (error) {
    console.error('[NotasPat] Erro na migração para storage granular:', error);
  }
}

/**
 * Move notas e textos padrão de local para sync.
 *
 * ORDEM INVIOLAVEL: grava no sync -> confirma sucesso -> so entao remove
 * do local. Nunca existe um instante em que o dado nao esta em lugar nenhum.
 *
 * Ordena por updatedAt desc: se nem tudo couber, o que sincroniza e o
 * trabalho mais recente, nao uma fatia arbitraria.
 *
 * Serializada por fila (ver migrateNotesToSync mais abaixo): onInstalled e o
 * cold-start do service worker podem disparar quase ao mesmo tempo. Cada
 * gravacao no sync conta como 1 write contra o limite de 120/minuto; sem
 * serializar, as duas passadas juntas gravariam nota por nota (2x o total),
 * e um usuario real com so ~60 notas ja estouraria o limite na atualizacao -
 * as que sobrassem cairiam em fallback e o aviso diria "exclua notas
 * antigas" para notas que cabiam perfeitamente, so nao dentro do limite de
 * escritas por minuto.
 *
 * @param {{notificar?: boolean}} opcoes - notificar: so onInstalled deve
 *   avisar o usuario. Esta funcao roda de novo a cada cold start do service
 *   worker (MV3 recicla o worker com frequencia); sem essa distincao, um
 *   usuario com notas em fallback veria o mesmo aviso repetidas vezes ao
 *   longo do dia, mesmo sem nada de novo ter acontecido.
 */
async function executarMigracaoParaSync({ notificar = false } = {}) {
  let migradas = 0;
  let naoMigradas = 0;
  let houveRate = false;

  try {
    const local = await chrome.storage.local.get(null);
    const sync = await chrome.storage.sync.get(null);
    const chavesNota = Object.keys(local).filter(k => k.startsWith(NOTE_PREFIX));

    // Rede de seguranca: guarda uma copia do que este computador tinha em
    // local ANTES de qualquer escrita desta migracao. Cobre um risco que
    // nem o guard de recencia nem o merge de textos padrao eliminam: se
    // este Chrome ainda nao baixou o sync de outro PC (o sync do Chrome e
    // assincrono, chega em segundo plano), a migracao pode gravar por cima
    // de dado mais novo de outro computador achando, de boa fe, que esta
    // versao local e a mais recente. Feita so uma vez (chave sem prefixo
    // note_, entao nunca aparece como nota); nao serve para restaurar
    // automaticamente, so para o usuario nao perder o historico se algo
    // der errado.
    // Try/catch proprio, separado do try principal da migracao: local nao
    // tem unlimitedStorage no manifest (teto de 10 MB do proprio Chrome) e
    // o snapshot copia TODAS as notas de local - um usuario perto desse
    // teto faria este set rejeitar. Sem isolar, essa falha abortaria a
    // migracao inteira (o catch externo), e como o snapshot nunca chega a
    // existir, isso se repetiria e travaria a migracao para sempre a cada
    // cold start. A rede de seguranca nunca pode ser a causa de travar a
    // proteção que ela deveria dar.
    try {
      const chavePreMigracao = 'premigracao_1_4_0';
      // Flag de execucao unica (mesmo padrao de textosPadraoMigrados1_4_0):
      // o snapshot so pode ser criado UMA vez, na primeira migracao. Sem
      // essa flag, "criar de novo quando vencido" recria o snapshot para
      // sempre em qualquer usuario que continue com notas em local (quem
      // tem notas em fallback permanente, por nao caber no sync, sempre vai
      // ter algo em local) - o oposto do que a expiracao deveria evitar.
      const chaveCriado = `${chavePreMigracao}_criado`;
      const jaCriouSnapshot = await chrome.storage.local.get([chaveCriado]);
      if (!jaCriouSnapshot[chaveCriado]) {
        if (chavesNota.length > 0 || (local.standard_texts && local.standard_texts.length > 0)) {
          const notasParaSnapshot = {};
          chavesNota.forEach(k => { notasParaSnapshot[k] = local[k]; });
          const snapshot = {
            quando: new Date().toISOString(),
            notas: notasParaSnapshot,
            standard_texts: local.standard_texts || []
          };
          // Limite de tamanho: um usuario com milhares de notas presas em
          // fallback (nao cabem no sync) teria a maioria delas em local -
          // o snapshot dobraria esse uso. Perto do teto de 10 MB do Chrome
          // (sem unlimitedStorage no manifest), gravar o snapshot deixaria
          // pouco espaco sobrando, e as PROXIMAS gravacoes normais de
          // fallback comecariam a falhar ("Erro ao salvar nota") ate o
          // snapshot expirar, 30 dias depois. Pula a copia (mas marca como
          // criado mesmo assim) quando isso e um risco real.
          const tamanho = getItemByteSize(chavePreMigracao, snapshot);
          if (tamanho <= 3 * 1024 * 1024) {
            await chrome.storage.local.set({ [chavePreMigracao]: snapshot });
          } else {
            console.warn('[NotasPat] Snapshot pre-migracao pulado por tamanho (' + tamanho + ' bytes)');
          }
        }
        // Marca mesmo quando nao havia nada para guardar (ou o snapshot foi
        // pulado por tamanho): nunca mais tenta, e uma unica chance.
        await chrome.storage.local.set({ [chaveCriado]: true }).catch(() => {});
      } else {
        // Ja passou da unica chance de criar: so expira o que ja existe.
        // Expira em 30 dias: o snapshot existe para o usuario recuperar
        // manualmente pelo console logo apos a atualizacao, nao para virar
        // uma segunda copia permanente de tudo. Sem expirar, um usuario com
        // muitas notas em fallback (nao cabem no sync) empurraria local
        // perto do teto de 10 MB do Chrome (sem unlimitedStorage no
        // manifest) - e dali em diante ATE as gravacoes normais de fallback
        // comecariam a falhar.
        const jaTemSnapshot = await chrome.storage.local.get([chavePreMigracao]);
        const existente = jaTemSnapshot[chavePreMigracao];
        if (existente && existente.quando) {
          const idadeDias = (Date.now() - new Date(existente.quando).getTime()) / 86400000;
          if (idadeDias > 30) await chrome.storage.local.remove(chavePreMigracao);
        }
      }
    } catch (e) {
      console.warn('[NotasPat] Nao foi possivel gravar o snapshot de seguranca pre-migracao:', e && e.message);
    }

    chavesNota.sort((a, b) => {
      const ta = new Date((local[a] || {}).updatedAt || 0).getTime();
      const tb = new Date((local[b] || {}).updatedAt || 0).getTime();
      return tb - ta; // mais recente primeiro
    });

    // Primeira passada: decide o destino de cada nota sem gravar nada ainda,
    // acumulando bytes/contagem como o proprio storage.sync faria (mesma
    // logica de checkQuotaBeforeWrite, mas de uma vez para o lote inteiro -
    // chama-la nota a nota tambem seria 1 leitura de rede por nota).
    let totalBytesSync = await new Promise(r => chrome.storage.sync.getBytesInUse(null, b => r(b || 0)));
    let totalItensSync = Object.keys(sync).length;
    const paraLimpar = [];      // ja migrada, so remover do local
    const paraGravarLote = {};  // vao no unico sync.set em lote
    const paraFallback = [];    // nao coube: marcar em local (se ainda nao marcada)

    for (const key of chavesNota) {
      const nota = local[key];

      const noSync = sync[key];
      if (noSync && new Date(noSync.updatedAt || 0) >= new Date(nota.updatedAt || 0)) {
        paraLimpar.push(key);
        continue;
      }

      // Nota que ja estava em fallback (nao coube antes) e agora cabe: NUNCA
      // gravar _syncFallback no sync. background.js nao carrega lib/storage.js
      // (so lib/quota.js via importScripts), entao a limpeza e feita aqui
      // mesmo - a mesma invariante que withoutSyncFallback protege la.
      const jaEstavaEmFallback = nota._syncFallback === true;
      const paraGravar = jaEstavaEmFallback
        ? (() => { const c = Object.assign({}, nota); delete c._syncFallback; return c; })()
        : nota;

      const tamanho = getItemByteSize(key, paraGravar);
      const jaExisteNoSync = Object.prototype.hasOwnProperty.call(sync, key);
      // Se a chave ja existe no sync, o que sera liberado e o tamanho da
      // copia atual - sem subtrair isso a conta contaria o mesmo espaco 2x
      // (o que ja esta la + o que vai substituir) e recusaria notas que na
      // verdade cabem, marcando-as como "nao couberam" sem necessidade.
      const tamanhoAtualNoSync = jaExisteNoSync ? getItemByteSize(key, sync[key]) : 0;
      const cabe = tamanho <= SYNC_QUOTA_BYTES_PER_ITEM &&
        totalBytesSync - tamanhoAtualNoSync + tamanho <= SYNC_QUOTA_BYTES_TOTAL &&
        (jaExisteNoSync || totalItensSync + 1 <= SYNC_MAX_ITEMS);

      if (!cabe) {
        paraFallback.push({ key, nota, jaEstavaEmFallback });
        continue;
      }

      paraGravarLote[key] = paraGravar;
      totalBytesSync += tamanho - tamanhoAtualNoSync;
      if (!jaExisteNoSync) totalItensSync++;
    }

    if (paraLimpar.length > 0) {
      await new Promise(r => chrome.storage.local.remove(paraLimpar, r));
    }

    // Um UNICO sync.set para todo o lote que coube: 1 write, nao N.
    const chavesLote = Object.keys(paraGravarLote);
    if (chavesLote.length > 0) {
      const limitType = await syncSetComRetryDeRate(paraGravarLote);
      if (!limitType) {
        const confirmado = await chrome.storage.sync.get(chavesLote);
        const confirmadas = chavesLote.filter(k => confirmado[k]);
        if (confirmadas.length > 0) await new Promise(r => chrome.storage.local.remove(confirmadas, r));
        migradas += confirmadas.length;
        // Alguma chave nao confirmou mesmo sem erro (raro): trata como as que nao couberam
        chavesLote.filter(k => !confirmado[k]).forEach(k => paraFallback.push({ key: k, nota: local[k], jaEstavaEmFallback: local[k]._syncFallback === true }));
      } else if (limitType === 'RATE') {
        // Limite de escritas por minuto, nao de espaco: as notas cabiam.
        // Nao conta como naoMigradas nem dispara o aviso de "exclua notas" -
        // a proxima migracao (proximo cold start) tenta de novo.
        houveRate = true;
      } else {
        // O lote inteiro foi recusado (ex.: TOTAL por poucos bytes de
        // diferenca entre o pre-calculo e o estado real no servidor - outra
        // aba escreveu enquanto decidiamos). Tenta nota a nota em vez de
        // marcar TODAS como fallback: normalmente so uma ou duas de fato
        // nao cabem, as demais conseguem gravar sozinhas.
        for (const k of chavesLote) {
          const erroLimitType = await new Promise(resolve => {
            chrome.storage.sync.set({ [k]: paraGravarLote[k] }, () => {
              resolve(chrome.runtime.lastError ? limitTypeFromSyncError(chrome.runtime.lastError) : null);
            });
          });

          if (erroLimitType === 'RATE') {
            // Limite de escritas, nao de espaco: nao marca como fallback (a
            // nota cabia) nem conta como naoMigradas - so para de tentar as
            // restantes deste lote agora; a proxima migracao (proximo cold
            // start) tenta de novo.
            houveRate = true;
            break;
          }
          if (erroLimitType) {
            paraFallback.push({ key: k, nota: local[k], jaEstavaEmFallback: local[k]._syncFallback === true });
            continue;
          }

          try {
            const conf = await chrome.storage.sync.get([k]);
            if (!conf[k]) throw new Error('gravacao nao confirmada');
            await chrome.storage.local.remove(k);
            migradas++;
          } catch (e) {
            paraFallback.push({ key: k, nota: local[k], jaEstavaEmFallback: local[k]._syncFallback === true });
          }
        }
      }
    }

    // Marca fallback em lote (so as que ainda nao estavam marcadas - repetir
    // o mesmo set a cada cold start dispararia storage.onChanged a toa)
    const paraMarcar = {};
    paraFallback.forEach(({ key, nota, jaEstavaEmFallback }) => {
      if (!jaEstavaEmFallback) paraMarcar[key] = Object.assign({}, nota, { _syncFallback: true });
    });
    if (Object.keys(paraMarcar).length > 0) {
      await new Promise(r => chrome.storage.local.set(paraMarcar, r));
    }
    naoMigradas += paraFallback.length;

    // Textos padrao: mescla por id (nao "pula se ja existe no sync"). Dois
    // PCs cada um com seus proprios textos locais e um caso comum: sem
    // merge, o segundo PC a atualizar perderia os proprios textos porque
    // "ja existe algo no sync" - mesmo sendo um array totalmente diferente.
    //
    // So roda na PRIMEIRA vez (flag textosPadraoMigrados1_4_0): depois da
    // migracao, um local.standard_texts nao-vazio significa outra coisa -
    // fallback normal do dia a dia (writeStandardTexts salvou local porque
    // a uniao nao coube no sync naquele momento). Rodar o merge de novo a
    // cada cold start reintroduziria no sync um texto que o usuario excluiu
    // depois da migracao (o merge nao tem como saber de uma exclusao,
    // so soma o que ve nos dois lados) - a cada cold start.
    const flagTextosKey = 'textosPadraoMigrados1_4_0';
    let textosComRate = false; // RATE nao e falha definitiva: nao trava o gate
    const jaMigrouTextos = await chrome.storage.local.get([flagTextosKey]);
    if (!jaMigrouTextos[flagTextosKey]) {
      if (local.standard_texts && Array.isArray(local.standard_texts) && local.standard_texts.length > 0) {
        const jaNoSync = await chrome.storage.sync.get(['standard_texts']);
        const textosSync = Array.isArray(jaNoSync.standard_texts) ? jaNoSync.standard_texts : [];
        const porId = new Map();
        textosSync.forEach(t => porId.set(t.id, t));
        local.standard_texts.forEach(t => {
          const atual = porId.get(t.id);
          if (!atual || new Date(t.updatedAt || 0) > new Date(atual.updatedAt || 0)) porId.set(t.id, t);
        });
        const mesclados = Array.from(porId.values());
        const check = await checkQuotaBeforeWrite('standard_texts', mesclados);
        if (check.ok) {
          try {
            // syncSetComRetryDeRate NUNCA rejeita - resolve null (gravou) ou
            // o limitType do erro. Um try/catch em volta dela sozinha nunca
            // pegaria uma falha de escrita (so falhas de local.set/.remove
            // depois); o resultado precisa ser checado explicitamente, senao
            // uma rejeicao (ex.: RATE, bem provavel logo apos o lote de
            // notas ter acabado de ocupar o mesmo limite por minuto) ia
            // direto para o local.remove('standard_texts') como se tivesse
            // gravado - apagando a UNICA copia dos textos deste usuario.
            const limitType = await syncSetComRetryDeRate({ standard_texts: mesclados });
            const confirmado = limitType ? {} : await chrome.storage.sync.get(['standard_texts']);
            const gravouTudo = !limitType && Array.isArray(confirmado.standard_texts) &&
              mesclados.every(t => confirmado.standard_texts.some(c => c.id === t.id));
            if (gravouTudo) {
              await chrome.storage.local.remove('standard_texts');
            } else {
              // Nao gravou (quota ou RATE): local tem que ficar com a
              // UNIAO, nao so com os textos originais deste PC.
              // getStandardTexts prioriza local quando nao-vazio - se local
              // ficasse so com os textos deste PC, os do outro PC (ja no
              // sync) sumiriam da UI aqui, e o proximo salvamento neste PC
              // gravaria por cima do sync, apagando os do outro PC nas duas
              // maquinas.
              await chrome.storage.local.set({ standard_texts: mesclados });
              if (limitType === 'RATE') { houveRate = true; textosComRate = true; } else { naoMigradas++; }
            }
          } catch (e) {
            // Falhou o proprio local.set/.remove (raro): tenta preservar a
            // uniao em local mesmo assim, sem deixar o usuario sem nada.
            await chrome.storage.local.set({ standard_texts: mesclados }).catch(() => {});
            naoMigradas++;
          }
        } else {
          await chrome.storage.local.set({ standard_texts: mesclados });
          naoMigradas++;
        }
      }
      // Marca SEMPRE (exceto RATE), mesmo sem textos locais para migrar:
      // essa mescla e coisa de uma vez so. Depois disso, um
      // local.standard_texts nao-vazio e o fallback normal do dia a dia
      // (writeStandardTexts em storage.js), que o merge nao deve mais
      // tocar - senao reintroduziria no sync um texto que o usuario ja
      // excluiu depois da migracao (o merge nao sabe distinguir "nunca
      // migrado" de "exclusao recente", so soma o que ve nos dois lados).
      // RATE e a excecao: nao e falha de espaco, so nao deu tempo agora -
      // travar o gate deixaria os textos presos em local para sempre, sem
      // nunca tentar de novo (o log ja promete "tenta de novo depois").
      if (!textosComRate) await chrome.storage.local.set({ [flagTextosKey]: true });
    }

    console.log(`[NotasPat] Migracao para sync: ${migradas} migradas, ${naoMigradas} mantidas localmente${houveRate ? ' (limite de escritas por minuto atingido - tenta de novo depois)' : ''}`);

    if (notificar && naoMigradas > 0) {
      // Se o cold-start ja tinha migrado tudo que cabia antes deste
      // onInstalled rodar, migradas pode ser 0 aqui - "0 notas agora
      // sincronizam" seria enganoso, entao essa frase so aparece quando
      // migradas > 0.
      const linhaMigradas = migradas > 0 ? `${migradas} notas agora sincronizam entre computadores. ` : '';
      criarNotificacao('notaspat_migracao', {
        type: 'basic',
        title: 'NotasPat - Sincronizacao',
        message: `${linhaMigradas}${naoMigradas} nao couberam e seguem salvas apenas neste computador - exclua notas antigas para sincroniza-las.`,
        priority: 2
      });
    }
  } catch (error) {
    console.error('[NotasPat] Erro na migracao para sync:', error);
  }

  return { migradas, naoMigradas };
}

/**
 * chrome.storage.sync.set que tenta UMA vez de novo se o Chrome recusar por
 * limite de taxa (RATE). Mesma politica de lib/storage.js
 * (syncSetWithRateRetry), reimplementada aqui porque background.js nao
 * carrega lib/storage.js.
 * @returns {Promise<null|string>} null se gravou; senao o limitType do erro
 */
function syncSetComRetryDeRate(items) {
  const tentar = () => new Promise(resolve => {
    chrome.storage.sync.set(items, () => {
      const erro = chrome.runtime.lastError;
      resolve(erro ? limitTypeFromSyncError(erro) : null);
    });
  });
  return tentar().then(limitType => {
    if (limitType !== 'RATE') return limitType;
    return new Promise(r => setTimeout(r, 1000)).then(tentar);
  });
}

// Serializa execucoes concorrentes: onInstalled e o cold-start do fim deste
// arquivo podem disparar quase ao mesmo tempo. Sem isso, as duas passadas
// leriam o mesmo estado do local e cada uma tentaria gravar o mesmo lote de
// notas - dobrando as escritas contra o limite por minuto (ver comentario
// em executarMigracaoParaSync). A segunda chamada espera a primeira
// terminar e roda sobre o estado ja atualizado por ela.
let filaMigracao = Promise.resolve();
function migrateNotesToSync(opcoes) {
  const execucao = filaMigracao.then(() => executarMigracaoParaSync(opcoes));
  filaMigracao = execucao.catch(() => {}); // uma falha nao trava as proximas
  return execucao;
}

// ============ HELPERS ============

/**
 * Cria uma notificacao de forma tolerante a falhas.
 *
 * O iconUrl precisa ser absoluto: no service worker um caminho relativo
 * resolve a partir de /background/ (entao "icons/icon128.png" vira
 * /background/icons/icon128.png, que nao existe). Com o icone ausente o
 * Chrome REJEITA a notificacao inteira - lembretes simplesmente nao
 * apareciam - e a promise rejeitada escapava como "Uncaught (in promise)".
 */
function criarNotificacao(id, opcoes) {
  const opcoesComIcone = Object.assign({}, opcoes, {
    iconUrl: chrome.runtime.getURL('icons/icon128.png')
  });
  // Promise.resolve cobre tanto a API que devolve promise (Chrome MV3 /
  // Firefox) quanto a que devolve undefined
  Promise.resolve(chrome.notifications.create(id, opcoesComIcone)).catch((e) => {
    console.warn('[NotasPat] Nao foi possivel exibir notificacao:', e);
  });
}

/**
 * Grava a nota no sync e so entao limpa o local. Se o sync nao aceitar,
 * a nota continua em local marcada como fallback - nunca e descartada.
 */
async function gravarNotaComFallback(key, nota) {
  const paraSync = Object.assign({}, nota);
  delete paraSync._syncFallback;
  try {
    await chrome.storage.sync.set({ [key]: paraSync });
    await chrome.storage.local.remove(key);
  } catch (e) {
    await chrome.storage.local.set({ [key]: Object.assign({}, nota, { _syncFallback: true }) });
  }
}

/**
 * Coleta todas as notas do storage granular, dos DOIS namespaces.
 * Em conflito (mesma chave em sync e local), vence a versao mais recente.
 */
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

/**
 * Lê uma nota individual do storage
 */
async function getNoteFromStorage(protocolo) {
  const notes = await getAllNotesFromStorage();
  return notes[protocolo] || null;
}

// ============ LEMBRETES E ALARMES ============

/**
 * Reconfigura TODOS os alarmes (usado apenas na instalação/atualização)
 */
async function setupReminders() {
  try {
    await chrome.alarms.clearAll();

    const notes = await getAllNotesFromStorage();
    const now = Date.now();

    Object.entries(notes).forEach(([protocolo, nota]) => {
      if (nota.reminder) {
        const reminderTime = new Date(nota.reminder).getTime();
        if (reminderTime > now) {
          chrome.alarms.create(`${ALARM_PREFIX}${protocolo}`, {
            when: reminderTime
          });
          console.log(`[NotasPat] Alarme criado para ${protocolo}`);
        }
      }
    });
  } catch (error) {
    console.error('[NotasPat] Erro ao configurar lembretes:', error);
  }
}

// Listener para alarmes
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (!alarm.name.startsWith(ALARM_PREFIX)) return;

  const protocolo = alarm.name.replace(ALARM_PREFIX, '');

  try {
    const nota = await getNoteFromStorage(protocolo);

    if (nota) {
      // Mostrar notificação
      criarNotificacao(`notification_${protocolo}`, {
        type: 'basic',
        title: '📝 Lembrete - NotasPat',
        message: `Protocolo ${protocolo}: ${nota.text.substring(0, 100)}${nota.text.length > 100 ? '...' : ''}`,
        priority: 2
      });

      // Limpar lembrete da nota (escrita individual)
      nota.reminder = null;
      await gravarNotaComFallback(NOTE_PREFIX + protocolo, nota);
    }
  } catch (error) {
    console.error('[NotasPat] Erro ao processar lembrete:', error);
  }
});

// Click na notificação
chrome.notifications.onClicked.addListener((notificationId) => {
  if (notificationId.startsWith('notification_')) {
    chrome.tabs.query({ url: 'https://atendimento.inss.gov.br/*' }, (tabs) => {
      if (tabs.length > 0) {
        chrome.tabs.update(tabs[0].id, { active: true });
        chrome.windows.update(tabs[0].windowId, { focused: true });
      }
    });
    chrome.notifications.clear(notificationId);
  }
});

// ============ BADGE ============

async function updateBadge() {
  try {
    const notes = await getAllNotesFromStorage();
    const count = Object.keys(notes).length;

    if (count > 0) {
      chrome.action.setBadgeText({ text: count.toString() });
      chrome.action.setBadgeBackgroundColor({ color: '#0B7D3B' });
    } else {
      chrome.action.setBadgeText({ text: '' });
    }
  } catch (error) {
    console.error('[NotasPat] Erro ao atualizar badge:', error);
  }
}

// ============ LISTENER DE MUDANÇAS NO STORAGE ============

chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace !== 'sync' && namespace !== 'local') return;

  let notesChanged = false;

  for (const key of Object.keys(changes)) {
    if (key.startsWith(NOTE_PREFIX)) {
      notesChanged = true;
      const protocolo = key.substring(NOTE_PREFIX.length);
      const change = changes[key];
      handleSingleReminderChanged(protocolo, change.oldValue, change.newValue);
    }
  }

  if (notesChanged) {
    updateBadge();
  }
});

/**
 * Atualiza o alarme de uma única nota que mudou
 */
async function handleSingleReminderChanged(protocolo, oldNota, newNota) {
  try {
    const alarmName = `${ALARM_PREFIX}${protocolo}`;
    const now = Date.now();

    if (!newNota && oldNota) {
      // Nota removida: limpar alarme
      await chrome.alarms.clear(alarmName);
    } else if (newNota) {
      const oldReminder = oldNota ? oldNota.reminder : null;
      const newReminder = newNota.reminder;

      if (oldReminder !== newReminder) {
        if (newReminder) {
          const reminderTime = new Date(newReminder).getTime();
          if (reminderTime > now) {
            await chrome.alarms.create(alarmName, { when: reminderTime });
          }
        } else {
          await chrome.alarms.clear(alarmName);
        }
      }
    }
  } catch (error) {
    console.error('[NotasPat] Erro ao atualizar alarme:', error);
  }
}

// ============ MENSAGENS ============

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  switch (request.action) {
    case 'getBadgeCount':
      getAllNotesFromStorage().then(notes => {
        sendResponse({ count: Object.keys(notes).length });
      }).catch(() => sendResponse({ count: 0 }));
      return true;

    case 'updateBadge':
      updateBadge();
      sendResponse({ success: true });
      return true;

    case 'setReminder':
      setReminderForNote(request.protocolo, request.reminder)
        .then(() => sendResponse({ success: true }))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;

    case 'getStats':
      getStats()
        .then(stats => sendResponse(stats))
        .catch(err => sendResponse({ error: err.message }));
      return true;

    case 'openStdTextsPage':
      chrome.tabs.create({
        url: chrome.runtime.getURL('stdtexts/stdtexts.html')
      });
      sendResponse({ success: true });
      return true;

    default:
      return false;
  }
});

async function setReminderForNote(protocolo, reminderDate) {
  const key = NOTE_PREFIX + protocolo;
  // Le dos DOIS namespaces: depois da migracao para sync a nota costuma
  // existir so no sync, e uma leitura apenas de local nao acharia nada -
  // o lembrete seria engolido em silencio.
  const nota = await getNoteFromStorage(protocolo);

  if (nota) {
    nota.reminder = reminderDate;
    nota.updatedAt = new Date().toISOString();

    await gravarNotaComFallback(key, nota);

    // Criar/remover alarme
    const alarmName = `${ALARM_PREFIX}${protocolo}`;
    if (reminderDate) {
      const reminderTime = new Date(reminderDate).getTime();
      if (reminderTime > Date.now()) {
        await chrome.alarms.create(alarmName, { when: reminderTime });
      }
    } else {
      await chrome.alarms.clear(alarmName);
    }
  }
}

async function getStats() {
  const notes = await getAllNotesFromStorage();
  const noteList = Object.values(notes);

  const now = new Date();
  const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  return {
    total: noteList.length,
    thisWeek: noteList.filter(n => new Date(n.createdAt) >= oneWeekAgo).length,
    withReminders: noteList.filter(n => n.reminder).length,
    byColor: noteList.reduce((acc, n) => {
      acc[n.color] = (acc[n.color] || 0) + 1;
      return acc;
    }, {}),
    byTag: noteList.reduce((acc, n) => {
      (n.tags || []).forEach(tag => {
        acc[tag] = (acc[tag] || 0) + 1;
      });
      return acc;
    }, {})
  };
}

// ============ INICIALIZAÇÃO ============

// Migrar se necessário (safety check a cada startup do service worker)
migrateToGranularStorage()
  .then(() => migrateNotesToSync())
  .then(() => {
    updateBadge();
  });

console.log('[NotasPat] Background Service Worker v1.4.0 carregado');
