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
 * Depende de lib/quota.js (carregado antes deste arquivo).
 */

const NOTE_PREFIX = 'note_';

/**
 * Retorna todas as notas do storage (filtra por prefixo note_)
 * @returns {Promise<Object>} Objeto com todas as notas { protocolo: nota }
 */
function getAllNotes() {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(null, (result) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
        return;
      }
      const notes = {};
      for (const key of Object.keys(result)) {
        if (key.startsWith(NOTE_PREFIX)) {
          const protocolo = key.substring(NOTE_PREFIX.length);
          notes[protocolo] = result[key];
        }
      }
      resolve(notes);
    });
  });
}

/**
 * Retorna nota de um protocolo específico (leitura individual)
 * @param {string} protocolo - Número do protocolo
 * @returns {Promise<Object|null>} Nota encontrada ou null
 */
function getNote(protocolo) {
  const key = NOTE_PREFIX + protocolo;
  return new Promise((resolve, reject) => {
    chrome.storage.local.get([key], (result) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve(result[key] || null);
      }
    });
  });
}

/**
 * Retorna notas para uma lista de protocolos (batch-get eficiente)
 * @param {string[]} protocolos - Array de números de protocolo
 * @returns {Promise<Object>} Objeto com notas encontradas { protocolo: nota }
 */
function getNotesForProtocolos(protocolos) {
  if (!protocolos || protocolos.length === 0) {
    return Promise.resolve({});
  }
  const keys = protocolos.map(p => NOTE_PREFIX + p);
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(keys, (result) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
        return;
      }
      const notes = {};
      for (const key of Object.keys(result)) {
        if (key.startsWith(NOTE_PREFIX)) {
          notes[key.substring(NOTE_PREFIX.length)] = result[key];
        }
      }
      resolve(notes);
    });
  });
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
 * updatedAt (empate: a do sync). Nao usa getNote() porque nesta etapa
 * getNote ainda le so um namespace.
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
 * Remove uma nota pelo protocolo (remoção direta da chave)
 * @param {string} protocolo - Número do protocolo
 * @returns {Promise<boolean>} True se removeu com sucesso
 */
function deleteNote(protocolo) {
  const key = NOTE_PREFIX + protocolo;
  return new Promise((resolve, reject) => {
    chrome.storage.local.remove(key, () => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve(true);
      }
    });
  });
}

/**
 * Remove TODAS as notas do storage (mantém outros dados como templates, theme, etc.)
 * @returns {Promise<void>}
 */
function deleteAllNotes() {
  return new Promise((resolve, reject) => {
    getAllNotes().then(notes => {
      const keys = Object.keys(notes).map(p => NOTE_PREFIX + p);
      if (keys.length === 0) { resolve(); return; }
      chrome.storage.local.remove(keys, () => {
        if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
        else resolve();
      });
    }).catch(reject);
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
 * Verifica a saude do storage e retorna alertas se necessario
 * @returns {Promise<Object>} { ok: boolean, count: number, warning: string|null }
 */
function checkStorageHealth() {
  return new Promise((resolve, reject) => {
    getAllNotes().then(notes => {
      const count = Object.keys(notes).length;
      let warning = null;

      if (count >= 500) {
        warning = `Voce possui ${count} notas salvas. Para manter o bom desempenho da extensao, considere excluir notas de tarefas ja concluidas.`;
      }

      resolve({ ok: count < 500, count, warning });
    }).catch(reject);
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

/**
 * Gera um ID unico para texto padrao
 */
function generateStdTextId() {
  return 'st_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
}

/**
 * Retorna todos os textos padrao
 * @returns {Promise<Array>} Array de textos (retorna [] se chave nao existir)
 */
function getStandardTexts() {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get([STANDARD_TEXTS_KEY], (result) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
        return;
      }
      resolve(result[STANDARD_TEXTS_KEY] || []);
    });
  });
}

/**
 * Salva um novo texto padrao
 * @param {string} title - Titulo (obrigatorio, max 100 chars)
 * @param {string} text - Conteudo (min 30 chars)
 * @returns {Promise<Object>} Texto criado
 */
function saveStandardText(title, text) {
  const trimmedTitle = (title || '').trim();
  const trimmedText = (text || '').trim();
  if (!trimmedTitle) return Promise.reject(new Error('Titulo e obrigatorio'));
  if (trimmedTitle.length > 100) return Promise.reject(new Error('Titulo deve ter no maximo 100 caracteres'));
  if (trimmedText.length < 30) return Promise.reject(new Error('Texto deve ter no minimo 30 caracteres'));

  return new Promise((resolve, reject) => {
    chrome.storage.local.get([STANDARD_TEXTS_KEY], (result) => {
      if (chrome.runtime.lastError) { reject(chrome.runtime.lastError); return; }
      const texts = result[STANDARD_TEXTS_KEY] || [];
      const now = new Date().toISOString();
      const entry = {
        id: generateStdTextId(),
        title: trimmedTitle,
        text: trimmedText,
        createdAt: now,
        updatedAt: now
      };
      texts.push(entry);
      chrome.storage.local.set({ [STANDARD_TEXTS_KEY]: texts }, () => {
        if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
        else resolve(entry);
      });
    });
  });
}

/**
 * Atualiza um texto padrao existente
 * @param {string} id - ID do texto
 * @param {string} title - Novo titulo
 * @param {string} text - Novo conteudo
 * @returns {Promise<Object>} Texto atualizado
 */
function updateStandardText(id, title, text) {
  const trimmedTitle = (title || '').trim();
  const trimmedText = (text || '').trim();
  if (!trimmedTitle) return Promise.reject(new Error('Titulo e obrigatorio'));
  if (trimmedTitle.length > 100) return Promise.reject(new Error('Titulo deve ter no maximo 100 caracteres'));
  if (trimmedText.length < 30) return Promise.reject(new Error('Texto deve ter no minimo 30 caracteres'));

  return new Promise((resolve, reject) => {
    chrome.storage.local.get([STANDARD_TEXTS_KEY], (result) => {
      if (chrome.runtime.lastError) { reject(chrome.runtime.lastError); return; }
      const texts = result[STANDARD_TEXTS_KEY] || [];
      const index = texts.findIndex(t => t.id === id);
      if (index === -1) { reject(new Error('Texto nao encontrado')); return; }
      texts[index].title = trimmedTitle;
      texts[index].text = trimmedText;
      texts[index].updatedAt = new Date().toISOString();
      chrome.storage.local.set({ [STANDARD_TEXTS_KEY]: texts }, () => {
        if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
        else resolve(texts[index]);
      });
    });
  });
}

/**
 * Remove um texto padrao
 * @param {string} id - ID do texto
 * @returns {Promise<boolean>}
 */
function deleteStandardText(id) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get([STANDARD_TEXTS_KEY], (result) => {
      if (chrome.runtime.lastError) { reject(chrome.runtime.lastError); return; }
      const texts = result[STANDARD_TEXTS_KEY] || [];
      const filtered = texts.filter(t => t.id !== id);
      chrome.storage.local.set({ [STANDARD_TEXTS_KEY]: filtered }, () => {
        if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
        else resolve(true);
      });
    });
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
 * @returns {Promise<Array>} Textos resultantes
 */
function importStandardTexts(jsonString, replace) {
  return new Promise((resolve, reject) => {
    try {
      const importData = JSON.parse(jsonString);
      if (importData.type !== 'standard_texts') {
        reject(new Error('Arquivo nao e um export de textos padrao'));
        return;
      }
      if (!Array.isArray(importData.texts)) {
        reject(new Error('Formato de arquivo invalido'));
        return;
      }

      if (replace) {
        chrome.storage.local.set({ [STANDARD_TEXTS_KEY]: importData.texts }, () => {
          if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
          else resolve(importData.texts);
        });
      } else {
        chrome.storage.local.get([STANDARD_TEXTS_KEY], (result) => {
          if (chrome.runtime.lastError) { reject(chrome.runtime.lastError); return; }
          const existing = result[STANDARD_TEXTS_KEY] || [];
          const now = Date.now();
          importData.texts.forEach((entry, i) => {
            entry.id = 'st_' + (now + i) + '_' + Math.random().toString(36).substring(2, 7);
          });
          const merged = existing.concat(importData.texts);
          chrome.storage.local.set({ [STANDARD_TEXTS_KEY]: merged }, () => {
            if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
            else resolve(merged);
          });
        });
      }
    } catch (e) {
      reject(new Error('Erro ao ler arquivo JSON: ' + e.message));
    }
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
