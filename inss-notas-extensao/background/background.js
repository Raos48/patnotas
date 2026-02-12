/**
 * Background Service Worker - NotasPat
 * Manifest V3 - Versão 1.2.0
 * Com suporte a notificações e lembretes
 */

const STORAGE_KEY = 'notes';
const ALARM_PREFIX = 'reminder_';

// ============ INSTALAÇÃO E ATUALIZAÇÃO ============

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    // Inicializar storage
    chrome.storage.local.set({
      notes: {},
      templates: getDefaultTemplates(),
      theme: 'light'
    }, () => {
      console.log('[NotasPat] Storage inicializado');
    });
  } else if (details.reason === 'update') {
    const previousVersion = details.previousVersion;
    const currentVersion = chrome.runtime.getManifest().version;

    console.log(`[NotasPat] Atualizado de v${previousVersion} para v${currentVersion}`);

    // Migração de dados se necessário
    migrateData(previousVersion, currentVersion);
  }

  // Reconfigurar alarmes
  setupReminders();
});

function getDefaultTemplates() {
  return [
    { id: 'aguardando-doc', nome: 'Aguardando documentação', texto: 'Aguardando envio de documentação complementar pelo interessado.' },
    { id: 'ligar', nome: 'Ligar para interessado', texto: 'Ligar para o interessado para esclarecer pendências.' },
    { id: 'analise', nome: 'Em análise', texto: 'Processo em análise técnica.' },
    { id: 'retorno', nome: 'Aguardando retorno', texto: 'Aguardando retorno do interessado.' }
  ];
}

async function migrateData(fromVersion, toVersion) {
  try {
    const result = await chrome.storage.local.get([STORAGE_KEY]);
    const notes = result[STORAGE_KEY] || {};

    // Garantir que todas as notas tenham os novos campos
    let needsUpdate = false;
    Object.keys(notes).forEach(key => {
      if (!notes[key].tags) {
        notes[key].tags = [];
        needsUpdate = true;
      }
      if (notes[key].reminder === undefined) {
        notes[key].reminder = null;
        needsUpdate = true;
      }
    });

    if (needsUpdate) {
      await chrome.storage.local.set({ [STORAGE_KEY]: notes });
      console.log('[NotasPat] Dados migrados com sucesso');
    }
  } catch (error) {
    console.error('[NotasPat] Erro na migração:', error);
  }
}

// ============ LEMBRETES E ALARMES ============

async function setupReminders() {
  try {
    // Limpar todos os alarmes existentes
    await chrome.alarms.clearAll();

    // Buscar notas com lembretes
    const result = await chrome.storage.local.get([STORAGE_KEY]);
    const notes = result[STORAGE_KEY] || {};
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
    const result = await chrome.storage.local.get([STORAGE_KEY]);
    const notes = result[STORAGE_KEY] || {};
    const nota = notes[protocolo];

    if (nota) {
      // Mostrar notificação
      chrome.notifications.create(`notification_${protocolo}`, {
        type: 'basic',
        iconUrl: 'icons/icon128.png',
        title: '📝 Lembrete - NotasPat',
        message: `Protocolo ${protocolo}: ${nota.text.substring(0, 100)}${nota.text.length > 100 ? '...' : ''}`,
        priority: 2
      });

      // Limpar lembrete da nota
      nota.reminder = null;
      await chrome.storage.local.set({ [STORAGE_KEY]: notes });
    }
  } catch (error) {
    console.error('[NotasPat] Erro ao processar lembrete:', error);
  }
});

// Click na notificação
chrome.notifications.onClicked.addListener((notificationId) => {
  if (notificationId.startsWith('notification_')) {
    // Abrir popup ou focar na aba do sistema
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
    const result = await chrome.storage.local.get([STORAGE_KEY]);
    const notes = result[STORAGE_KEY] || {};
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

// Atualizar badge e alarmes quando storage muda
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local' && changes[STORAGE_KEY]) {
    updateBadge();

    // Atualizar apenas os alarmes das notas que mudaram (em vez de recriar todos)
    handleRemindersChanged(changes[STORAGE_KEY]);
  }
});

/**
 * Compara oldValue vs newValue do storage para atualizar apenas
 * os alarmes das notas que foram adicionadas, alteradas ou removidas.
 */
async function handleRemindersChanged(change) {
  try {
    const oldNotes = change.oldValue || {};
    const newNotes = change.newValue || {};
    const now = Date.now();

    const allProtocolos = new Set([
      ...Object.keys(oldNotes),
      ...Object.keys(newNotes)
    ]);

    for (const protocolo of allProtocolos) {
      const oldNota = oldNotes[protocolo];
      const newNota = newNotes[protocolo];
      const alarmName = `${ALARM_PREFIX}${protocolo}`;

      if (!newNota && oldNota) {
        // Nota removida: limpar alarme
        await chrome.alarms.clear(alarmName);
        console.log(`[NotasPat] Alarme removido para ${protocolo}`);
      } else if (newNota) {
        const oldReminder = oldNota ? oldNota.reminder : null;
        const newReminder = newNota.reminder;

        // Só atualizar se o lembrete mudou
        if (oldReminder !== newReminder) {
          if (newReminder) {
            const reminderTime = new Date(newReminder).getTime();
            if (reminderTime > now) {
              await chrome.alarms.create(alarmName, { when: reminderTime });
              console.log(`[NotasPat] Alarme atualizado para ${protocolo}`);
            }
          } else {
            // Lembrete removido
            await chrome.alarms.clear(alarmName);
            console.log(`[NotasPat] Alarme removido para ${protocolo}`);
          }
        }
      }
    }
  } catch (error) {
    console.error('[NotasPat] Erro ao atualizar alarmes:', error);
  }
}

// ============ MENSAGENS ============

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  switch (request.action) {
    case 'getBadgeCount':
      chrome.storage.local.get([STORAGE_KEY], (result) => {
        const notes = result[STORAGE_KEY] || {};
        sendResponse({ count: Object.keys(notes).length });
      });
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
  const result = await chrome.storage.local.get([STORAGE_KEY]);
  const notes = result[STORAGE_KEY] || {};

  if (notes[protocolo]) {
    notes[protocolo].reminder = reminderDate;
    notes[protocolo].updatedAt = new Date().toISOString();

    await chrome.storage.local.set({ [STORAGE_KEY]: notes });

    // Criar alarme
    if (reminderDate) {
      const reminderTime = new Date(reminderDate).getTime();
      if (reminderTime > Date.now()) {
        await chrome.alarms.create(`${ALARM_PREFIX}${protocolo}`, {
          when: reminderTime
        });
      }
    } else {
      // Remover alarme se lembrete foi removido
      await chrome.alarms.clear(`${ALARM_PREFIX}${protocolo}`);
    }
  }
}

async function getStats() {
  const result = await chrome.storage.local.get([STORAGE_KEY]);
  const notes = result[STORAGE_KEY] || {};
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

// Atualizar badge ao iniciar
updateBadge();

console.log('[NotasPat] Background Service Worker v1.2.0 carregado');
