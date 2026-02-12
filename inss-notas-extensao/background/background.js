/**
 * Background Service Worker - NotasPat
 * Manifest V3 - Versão 1.3.0
 * Com suporte a notificações, lembretes e storage granular
 */

const NOTE_PREFIX = 'note_';
const ALARM_PREFIX = 'reminder_';
const OLD_STORAGE_KEY = 'notes'; // Para migração do formato antigo

// ============ INSTALAÇÃO E ATUALIZAÇÃO ============

chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    // Inicializar storage
    await chrome.storage.local.set({
      templates: getDefaultTemplates(),
      theme: 'light'
    });
    console.log('[NotasPat] Storage inicializado');
  } else if (details.reason === 'update') {
    const previousVersion = details.previousVersion;
    const currentVersion = chrome.runtime.getManifest().version;
    console.log(`[NotasPat] Atualizado de v${previousVersion} para v${currentVersion}`);
  }

  // Migrar formato antigo (notes: {}) para granular (note_<protocolo>)
  await migrateToGranularStorage();

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

// ============ HELPERS ============

/**
 * Coleta todas as notas do storage granular
 */
async function getAllNotesFromStorage() {
  const result = await chrome.storage.local.get(null);
  const notes = {};
  for (const key of Object.keys(result)) {
    if (key.startsWith(NOTE_PREFIX)) {
      const protocolo = key.substring(NOTE_PREFIX.length);
      notes[protocolo] = result[key];
    }
  }
  return notes;
}

/**
 * Lê uma nota individual do storage
 */
async function getNoteFromStorage(protocolo) {
  const key = NOTE_PREFIX + protocolo;
  const result = await chrome.storage.local.get([key]);
  return result[key] || null;
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
      chrome.notifications.create(`notification_${protocolo}`, {
        type: 'basic',
        iconUrl: 'icons/icon128.png',
        title: '📝 Lembrete - NotasPat',
        message: `Protocolo ${protocolo}: ${nota.text.substring(0, 100)}${nota.text.length > 100 ? '...' : ''}`,
        priority: 2
      });

      // Limpar lembrete da nota (escrita individual)
      nota.reminder = null;
      await chrome.storage.local.set({ [NOTE_PREFIX + protocolo]: nota });
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
      chrome.action.setBadgeBackgroundColor({ color: '#1351b4' });
    } else {
      chrome.action.setBadgeText({ text: '' });
    }
  } catch (error) {
    console.error('[NotasPat] Erro ao atualizar badge:', error);
  }
}

// ============ LISTENER DE MUDANÇAS NO STORAGE ============

chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace !== 'local') return;

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

    default:
      return false;
  }
});

async function setReminderForNote(protocolo, reminderDate) {
  const key = NOTE_PREFIX + protocolo;
  const result = await chrome.storage.local.get([key]);
  const nota = result[key];

  if (nota) {
    nota.reminder = reminderDate;
    nota.updatedAt = new Date().toISOString();

    await chrome.storage.local.set({ [key]: nota });

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
migrateToGranularStorage().then(() => {
  updateBadge();
});

console.log('[NotasPat] Background Service Worker v1.3.0 carregado');
