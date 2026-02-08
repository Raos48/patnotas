/**
 * Módulo de Persistência - NotasPat
 * CRUD para chrome.storage.local
 * Versão 1.2.0 - Com suporte a tags e lembretes
 */

const STORAGE_KEY = 'notes';

/**
 * Retorna todas as notas do storage
 * @returns {Promise<Object>} Objeto com todas as notas
 */
function getAllNotes() {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get([STORAGE_KEY], (result) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve(result[STORAGE_KEY] || {});
      }
    });
  });
}

/**
 * Retorna nota de um protocolo específico
 * @param {string} protocolo - Número do protocolo
 * @returns {Promise<Object|null>} Nota encontrada ou null
 */
function getNote(protocolo) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get([STORAGE_KEY], (result) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        const notes = result[STORAGE_KEY] || {};
        resolve(notes[protocolo] || null);
      }
    });
  });
}

/**
 * Cria ou atualiza uma nota
 * @param {string} protocolo - Número do protocolo
 * @param {string} text - Texto da nota
 * @param {string} color - Cor da nota (hex)
 * @param {string[]} tags - Array de tags
 * @param {string} reminder - Data do lembrete (ISO string) opcional
 * @returns {Promise<Object>} Nota salva
 */
function saveNote(protocolo, text, color, tags = [], reminder = null) {
  return new Promise((resolve, reject) => {
    getAllNotes().then(notes => {
      const now = new Date().toISOString();
      const isUpdate = notes[protocolo] !== undefined;

      const note = {
        id: protocolo,
        text: text,
        color: color || '#fff8c6',
        tags: tags || [],
        reminder: reminder,
        createdAt: isUpdate ? notes[protocolo].createdAt : now,
        updatedAt: now
      };

      notes[protocolo] = note;

      chrome.storage.local.set({ [STORAGE_KEY]: notes }, () => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(note);
        }
      });
    }).catch(reject);
  });
}

/**
 * Remove uma nota pelo protocolo
 * @param {string} protocolo - Número do protocolo
 * @returns {Promise<boolean>} True se removeu com sucesso
 */
function deleteNote(protocolo) {
  return new Promise((resolve, reject) => {
    getAllNotes().then(notes => {
      if (notes[protocolo]) {
        delete notes[protocolo];

        chrome.storage.local.set({ [STORAGE_KEY]: notes }, () => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            resolve(true);
          }
        });
      } else {
        resolve(false);
      }
    }).catch(reject);
  });
}

/**
 * Altera apenas a cor de uma nota
 * @param {string} protocolo - Número do protocolo
 * @param {string} color - Nova cor (hex)
 * @returns {Promise<Object>} Nota atualizada
 */
function updateNoteColor(protocolo, color) {
  return new Promise((resolve, reject) => {
    getAllNotes().then(notes => {
      if (notes[protocolo]) {
        notes[protocolo].color = color;
        notes[protocolo].updatedAt = new Date().toISOString();

        chrome.storage.local.set({ [STORAGE_KEY]: notes }, () => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            resolve(notes[protocolo]);
          }
        });
      } else {
        resolve(null);
      }
    }).catch(reject);
  });
}

/**
 * Atualiza as tags de uma nota
 * @param {string} protocolo - Número do protocolo
 * @param {string[]} tags - Array de tags
 * @returns {Promise<Object>} Nota atualizada
 */
function updateNoteTags(protocolo, tags) {
  return new Promise((resolve, reject) => {
    getAllNotes().then(notes => {
      if (notes[protocolo]) {
        notes[protocolo].tags = tags;
        notes[protocolo].updatedAt = new Date().toISOString();

        chrome.storage.local.set({ [STORAGE_KEY]: notes }, () => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            resolve(notes[protocolo]);
          }
        });
      } else {
        resolve(null);
      }
    }).catch(reject);
  });
}

/**
 * Define um lembrete para uma nota
 * @param {string} protocolo - Número do protocolo
 * @param {string} reminder - Data do lembrete (ISO string)
 * @returns {Promise<Object>} Nota atualizada
 */
function setNoteReminder(protocolo, reminder) {
  return new Promise((resolve, reject) => {
    getAllNotes().then(notes => {
      if (notes[protocolo]) {
        notes[protocolo].reminder = reminder;
        notes[protocolo].updatedAt = new Date().toISOString();

        chrome.storage.local.set({ [STORAGE_KEY]: notes }, () => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            resolve(notes[protocolo]);
          }
        });
      } else {
        resolve(null);
      }
    }).catch(reject);
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
        version: '1.2.0',
        exportDate: new Date().toISOString(),
        notes: notes
      };
      resolve(JSON.stringify(exportData, null, 2));
    }).catch(reject);
  });
}

/**
 * Importa notas de JSON string
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

      getAllNotes().then(existingNotes => {
        // Mesclar notas (importadas sobrescrevem existentes)
        // Garantir que notas antigas tenham a estrutura nova
        Object.keys(importData.notes).forEach(key => {
          const note = importData.notes[key];
          if (!note.tags) note.tags = [];
          if (!note.reminder) note.reminder = null;
        });

        const mergedNotes = { ...existingNotes, ...importData.notes };

        chrome.storage.local.set({ [STORAGE_KEY]: mergedNotes }, () => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            resolve(mergedNotes);
          }
        });
      }).catch(reject);

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
