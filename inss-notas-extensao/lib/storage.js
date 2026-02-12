/**
 * Módulo de Persistência - NotasPat
 * CRUD para chrome.storage.local
 * Versão 1.3.0 - Storage granular (chave individual por nota)
 *
 * Formato: cada nota é armazenada como { "note_<protocolo>": { ...dados } }
 * Isso evita o padrão read-all/write-all que degradava com muitas notas.
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
 * Cria ou atualiza uma nota (escrita individual)
 * @param {string} protocolo - Número do protocolo
 * @param {string} text - Texto da nota
 * @param {string} color - Cor da nota (hex)
 * @param {string[]} tags - Array de tags
 * @param {string} reminder - Data do lembrete (ISO string) opcional
 * @returns {Promise<Object>} Nota salva
 */
function saveNote(protocolo, text, color, tags = [], reminder = null) {
  const key = NOTE_PREFIX + protocolo;
  return new Promise((resolve, reject) => {
    // Ler apenas esta nota para preservar createdAt
    chrome.storage.local.get([key], (result) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
        return;
      }

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

      chrome.storage.local.set({ [key]: note }, () => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(note);
        }
      });
    });
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
 * Altera apenas a cor de uma nota (leitura/escrita individual)
 * @param {string} protocolo - Número do protocolo
 * @param {string} color - Nova cor (hex)
 * @returns {Promise<Object>} Nota atualizada
 */
function updateNoteColor(protocolo, color) {
  const key = NOTE_PREFIX + protocolo;
  return new Promise((resolve, reject) => {
    chrome.storage.local.get([key], (result) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
        return;
      }
      const note = result[key];
      if (note) {
        note.color = color;
        note.updatedAt = new Date().toISOString();
        chrome.storage.local.set({ [key]: note }, () => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            resolve(note);
          }
        });
      } else {
        resolve(null);
      }
    });
  });
}

/**
 * Atualiza as tags de uma nota (leitura/escrita individual)
 * @param {string} protocolo - Número do protocolo
 * @param {string[]} tags - Array de tags
 * @returns {Promise<Object>} Nota atualizada
 */
function updateNoteTags(protocolo, tags) {
  const key = NOTE_PREFIX + protocolo;
  return new Promise((resolve, reject) => {
    chrome.storage.local.get([key], (result) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
        return;
      }
      const note = result[key];
      if (note) {
        note.tags = tags;
        note.updatedAt = new Date().toISOString();
        chrome.storage.local.set({ [key]: note }, () => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            resolve(note);
          }
        });
      } else {
        resolve(null);
      }
    });
  });
}

/**
 * Define um lembrete para uma nota (leitura/escrita individual)
 * @param {string} protocolo - Número do protocolo
 * @param {string} reminder - Data do lembrete (ISO string)
 * @returns {Promise<Object>} Nota atualizada
 */
function setNoteReminder(protocolo, reminder) {
  const key = NOTE_PREFIX + protocolo;
  return new Promise((resolve, reject) => {
    chrome.storage.local.get([key], (result) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
        return;
      }
      const note = result[key];
      if (note) {
        note.reminder = reminder;
        note.updatedAt = new Date().toISOString();
        chrome.storage.local.set({ [key]: note }, () => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            resolve(note);
          }
        });
      } else {
        resolve(null);
      }
    });
  });
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
        version: '1.3.0',
        exportDate: new Date().toISOString(),
        notes: notes
      };
      resolve(JSON.stringify(exportData, null, 2));
    }).catch(reject);
  });
}

/**
 * Importa notas de JSON string (grava cada nota individualmente)
 * @param {string} jsonString - JSON string das notas
 * @returns {Promise<Object>} Objeto com notas importadas
 */
function importNotes(jsonString) {
  return new Promise((resolve, reject) => {
    try {
      const importData = JSON.parse(jsonString);

      if (!importData.notes || typeof importData.notes !== 'object') {
        reject(new Error('Formato de arquivo inválido'));
        return;
      }

      // Preparar chaves individuais para gravação
      const keysToSet = {};
      Object.entries(importData.notes).forEach(([protocolo, note]) => {
        if (!note.tags) note.tags = [];
        if (!note.reminder) note.reminder = null;
        keysToSet[NOTE_PREFIX + protocolo] = note;
      });

      chrome.storage.local.set(keysToSet, () => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          // Retornar as notas importadas no formato { protocolo: nota }
          const imported = {};
          Object.entries(importData.notes).forEach(([protocolo, note]) => {
            imported[protocolo] = note;
          });
          resolve(imported);
        }
      });

    } catch (e) {
      reject(new Error('Erro ao ler arquivo JSON: ' + e.message));
    }
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
