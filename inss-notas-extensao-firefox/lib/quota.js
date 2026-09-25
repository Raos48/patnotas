/**
 * Modulo de Quota - NotasPat
 * Limites do chrome.storage.sync e checagem previa de gravacao.
 *
 * O storage.sync tem limites rigidos. Checar ANTES de gravar permite
 * dar mensagem util ao usuario em vez de falhar com erro generico.
 *
 * Carregado antes de lib/storage.js (content script, popup, stdtexts, import)
 * e via importScripts no service worker. Compartilha o escopo global com
 * esses scripts: nao declarar aqui nomes que ja existam neles.
 */

const SYNC_QUOTA_BYTES_TOTAL = 102400;   // 100 KB no total
const SYNC_QUOTA_BYTES_PER_ITEM = 8192;  // 8 KB por chave
const SYNC_MAX_ITEMS = 512;              // 512 chaves

/**
 * Tamanho que o Chrome contabiliza: bytes UTF-8 da chave + do JSON do valor.
 * @param {string} key
 * @param {*} value
 * @returns {number}
 */
function getItemByteSize(key, value) {
  const encoder = new TextEncoder();
  return encoder.encode(key).length + encoder.encode(JSON.stringify(value)).length;
}

/**
 * Cria erro tipado de quota.
 * @param {'PER_ITEM'|'TOTAL'|'MAX_ITEMS'|'RATE'} limitType
 * @param {string} [customMessage] - Sobrescreve a mensagem padrao do limitType
 * @returns {Error} com .code === 'QUOTA_EXCEEDED' e .limitType
 */
function createQuotaError(limitType, customMessage) {
  const mensagens = {
    PER_ITEM: 'Esta nota e muito longa para sincronizar (maximo 8 KB). Ela foi salva apenas neste computador. Reduza o texto para sincronizar.',
    TOTAL: 'Limite de sincronizacao atingido - esta nota foi salva apenas neste computador. Exclua notas de tarefas ja concluidas para voltar a sincronizar.',
    MAX_ITEMS: 'Limite de 512 itens sincronizados atingido - esta nota foi salva apenas neste computador. Exclua notas de tarefas ja concluidas.',
    RATE: 'Muitas gravacoes em sequencia - a nota foi salva neste computador e sera sincronizada automaticamente em instantes.'
  };
  const err = new Error(customMessage || mensagens[limitType] || mensagens.TOTAL);
  err.code = 'QUOTA_EXCEEDED';
  err.limitType = limitType;
  return err;
}

/**
 * @param {*} err
 * @returns {boolean} true se o erro veio de createQuotaError
 */
function isQuotaError(err) {
  return !!err && err.code === 'QUOTA_EXCEEDED';
}

/**
 * Mapeia o erro de uma gravacao no storage.sync para um limitType.
 * Aceita chrome.runtime.lastError, Error ou string. Mensagens do Chrome:
 * "Resource::kQuotaBytesPerItem quota exceeded", "Resource::kQuotaBytes quota exceeded",
 * "Resource::kMaxItems quota exceeded", "Resource::kMaxWriteOperationsPerMinute quota exceeded".
 * @param {{message?: string}|Error|string} err
 * @returns {'PER_ITEM'|'TOTAL'|'MAX_ITEMS'|'RATE'}
 */
function limitTypeFromSyncError(err) {
  const msg = String((err && err.message) || err || '').toLowerCase();
  if (msg.includes('peritem') || msg.includes('per_item')) return 'PER_ITEM';
  if (msg.includes('maxitems') || msg.includes('max_items')) return 'MAX_ITEMS';
  if (msg.includes('writeoperations') || msg.includes('write_operations')) return 'RATE';
  return 'TOTAL';
}

/**
 * Checa se uma gravacao cabe no storage.sync.
 * Nao substitui o tratamento de chrome.runtime.lastError: existe corrida
 * entre checar e gravar (outra aba, ou dado chegando via sync).
 * @param {string} key
 * @param {*} value
 * @returns {Promise<{ok: true} | {ok: false, limitType: 'PER_ITEM'|'TOTAL'|'MAX_ITEMS'}>}
 */
function checkQuotaBeforeWrite(key, value) {
  const itemBytes = getItemByteSize(key, value);

  if (itemBytes > SYNC_QUOTA_BYTES_PER_ITEM) {
    return Promise.resolve({ ok: false, limitType: 'PER_ITEM', itemBytes });
  }

  return Promise.all([
    new Promise(r => chrome.storage.sync.getBytesInUse(null, b => r(b || 0))),
    new Promise(r => chrome.storage.sync.getBytesInUse(key, b => r(b || 0)))
  ]).then(([currentTotal, existingBytes]) => {
    const projectedTotal = currentTotal - existingBytes + itemBytes;
    if (projectedTotal > SYNC_QUOTA_BYTES_TOTAL) {
      return { ok: false, limitType: 'TOTAL', projectedTotal };
    }

    // MAX_ITEMS so importa para chave nova (existingBytes === 0 = nao existe ainda)
    if (existingBytes === 0) {
      return new Promise(r => chrome.storage.sync.get(null, v => r(Object.keys(v || {}).length)))
        .then(itemCount => {
          if (itemCount + 1 > SYNC_MAX_ITEMS) {
            return { ok: false, limitType: 'MAX_ITEMS', itemCount };
          }
          return { ok: true };
        });
    }

    return { ok: true };
  });
}
