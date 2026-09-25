/**
 * Módulo de Persistência - NotasPat
 * CRUD de notas em chrome.storage.sync (sincroniza entre computadores),
 * com fallback para chrome.storage.local quando a quota do sync nao permite.
 * Versão 1.4.0 - Sincronizacao entre computadores
 *
 * Formato: cada nota é armazenada como { "note_<protocolo>": { ...dados } }
 * Isso evita o padrão read-all/write-all que degradava com muitas notas.
 *
 * Fallback: a nota que nao cabe no sync e gravada em local sob a mesma chave,
 * marcada com _syncFallback: true - a nota digitada nunca e descartada.
 * Leitura: consulta os dois namespaces e, para a mesma chave, vence o
 * updatedAt mais recente; notas em fallback sobem ao sync quando couberem.
 * Depende de lib/quota.js (carregado antes deste arquivo).
 */

const NOTE_PREFIX = 'note_';

// ============ LEITURA DOS DOIS NAMESPACES ============

/**
 * Resolve a mesma chave presente nos dois namespaces.
 * Regra: vence updatedAt mais recente (empate: a do sync). "Sync sempre vence"
 * descartaria uma edicao local mais nova que o usuario acabou de fazer.
 * @param {Object} syncNotes - { protocolo: nota } lidas do sync
 * @param {Object} localNotes - { protocolo: nota } lidas do local
 * @returns {{merged: Object, obsoleteLocalKeys: string[], promotableKeys: string[]}}
 *   obsoleteLocalKeys: protocolos cuja copia local perdeu para o sync;
 *   promotableKeys: protocolos cuja versao valida esta so em local
 */
function mergeNotesByRecency(syncNotes, localNotes) {
  const merged = {};
  const obsoleteLocalKeys = [];
  const promotableKeys = [];
  const tempo = nota => new Date((nota && nota.updatedAt) || 0).getTime() || 0;

  Object.keys(syncNotes).forEach(p => { merged[p] = syncNotes[p]; });

  Object.keys(localNotes).forEach(p => {
    const local = localNotes[p];
    const sync = syncNotes[p];

    if (!sync) {
      merged[p] = local;
      promotableKeys.push(p); // so existe em local: tentar promover ao sync
      return;
    }

    if (tempo(local) > tempo(sync)) {
      merged[p] = local;
      promotableKeys.push(p);
    } else {
      obsoleteLocalKeys.push(p); // sync venceu: copia local nao serve mais
    }
  });

  return { merged, obsoleteLocalKeys, promotableKeys };
}

/**
 * Le as notas de um namespace, sem o prefixo note_ nas chaves.
 * @param {'sync'|'local'} area
 * @param {string[]|null} keys - chaves note_<protocolo>, ou null para todas
 * @returns {Promise<Object>} { protocolo: nota }; rejeita se a leitura falhar
 */
function readNotesFromArea(area, keys) {
  return new Promise((resolve, reject) => {
    chrome.storage[area].get(keys, (result) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
        return;
      }
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

// Chaves com promocao ao sync em andamento neste contexto: leituras seguidas
// (ex.: popup lista as notas e logo checa a saude) nao gravam a mesma nota duas vezes
const promotionsInFlight = new Set();

/**
 * Das notas planejadas para promocao, mantem so as que continuam em local
 * na mesma versao. Se o usuario excluiu ou editou a nota depois da leitura,
 * promover a copia lida a faria reaparecer (ou voltar atras) no sync.
 * @param {Object} entries - { chave: nota }
 * @returns {Promise<Object>} { chave: nota } ainda validas
 */
function filterUnchangedLocalNotes(entries) {
  const chaves = Object.keys(entries);
  if (chaves.length === 0) return Promise.resolve({});

  return new Promise((resolve, reject) => {
    chrome.storage.local.get(chaves, (result) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
        return;
      }
      const validas = {};
      chaves.forEach(chave => {
        const atual = (result || {})[chave];
        if (atual && atual.updatedAt === entries[chave].updatedAt) validas[chave] = entries[chave];
      });
      resolve(validas);
    });
  });
}

/**
 * Em segundo plano: limpa copias locais obsoletas e promove ao sync as notas
 * que ficaram so em local. Assim notas em fallback se auto-recuperam quando
 * o usuario libera espaco, sem acao manual.
 * Roda a cada leitura (inclusive a cada renderizacao da pagina), entao nao
 * grava nada quando nao ha o que fazer: a nota que continua sem caber fica
 * em local como esta. Nunca rejeita; falhas viram console.warn.
 * @param {Object} merged - { protocolo: nota } resultado do merge
 * @param {string[]} obsoleteLocalKeys
 * @param {string[]} promotableKeys
 */
function reconcileNamespaces(merged, obsoleteLocalKeys, promotableKeys) {
  const avisar = err => console.warn('[NotasPat] Falha ao reconciliar notas entre sync e local:', (err && err.message) || err);

  if (obsoleteLocalKeys.length > 0) {
    new Promise((resolve, reject) => {
      chrome.storage.local.remove(obsoleteLocalKeys.map(p => NOTE_PREFIX + p), () => {
        if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
        else resolve();
      });
    }).catch(avisar);
  }

  // Copias sem _syncFallback feitas agora: o chamador pode alterar merged depois
  const entries = {};
  promotableKeys.forEach(p => {
    const chave = NOTE_PREFIX + p;
    if (!merged[p] || promotionsInFlight.has(chave)) return;
    entries[chave] = withoutSyncFallback(merged[p]);
  });
  const chaves = Object.keys(entries);
  if (chaves.length === 0) return;
  chaves.forEach(chave => promotionsInFlight.add(chave));

  // Um unico sync.set com as que cabem (mais recentes primeiro); writeSyncBatch
  // so remove de local depois de confirmar a gravacao. As que nao cabem ficam como estao.
  planSyncBatch(entries)
    .then(({ fits }) => filterUnchangedLocalNotes(fits))
    .then(promover => writeSyncBatch(promover).then(limitType => {
      const total = Object.keys(promover).length;
      if (!limitType && total > 0) console.log('[NotasPat] ' + total + ' nota(s) salva(s) so neste computador subiram para o sync');
    }))
    .catch(avisar)
    .then(() => chaves.forEach(chave => promotionsInFlight.delete(chave)));
}

/**
 * Le notas do sync e do local, resolve conflitos e dispara a reconciliacao
 * em segundo plano (sem esperar por ela).
 * Se um namespace falhar na leitura, segue com o outro (sem reconciliar,
 * porque sem os dois lados o merge nao e confiavel para gravar); se os dois
 * falharem, rejeita.
 * @param {string[]|null} keys - chaves note_<protocolo>, ou null para todas
 * @returns {Promise<Object>} { protocolo: nota }
 */
function readNotesFromBothAreas(keys) {
  const ler = area => readNotesFromArea(area, keys).then(
    notes => ({ notes, erro: null }),
    erro => {
      console.warn('[NotasPat] Falha ao ler notas do ' + area + ':', (erro && erro.message) || erro);
      return { notes: {}, erro: erro || new Error('Falha ao ler notas do ' + area) };
    }
  );

  return Promise.all([ler('sync'), ler('local')]).then(([doSync, doLocal]) => {
    if (doSync.erro && doLocal.erro) throw doLocal.erro;

    const { merged, obsoleteLocalKeys, promotableKeys } = mergeNotesByRecency(doSync.notes, doLocal.notes);
    if (!doSync.erro && !doLocal.erro) {
      try {
        reconcileNamespaces(merged, obsoleteLocalKeys, promotableKeys);
      } catch (e) {
        console.warn('[NotasPat] Falha ao reconciliar notas entre sync e local:', e && e.message);
      }
    }
    return merged;
  });
}

/**
 * Retorna todas as notas (sync + local; filtra por prefixo note_)
 * @returns {Promise<Object>} Objeto com todas as notas { protocolo: nota }
 */
function getAllNotes() {
  return readNotesFromBothAreas(null);
}

/**
 * Retorna nota de um protocolo específico (sync + local, a mais recente)
 * @param {string} protocolo - Número do protocolo
 * @returns {Promise<Object|null>} Nota encontrada ou null
 */
function getNote(protocolo) {
  return getNotesForProtocolos([protocolo]).then(notes => notes[protocolo] || null);
}

/**
 * Retorna notas para uma lista de protocolos (batch-get em sync + local)
 * @param {string[]} protocolos - Array de números de protocolo
 * @returns {Promise<Object>} Objeto com notas encontradas { protocolo: nota }
 */
function getNotesForProtocolos(protocolos) {
  if (!protocolos || protocolos.length === 0) {
    return Promise.resolve({});
  }
  return readNotesFromBothAreas(protocolos.map(p => NOTE_PREFIX + p));
}

// ============ ESCRITA NO SYNC COM FALLBACK ============

// Espera antes da unica nova tentativa quando o sync recusa por limite de taxa
const SYNC_RATE_RETRY_MS = 1000;

/**
 * Copia da nota sem a marca _syncFallback (a versao que vai para o sync).
 * @param {Object} note
 * @returns {Object}
 */
function withoutSyncFallback(note) {
  const limpa = Object.assign({}, note);
  delete limpa._syncFallback;
  return limpa;
}

/**
 * Grava itens no sync num unico set. Se o Chrome recusar por limite de taxa
 * (RATE), espera SYNC_RATE_RETRY_MS e tenta UMA vez de novo.
 * @param {Object} items - { chave: valor }
 * @returns {Promise<null|string>} null se gravou; senao o limitType do erro
 */
function syncSetWithRateRetry(items) {
  const tentar = () => new Promise(resolve => {
    chrome.storage.sync.set(items, () => {
      const erro = chrome.runtime.lastError;
      resolve(erro ? limitTypeFromSyncError(erro) : null);
    });
  });

  return tentar().then(limitType => {
    if (limitType !== 'RATE') return limitType;
    console.warn('[NotasPat] Limite de taxa do sync atingido, nova tentativa em instantes');
    return new Promise(r => setTimeout(r, SYNC_RATE_RETRY_MS)).then(tentar);
  });
}

/**
 * Grava notas no sync e, so depois de confirmado, remove as copias locais
 * (fallbacks antigos) dessas chaves.
 * @param {Object} entries - { chave: nota } ja sem _syncFallback
 * @returns {Promise<null|string>} null se gravou; senao o limitType do erro
 */
function writeSyncBatch(entries) {
  const chaves = Object.keys(entries);
  if (chaves.length === 0) return Promise.resolve(null);

  return syncSetWithRateRetry(entries).then(limitType => {
    if (limitType) {
      console.warn('[NotasPat] Falha ao gravar no sync (' + limitType + '):', chaves.length, 'nota(s)');
      return limitType;
    }
    return new Promise(resolve => {
      chrome.storage.local.remove(chaves, () => {
        // Copia local que sobrar e mais antiga que a do sync: a leitura resolve
        if (chrome.runtime.lastError) console.warn('[NotasPat] Falha ao limpar copias locais apos gravar no sync');
        resolve(null);
      });
    });
  });
}

/**
 * Escolhe, entre varias notas, as que cabem no sync (mais recentes primeiro).
 * O orcamento e calculado uma vez: bytes em uso, chaves existentes e o
 * tamanho das chaves que seriam sobrescritas. Nao grava nada.
 * @param {Object} entries - { chave: nota } ja sem _syncFallback
 * @returns {Promise<{fits: Object, rest: Object}>} fits cabem no sync; rest nao
 */
function planSyncBatch(entries) {
  const chaves = Object.keys(entries);
  if (chaves.length === 0) return Promise.resolve({ fits: {}, rest: {} });

  return Promise.all([
    new Promise(r => chrome.storage.sync.getBytesInUse(null, b => r(b || 0))),
    new Promise(r => chrome.storage.sync.get(null, v => r(v || {})))
  ]).then(([bytesEmUso, noSync]) => {
    let usados = bytesEmUso;
    let itens = Object.keys(noSync).length;
    const fits = {};
    const rest = {};

    const tempo = nota => new Date((nota && nota.updatedAt) || 0).getTime() || 0;
    chaves.sort((a, b) => tempo(entries[b]) - tempo(entries[a]));

    chaves.forEach(chave => {
      const nota = entries[chave];
      const tamanho = getItemByteSize(chave, nota);
      const existe = Object.prototype.hasOwnProperty.call(noSync, chave);
      const tamanhoAtual = existe ? getItemByteSize(chave, noSync[chave]) : 0;

      const cabe = tamanho <= SYNC_QUOTA_BYTES_PER_ITEM &&
        usados - tamanhoAtual + tamanho <= SYNC_QUOTA_BYTES_TOTAL &&
        (existe || itens + 1 <= SYNC_MAX_ITEMS);

      if (!cabe) {
        rest[chave] = nota;
        return;
      }
      fits[chave] = nota;
      usados += tamanho - tamanhoAtual;
      if (!existe) itens++;
    });

    return { fits, rest };
  });
}

/**
 * Grava notas em local marcadas com _syncFallback (nao couberam no sync).
 * @param {Object} entries - { chave: nota }
 * @returns {Promise<void>} rejeita so se o proprio local falhar
 */
function saveBatchToLocalFallback(entries) {
  const marcadas = {};
  Object.keys(entries).forEach(chave => {
    marcadas[chave] = Object.assign({}, entries[chave], { _syncFallback: true });
  });
  if (Object.keys(marcadas).length === 0) return Promise.resolve();

  return new Promise((resolve, reject) => {
    chrome.storage.local.set(marcadas, () => {
      if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
      else resolve();
    });
  });
}

/**
 * Grava uma nota no local marcando _syncFallback e SEMPRE rejeita:
 * com erro QUOTA_EXCEEDED se gravou, ou com o erro do local se falhou.
 * @param {string} key
 * @param {Object} note
 * @param {'PER_ITEM'|'TOTAL'|'MAX_ITEMS'|'RATE'} limitType
 * @returns {Promise<never>}
 */
function saveToLocalFallback(key, note, limitType) {
  return saveBatchToLocalFallback({ [key]: note }).then(() => {
    console.warn('[NotasPat] Nota salva apenas neste computador (' + limitType + '):', key);
    throw createQuotaError(limitType);
  });
}

/**
 * Grava uma nota no sync; se nao couber, cai para local marcando _syncFallback.
 * A nota digitada nunca e descartada.
 * @param {string} key - note_<protocolo>
 * @param {Object} note
 * @returns {Promise<Object>} nota gravada no sync; rejeita com erro
 *   QUOTA_EXCEEDED depois de salvar em local
 */
function writeNoteWithFallback(key, note) {
  const limpa = withoutSyncFallback(note);
  return checkQuotaBeforeWrite(key, limpa).then(check => {
    if (!check.ok) {
      return saveToLocalFallback(key, limpa, check.limitType);
    }
    // A checagem nao elimina a corrida com outra gravacao: o set ainda pode falhar
    return writeSyncBatch({ [key]: limpa }).then(limitType => {
      if (limitType) return saveToLocalFallback(key, limpa, limitType);
      return limpa;
    });
  });
}

/**
 * Le a nota existente dos DOIS namespaces e devolve a mais recente por
 * updatedAt (empate: a do sync), como getNote(). Nao usa getNote() porque
 * ela dispara a reconciliacao em segundo plano, que poderia promover ao sync
 * a versao antiga desta mesma nota em paralelo com a gravacao que vem a seguir.
 * @param {string} key - note_<protocolo>
 * @returns {Promise<Object|null>}
 */
function readExistingNote(key) {
  const ler = area => new Promise(resolve => {
    chrome.storage[area].get([key], result => {
      if (chrome.runtime.lastError) {
        console.warn('[NotasPat] Falha ao ler nota do ' + area + ':', chrome.runtime.lastError.message);
        resolve(null);
        return;
      }
      resolve((result || {})[key] || null);
    });
  });

  return Promise.all([ler('sync'), ler('local')]).then(([doSync, doLocal]) => {
    if (!doSync || !doLocal) return doSync || doLocal || null;
    const tSync = new Date(doSync.updatedAt || 0).getTime() || 0;
    const tLocal = new Date(doLocal.updatedAt || 0).getTime() || 0;
    return tLocal > tSync ? doLocal : doSync;
  });
}

/**
 * Cria ou atualiza uma nota (escrita individual)
 * @param {string} protocolo - Número do protocolo
 * @param {string} text - Texto da nota
 * @param {string} color - Cor da nota (hex)
 * @param {string[]} tags - Array de tags
 * @param {string} reminder - Data do lembrete (ISO string) opcional
 * @returns {Promise<Object>} Nota salva; rejeita com erro QUOTA_EXCEEDED se
 *   ficou salva apenas neste computador
 */
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

/**
 * Altera campos de uma nota existente e grava com fallback.
 * @param {string} protocolo
 * @param {Object} changes - campos a sobrescrever
 * @returns {Promise<Object|null>} nota atualizada, ou null se nao existe
 */
function updateExistingNote(protocolo, changes) {
  const key = NOTE_PREFIX + protocolo;
  return readExistingNote(key).then(existing => {
    if (!existing) return null;
    const note = Object.assign({}, existing, changes, { updatedAt: new Date().toISOString() });
    return writeNoteWithFallback(key, note);
  });
}

/**
 * Remove chaves do sync E do local. Uma copia sobrevivente em qualquer um
 * dos dois faria a nota excluida reaparecer na leitura seguinte (merge).
 * @param {string|string[]} keys
 * @returns {Promise<void>} rejeita se qualquer namespace falhar
 */
function removeFromBothAreas(keys) {
  const remover = area => new Promise((resolve, reject) => {
    chrome.storage[area].remove(keys, () => {
      if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
      else resolve();
    });
  });
  return Promise.all([remover('sync'), remover('local')]).then(() => undefined);
}

/**
 * Remove uma nota pelo protocolo (sync + local)
 * @param {string} protocolo - Número do protocolo
 * @returns {Promise<boolean>} True se removeu com sucesso
 */
function deleteNote(protocolo) {
  return removeFromBothAreas(NOTE_PREFIX + protocolo).then(() => true);
}

/**
 * Remove TODAS as notas do storage, sync + local (mantém outros dados como
 * templates, theme, etc.)
 * A promocao em segundo plano disparada por getAllNotes nao traz as notas
 * de volta: ela so promove o que continua em local (filterUnchangedLocalNotes).
 * @returns {Promise<void>}
 */
function deleteAllNotes() {
  return getAllNotes().then(notes => {
    const keys = Object.keys(notes).map(p => NOTE_PREFIX + p);
    if (keys.length === 0) return undefined;
    return removeFromBothAreas(keys);
  });
}

/**
 * Altera apenas a cor de uma nota (leitura/escrita individual)
 * @param {string} protocolo - Número do protocolo
 * @param {string} color - Nova cor (hex)
 * @returns {Promise<Object|null>} Nota atualizada (null se nao existe); rejeita
 *   com erro QUOTA_EXCEEDED se ficou salva apenas neste computador
 */
function updateNoteColor(protocolo, color) {
  return updateExistingNote(protocolo, { color: color });
}

/**
 * Atualiza as tags de uma nota (leitura/escrita individual)
 * @param {string} protocolo - Número do protocolo
 * @param {string[]} tags - Array de tags
 * @returns {Promise<Object|null>} Nota atualizada (null se nao existe); rejeita
 *   com erro QUOTA_EXCEEDED se ficou salva apenas neste computador
 */
function updateNoteTags(protocolo, tags) {
  return updateExistingNote(protocolo, { tags: tags });
}

/**
 * Define um lembrete para uma nota (leitura/escrita individual)
 * @param {string} protocolo - Número do protocolo
 * @param {string} reminder - Data do lembrete (ISO string)
 * @returns {Promise<Object|null>} Nota atualizada (null se nao existe); rejeita
 *   com erro QUOTA_EXCEEDED se ficou salva apenas neste computador
 */
function setNoteReminder(protocolo, reminder) {
  return updateExistingNote(protocolo, { reminder: reminder });
}

/**
 * Retorna notas com lembretes pendentes
 * @returns {Promise<Object[]>} Array de notas com lembretes
 */
function getNotesWithReminders() {
  return new Promise((resolve, reject) => {
    getAllNotes().then(notes => {
      const now = new Date();
      const pendingReminders = Object.values(notes).filter(note => {
        if (!note.reminder) return false;
        return new Date(note.reminder) > now;
      });
      resolve(pendingReminders);
    }).catch(reject);
  });
}

/**
 * Exporta todas as notas como JSON string
 * @returns {Promise<string>} JSON string das notas
 */
function exportNotes() {
  return new Promise((resolve, reject) => {
    getAllNotes().then(notes => {
      const exportData = {
        version: '1.3.2',
        exportDate: new Date().toISOString(),
        notes: notes
      };
      resolve(JSON.stringify(exportData, null, 2));
    }).catch(reject);
  });
}

/**
 * Importa notas de JSON string (gravacao em lote)
 * As que cabem vao para o sync num unico set (gravar nota a nota estouraria
 * o limite de 120 escritas/min); as demais ficam em local com _syncFallback.
 * @param {string} jsonString - JSON string das notas
 * @returns {Promise<Object>} Objeto com notas importadas { protocolo: nota };
 *   rejeita com erro QUOTA_EXCEEDED (com .imported) depois de gravar tudo,
 *   se alguma nota ficou salva apenas neste computador
 */
function importNotes(jsonString) {
  let importData;
  try {
    importData = JSON.parse(jsonString);
  } catch (e) {
    return Promise.reject(new Error('Erro ao ler arquivo JSON: ' + e.message));
  }

  if (!importData || !importData.notes || typeof importData.notes !== 'object') {
    return Promise.reject(new Error('Formato de arquivo inválido'));
  }

  // Preparar chaves individuais para gravação
  const imported = {};
  const entries = {};
  try {
    Object.entries(importData.notes).forEach(([protocolo, note]) => {
      if (!note.tags) note.tags = [];
      if (!note.reminder) note.reminder = null;
      imported[protocolo] = note;
      entries[NOTE_PREFIX + protocolo] = withoutSyncFallback(note);
    });
  } catch (e) {
    return Promise.reject(new Error('Erro ao ler arquivo JSON: ' + e.message));
  }

  return planSyncBatch(entries).then(({ fits, rest }) => {
    return writeSyncBatch(fits).then(limitType => {
      // Se o lote do sync falhou, todas as notas dele ficam em local
      const paraLocal = limitType ? Object.assign({}, rest, fits) : rest;
      return saveBatchToLocalFallback(paraLocal).then(() => Object.keys(paraLocal).length);
    });
  }).then(soLocal => {
    if (soLocal > 0) {
      const erro = createQuotaError('TOTAL', soLocal + ' nota(s) importada(s) nao couberam no limite de sincronizacao e foram salvas apenas neste computador. Exclua notas de tarefas ja concluidas para sincroniza-las.');
      erro.imported = imported;
      throw erro;
    }
    return imported;
  });
}

/**
 * Conta o total de notas salvas
 * @returns {Promise<number>} Total de notas
 */
function countNotes() {
  return new Promise((resolve, reject) => {
    getAllNotes().then(notes => {
      resolve(Object.keys(notes).length);
    }).catch(reject);
  });
}

/**
 * Saude do storage medida em BYTES do sync, nao em contagem de notas.
 * O gargalo agora e o teto de 100 KB, nao a quantidade.
 * Avisa a 70% para dar folga antes do bloqueio rigido.
 * @returns {Promise<{ok: boolean, percentUsed: number, warning: string|null}>}
 *   percentUsed de 0 a 1; nunca rejeita (se a leitura falhar, reporta saudavel)
 */
function checkStorageHealth() {
  return new Promise((resolve) => {
    chrome.storage.sync.getBytesInUse(null, (bytesInUse) => {
      if (chrome.runtime.lastError) {
        resolve({ ok: true, percentUsed: 0, warning: null });
        return;
      }
      const percentUsed = (bytesInUse || 0) / SYNC_QUOTA_BYTES_TOTAL;
      let warning = null;
      if (percentUsed >= 0.7) {
        warning = `Voce esta usando ${Math.round(percentUsed * 100)}% do limite de sincronizacao. Considere excluir notas de tarefas ja concluidas para manter a sincronizacao entre computadores.`;
      }
      resolve({ ok: percentUsed < 0.7, percentUsed, warning });
    });
  });
}

/**
 * Busca notas por texto ou protocolo
 * @param {string} query - Termo de busca
 * @returns {Promise<Object>} Notas encontradas
 */
function searchNotes(query) {
  return new Promise((resolve, reject) => {
    getAllNotes().then(notes => {
      const lowerQuery = query.toLowerCase();
      const results = {};

      Object.entries(notes).forEach(([protocolo, nota]) => {
        if (protocolo.includes(query) ||
          nota.text.toLowerCase().includes(lowerQuery) ||
          (nota.tags && nota.tags.some(tag => tag.includes(lowerQuery)))) {
          results[protocolo] = nota;
        }
      });

      resolve(results);
    }).catch(reject);
  });
}

/**
 * Retorna estatísticas das notas
 * @returns {Promise<Object>} Estatísticas
 */
function getNotesStats() {
  return new Promise((resolve, reject) => {
    getAllNotes().then(notes => {
      const noteList = Object.values(notes);
      const now = new Date();
      const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      const stats = {
        total: noteList.length,
        thisWeek: noteList.filter(n => new Date(n.createdAt) >= oneWeekAgo).length,
        byColor: {},
        byTag: {}
      };

      noteList.forEach(note => {
        // Por cor
        stats.byColor[note.color] = (stats.byColor[note.color] || 0) + 1;

        // Por tag
        (note.tags || []).forEach(tag => {
          stats.byTag[tag] = (stats.byTag[tag] || 0) + 1;
        });
      });

      resolve(stats);
    }).catch(reject);
  });
}

// ============ TEXTOS PADRAO ============

const STANDARD_TEXTS_KEY = 'standard_texts';

// Mensagens do fallback local dos textos padrao (as padrao de createQuotaError falam de "nota")
const STANDARD_TEXTS_QUOTA_MESSAGES = {
  PER_ITEM: 'Os textos padrao ultrapassaram o limite de 8 KB para sincronizar e foram salvos apenas neste computador. Remova textos que nao usa para voltar a sincronizar.',
  TOTAL: 'Limite de sincronizacao atingido - os textos padrao foram salvos apenas neste computador. Exclua notas de tarefas ja concluidas ou textos que nao usa para voltar a sincronizar.',
  MAX_ITEMS: 'Limite de 512 itens sincronizados atingido - os textos padrao foram salvos apenas neste computador. Exclua notas de tarefas ja concluidas para voltar a sincronizar.',
  RATE: 'Muitas gravacoes em sequencia - os textos padrao foram salvos neste computador e serao sincronizados na proxima alteracao.'
};

/**
 * Gera um ID unico para texto padrao
 */
function generateStdTextId() {
  return 'st_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
}

/**
 * Retorna todos os textos padrao (sync + local).
 * Prefere o local quando e um array NAO vazio: ele so existe quando a ultima
 * gravacao desta maquina nao coube no sync, e o sync ainda tem a versao
 * anterior. Array vazio em local (criado na instalacao) nao esconde o sync.
 * @returns {Promise<Array>} Array de textos (retorna [] se chave nao existir);
 *   rejeita se a leitura de qualquer namespace falhar (gravar sobre uma base
 *   incompleta apagaria textos)
 */
function getStandardTexts() {
  const ler = area => new Promise((resolve, reject) => {
    chrome.storage[area].get([STANDARD_TEXTS_KEY], (result) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
        return;
      }
      resolve((result || {})[STANDARD_TEXTS_KEY]);
    });
  });

  return Promise.all([ler('sync'), ler('local')]).then(([doSync, doLocal]) => {
    if (Array.isArray(doLocal) && doLocal.length > 0) return doLocal;
    return Array.isArray(doSync) ? doSync : [];
  });
}

/**
 * Grava o array de textos padrao no sync; se nao couber, grava em local.
 * standard_texts e UMA chave com o array inteiro, entao esta sujeita ao
 * teto de 8 KB como um todo: se nao couber, a chave inteira fica em local.
 * @param {Array} texts
 * @returns {Promise<Array>} texts gravados no sync; rejeita com erro
 *   QUOTA_EXCEEDED depois de salvar em local
 */
function writeStandardTexts(texts) {
  return checkQuotaBeforeWrite(STANDARD_TEXTS_KEY, texts)
    // A checagem nao elimina a corrida com outra gravacao: o set ainda pode falhar
    .then(check => (check.ok ? syncSetWithRateRetry({ [STANDARD_TEXTS_KEY]: texts }) : check.limitType))
    .then(limitType => new Promise((resolve, reject) => {
      if (limitType) {
        chrome.storage.local.set({ [STANDARD_TEXTS_KEY]: texts }, () => {
          if (chrome.runtime.lastError) { reject(chrome.runtime.lastError); return; }
          console.warn('[NotasPat] Textos padrao salvos apenas neste computador (' + limitType + ')');
          reject(createQuotaError(limitType, STANDARD_TEXTS_QUOTA_MESSAGES[limitType] || STANDARD_TEXTS_QUOTA_MESSAGES.TOTAL));
        });
        return;
      }
      // A copia local restante esconderia a versao nova do sync (getStandardTexts
      // prefere local): se nao sair, rejeita em vez de dar como salvo
      chrome.storage.local.remove(STANDARD_TEXTS_KEY, () => {
        if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
        else resolve(texts);
      });
    }));
}

/**
 * Repassa o erro, anexando ao erro de quota o resultado que ficou salvo em
 * local (a UI trata como salvo e mostra o aviso).
 * @param {string} campo - 'entry' ou 'texts'
 * @param {*} valor
 * @returns {function(*): never}
 */
function rethrowWithSavedResult(campo, valor) {
  return err => {
    if (isQuotaError(err)) err[campo] = valor;
    throw err;
  };
}

/**
 * Salva um novo texto padrao
 * @param {string} title - Titulo (obrigatorio, max 100 chars)
 * @param {string} text - Conteudo (min 30 chars)
 * @returns {Promise<Object>} Texto criado; rejeita com erro QUOTA_EXCEEDED
 *   (com .entry) se os textos ficaram salvos apenas neste computador
 */
function saveStandardText(title, text) {
  const trimmedTitle = (title || '').trim();
  const trimmedText = (text || '').trim();
  if (!trimmedTitle) return Promise.reject(new Error('Titulo e obrigatorio'));
  if (trimmedTitle.length > 100) return Promise.reject(new Error('Titulo deve ter no maximo 100 caracteres'));
  if (trimmedText.length < 30) return Promise.reject(new Error('Texto deve ter no minimo 30 caracteres'));

  return getStandardTexts().then(texts => {
    const now = new Date().toISOString();
    const entry = {
      id: generateStdTextId(),
      title: trimmedTitle,
      text: trimmedText,
      createdAt: now,
      updatedAt: now
    };
    texts.push(entry);
    return writeStandardTexts(texts).then(() => entry, rethrowWithSavedResult('entry', entry));
  });
}

/**
 * Atualiza um texto padrao existente
 * @param {string} id - ID do texto
 * @param {string} title - Novo titulo
 * @param {string} text - Novo conteudo
 * @returns {Promise<Object>} Texto atualizado; rejeita com erro QUOTA_EXCEEDED
 *   (com .entry) se os textos ficaram salvos apenas neste computador
 */
function updateStandardText(id, title, text) {
  const trimmedTitle = (title || '').trim();
  const trimmedText = (text || '').trim();
  if (!trimmedTitle) return Promise.reject(new Error('Titulo e obrigatorio'));
  if (trimmedTitle.length > 100) return Promise.reject(new Error('Titulo deve ter no maximo 100 caracteres'));
  if (trimmedText.length < 30) return Promise.reject(new Error('Texto deve ter no minimo 30 caracteres'));

  return getStandardTexts().then(texts => {
    const index = texts.findIndex(t => t.id === id);
    if (index === -1) throw new Error('Texto nao encontrado');
    const entry = texts[index];
    entry.title = trimmedTitle;
    entry.text = trimmedText;
    entry.updatedAt = new Date().toISOString();
    return writeStandardTexts(texts).then(() => entry, rethrowWithSavedResult('entry', entry));
  });
}

/**
 * Remove um texto padrao
 * @param {string} id - ID do texto
 * @returns {Promise<boolean>} rejeita com erro QUOTA_EXCEEDED (com .texts)
 *   se os textos ficaram salvos apenas neste computador
 */
function deleteStandardText(id) {
  return getStandardTexts().then(texts => {
    const filtered = texts.filter(t => t.id !== id);
    return writeStandardTexts(filtered).then(() => true, rethrowWithSavedResult('texts', filtered));
  });
}

/**
 * Exporta textos padrao como JSON string
 * @returns {Promise<string>}
 */
function exportStandardTexts() {
  return new Promise((resolve, reject) => {
    getStandardTexts().then(texts => {
      const exportData = {
        version: '1.0',
        type: 'standard_texts',
        exportDate: new Date().toISOString(),
        texts: texts
      };
      resolve(JSON.stringify(exportData, null, 2));
    }).catch(reject);
  });
}

/**
 * Importa textos padrao de JSON string
 * @param {string} jsonString - JSON exportado
 * @param {boolean} replace - true = substituir, false = mesclar
 * @returns {Promise<Array>} Textos resultantes; rejeita com erro
 *   QUOTA_EXCEEDED (com .texts) se ficaram salvos apenas neste computador
 */
function importStandardTexts(jsonString, replace) {
  let importData;
  try {
    importData = JSON.parse(jsonString);
    if (importData.type !== 'standard_texts') {
      return Promise.reject(new Error('Arquivo nao e um export de textos padrao'));
    }
    if (!Array.isArray(importData.texts)) {
      return Promise.reject(new Error('Formato de arquivo invalido'));
    }
  } catch (e) {
    return Promise.reject(new Error('Erro ao ler arquivo JSON: ' + e.message));
  }

  if (replace) {
    const texts = importData.texts;
    return writeStandardTexts(texts).then(() => texts, rethrowWithSavedResult('texts', texts));
  }

  return getStandardTexts().then(existing => {
    const now = Date.now();
    importData.texts.forEach((entry, i) => {
      entry.id = 'st_' + (now + i) + '_' + Math.random().toString(36).substring(2, 7);
    });
    const merged = existing.concat(importData.texts);
    return writeStandardTexts(merged).then(() => merged, rethrowWithSavedResult('texts', merged));
  });
}

/**
 * Verifica saude dos textos padrao
 * @returns {Promise<Object>} { ok, count, warning }
 */
function checkStandardTextsHealth() {
  return new Promise((resolve, reject) => {
    getStandardTexts().then(texts => {
      const count = texts.length;
      let warning = null;
      if (count >= 200) {
        warning = `Voce possui ${count} textos padrao salvos. Considere remover textos que nao utiliza mais.`;
      }
      resolve({ ok: count < 200, count, warning });
    }).catch(reject);
  });
}
