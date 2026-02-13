/**
 * Módulo de Persistência - NotasPat (Firefox)
 * CRUD para browser.storage.local
 * Versão 1.3.0 - Storage granular (chave individual por nota)
 *
 * Formato: cada nota é armazenada como { "note_<protocolo>": { ...dados } }
 * Usa browser.* APIs nativas do Firefox com async/await (sem callbacks).
 */

const NOTE_PREFIX = 'note_';

/**
 * Retorna todas as notas do storage (filtra por prefixo note_)
 * @returns {Promise<Object>} Objeto com todas as notas { protocolo: nota }
 */
async function getAllNotes() {
  const result = await browser.storage.local.get(null);
  const notes = {};
  for (const key of Object.keys(result)) {
    if (key.startsWith(NOTE_PREFIX)) {
      notes[key.substring(NOTE_PREFIX.length)] = result[key];
    }
  }
  return notes;
}

/**
 * Retorna nota de um protocolo específico (leitura individual)
 * @param {string} protocolo - Número do protocolo
 * @returns {Promise<Object|null>} Nota encontrada ou null
 */
async function getNote(protocolo) {
  const key = NOTE_PREFIX + protocolo;
  const result = await browser.storage.local.get([key]);
  return result[key] || null;
}

/**
 * Retorna notas para uma lista de protocolos (batch-get eficiente)
 * @param {string[]} protocolos - Array de números de protocolo
 * @returns {Promise<Object>} Objeto com notas encontradas { protocolo: nota }
 */
async function getNotesForProtocolos(protocolos) {
  if (!protocolos || protocolos.length === 0) {
    return {};
  }
  const keys = protocolos.map(p => NOTE_PREFIX + p);
  const result = await browser.storage.local.get(keys);
  const notes = {};
  for (const key of Object.keys(result)) {
    if (key.startsWith(NOTE_PREFIX)) {
      notes[key.substring(NOTE_PREFIX.length)] = result[key];
    }
  }
  return notes;
}

/**
 * Cria ou atualiza uma nota (escrita individual)
 * @param {string} protocolo - Número do protocolo
 * @param {string} text - Texto da nota
 * @param {string} color - Cor da nota (hex)
 * @param {string[]} tags - Array de tags
 * @param {string} reminder - Data do lembrete (ISO string) opcional
 * @returns {Promise<Object>} Nota salva
 */
async function saveNote(protocolo, text, color, tags = [], reminder = null) {
  const key = NOTE_PREFIX + protocolo;
  const result = await browser.storage.local.get([key]);
  const existing = result[key];
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

  await browser.storage.local.set({ [key]: note });
  return note;
}

/**
 * Remove uma nota pelo protocolo (remoção direta da chave)
 * @param {string} protocolo - Número do protocolo
 * @returns {Promise<boolean>} True se removeu com sucesso
 */
async function deleteNote(protocolo) {
  const key = NOTE_PREFIX + protocolo;
  await browser.storage.local.remove(key);
  return true;
}

/**
 * Altera apenas a cor de uma nota (leitura/escrita individual)
 * @param {string} protocolo - Número do protocolo
 * @param {string} color - Nova cor (hex)
 * @returns {Promise<Object>} Nota atualizada
 */
async function updateNoteColor(protocolo, color) {
  const key = NOTE_PREFIX + protocolo;
  const result = await browser.storage.local.get([key]);
  const note = result[key];
  if (note) {
    note.color = color;
    note.updatedAt = new Date().toISOString();
    await browser.storage.local.set({ [key]: note });
    return note;
  }
  return null;
}

/**
 * Atualiza as tags de uma nota (leitura/escrita individual)
 * @param {string} protocolo - Número do protocolo
 * @param {string[]} tags - Array de tags
 * @returns {Promise<Object>} Nota atualizada
 */
async function updateNoteTags(protocolo, tags) {
  const key = NOTE_PREFIX + protocolo;
  const result = await browser.storage.local.get([key]);
  const note = result[key];
  if (note) {
    note.tags = tags;
    note.updatedAt = new Date().toISOString();
    await browser.storage.local.set({ [key]: note });
    return note;
  }
  return null;
}

/**
 * Define um lembrete para uma nota (leitura/escrita individual)
 * @param {string} protocolo - Número do protocolo
 * @param {string} reminder - Data do lembrete (ISO string)
 * @returns {Promise<Object>} Nota atualizada
 */
async function setNoteReminder(protocolo, reminder) {
  const key = NOTE_PREFIX + protocolo;
  const result = await browser.storage.local.get([key]);
  const note = result[key];
  if (note) {
    note.reminder = reminder;
    note.updatedAt = new Date().toISOString();
    await browser.storage.local.set({ [key]: note });
    return note;
  }
  return null;
}

/**
 * Retorna notas com lembretes pendentes
 * @returns {Promise<Object[]>} Array de notas com lembretes
 */
async function getNotesWithReminders() {
  const notes = await getAllNotes();
  const now = new Date();
  return Object.values(notes).filter(note => {
    if (!note.reminder) return false;
    return new Date(note.reminder) > now;
  });
}

/**
 * Exporta todas as notas como JSON string
 * @returns {Promise<string>} JSON string das notas
 */
async function exportNotes() {
  const notes = await getAllNotes();
  const exportData = {
    version: '1.3.0',
    exportDate: new Date().toISOString(),
    notes: notes
  };
  return JSON.stringify(exportData, null, 2);
}

/**
 * Importa notas de JSON string (grava cada nota individualmente)
 * @param {string} jsonString - JSON string das notas
 * @returns {Promise<Object>} Objeto com notas importadas
 */
async function importNotes(jsonString) {
  const importData = JSON.parse(jsonString);

  if (!importData.notes || typeof importData.notes !== 'object') {
    throw new Error('Formato de arquivo inválido');
  }

  const keysToSet = {};
  Object.entries(importData.notes).forEach(([protocolo, note]) => {
    if (!note.tags) note.tags = [];
    if (!note.reminder) note.reminder = null;
    keysToSet[NOTE_PREFIX + protocolo] = note;
  });

  await browser.storage.local.set(keysToSet);

  const imported = {};
  Object.entries(importData.notes).forEach(([protocolo, note]) => {
    imported[protocolo] = note;
  });
  return imported;
}

/**
 * Conta o total de notas salvas
 * @returns {Promise<number>} Total de notas
 */
async function countNotes() {
  const notes = await getAllNotes();
  return Object.keys(notes).length;
}

/**
 * Verifica a saude do storage e retorna alertas se necessario
 * @returns {Promise<Object>} { ok: boolean, count: number, warning: string|null }
 */
async function checkStorageHealth() {
  const notes = await getAllNotes();
  const count = Object.keys(notes).length;
  let warning = null;

  if (count >= 500) {
    warning = `Voce possui ${count} notas salvas. Para manter o bom desempenho da extensao, considere excluir notas de tarefas ja concluidas.`;
  }

  return { ok: count < 500, count, warning };
}

/**
 * Busca notas por texto ou protocolo
 * @param {string} query - Termo de busca
 * @returns {Promise<Object>} Notas encontradas
 */
async function searchNotes(query) {
  const notes = await getAllNotes();
  const lowerQuery = query.toLowerCase();
  const results = {};

  Object.entries(notes).forEach(([protocolo, nota]) => {
    if (protocolo.includes(query) ||
      nota.text.toLowerCase().includes(lowerQuery) ||
      (nota.tags && nota.tags.some(tag => tag.includes(lowerQuery)))) {
      results[protocolo] = nota;
    }
  });

  return results;
}

/**
 * Retorna estatísticas das notas
 * @returns {Promise<Object>} Estatísticas
 */
async function getNotesStats() {
  const notes = await getAllNotes();
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
    stats.byColor[note.color] = (stats.byColor[note.color] || 0) + 1;
    (note.tags || []).forEach(tag => {
      stats.byTag[tag] = (stats.byTag[tag] || 0) + 1;
    });
  });

  return stats;
}
