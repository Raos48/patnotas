/**
 * Content Script - NotasPat
 * Injeta notas adesivas nas tabelas de tarefas
 * Versão 1.3.3 - Com Dark Mode, Tags, Preview e mais
 */

// ============ CONSTANTES E CONFIGURAÇÃO ============

const TABLE_IDS = [
  'tableminhasTarefas',
  'tablefilaGerencia',
  'tabletodos',
  'tableinteressadoProtocolo'
];

const CORES_NOTAS = [
  { nome: 'Amarelo', hex: '#fff8c6', dobra: '#f3e58d' },
  { nome: 'Verde', hex: '#c6f8cf', dobra: '#8de5a0' },
  { nome: 'Azul', hex: '#c6e5f8', dobra: '#8dc8f3' },
  { nome: 'Rosa', hex: '#f8c6d4', dobra: '#f38da8' },
  { nome: 'Laranja', hex: '#f8e0c6', dobra: '#f3c48d' },
  { nome: 'Roxo', hex: '#e0c6f8', dobra: '#c48df3' }
];

const TAGS_CONFIG = {
  urgente: { label: '🔴 Urgente', class: 'inss-nota-tag-urgente' },
  pendencia: { label: '🟡 Pendência', class: 'inss-nota-tag-pendencia' },
  lembrete: { label: '🔵 Lembrete', class: 'inss-nota-tag-lembrete' },
  concluido: { label: '🟢 Concluído', class: 'inss-nota-tag-concluido' }
};

const DEFAULT_COLOR = CORES_NOTAS[0];
const MAX_CHARS = 500;

// Cache de notas em memória
let notasCache = {};
let isDarkTheme = false;
let isCompactMode = false;

// Debounce timer para MutationObserver
let debounceTimer = null;
let previewTimer = null;

// Mutex para processRow (previne race condition)
const processingRows = new Set();

// Navigation state for page transition handling
let lastUrl = location.href;
let transitionTimer = null;
let isProcessingTransition = false;

// Navigation handler tracking
let navigationHandlersInstalled = false;
let navPollInterval = null;
let titleObserver = null;

/**
 * Executa uma Promise com timeout de segurança
 * @param {Promise} promise - Promise a executar
 * @param {number} ms - Timeout em milissegundos
 * @returns {Promise} Resultado da Promise ou rejeição por timeout
 */
function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('Storage timeout')), ms))
  ]);
}

// ============ FUNÇÕES DE UTILIDADE ============

function getProtocoloFromRow(tr) {
  if (!tr || tr.nodeType !== Node.ELEMENT_NODE) return null;

  const tds = tr.querySelectorAll('td');
  if (tds.length < 3) return null;

  const protocolo = tds[2].textContent.trim();

  if (/^\d{5,11}$/.test(protocolo)) {
    return protocolo;
  }

  return null;
}

function isRowProcessed(tr) {
  const existing = tr.querySelector('.inss-nota-container');
  if (!existing) return false;

  // Validate container matches current row's protocolo
  const protocolo = getProtocoloFromRow(tr);
  const containerProtocolo = existing.dataset.protocolo;

  // Check for stale container: protocolo mismatch OR undefined dataset (migration case)
  if (protocolo && (containerProtocolo === undefined || containerProtocolo !== protocolo)) {
    // Stale container from previous page - remove and reprocess
    try {
      existing.remove();
    } catch (e) {
      // DOM may be in transition state, log and continue
      console.warn('[NotasPat] Failed to remove stale container:', e);
    }
    return false;
  }

  return true;
}

function getInteressadoTD(tr) {
  const tds = tr.querySelectorAll('td');
  if (tds.length >= 5) {
    return tds[4];
  }
  return null;
}

function getDobraColor(color) {
  for (const cor of CORES_NOTAS) {
    if (cor.hex === color) {
      return cor.dobra;
    }
  }
  return '#f3e58d';
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Sanitiza atributos para prevenir XSS
 * @param {string} str - String a ser sanitizada
 * @returns {string} String segura para uso em atributos HTML
 */
function escapeAttr(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ============ TOAST NOTIFICATIONS ============

function createToastContainer() {
  let container = document.querySelector('.inss-toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'inss-toast-container';
    document.body.appendChild(container);
  }
  return container;
}

function showToast(message, type = 'success') {
  const container = createToastContainer();

  const icons = {
    success: '✓',
    error: '✕',
    warning: '⚠'
  };

  const toast = document.createElement('div');
  toast.className = `inss-toast inss-toast-${type}`;
  toast.innerHTML = `
    <span>${icons[type] || icons.success}</span>
    <span>${escapeHtml(message)}</span>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 3000);
}

// ============ CONFIRMATION MODAL ============

function showConfirm(message, subMessage = '', onConfirm, icon = '⚠️') {
  const overlay = document.createElement('div');
  overlay.className = 'inss-confirm-overlay';

  overlay.innerHTML = `
    <div class="inss-confirm-modal">
      <div class="inss-confirm-icon">${icon}</div>
      <div class="inss-confirm-message">${escapeHtml(message)}</div>
      <div class="inss-confirm-sub">${escapeHtml(subMessage)}</div>
      <div class="inss-confirm-buttons">
        <button class="inss-confirm-btn inss-confirm-btn-cancel">Cancelar</button>
        <button class="inss-confirm-btn inss-confirm-btn-ok">Confirmar</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  overlay.querySelector('.inss-confirm-btn-cancel').addEventListener('click', () => {
    overlay.remove();
  });

  overlay.querySelector('.inss-confirm-btn-ok').addEventListener('click', () => {
    onConfirm();
    overlay.remove();
  });

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      overlay.remove();
    }
  });
}

// ============ PREVIEW TOOLTIP ============

function showPreview(element, nota, protocolo) {
  hidePreview();

  // Criar tags de forma segura usando DOM manipulation
  const tagsContainer = document.createElement('div');
  tagsContainer.className = 'inss-nota-tags';
  tagsContainer.style.marginBottom = '8px';
  (nota.tags || []).forEach(tag => {
    const config = TAGS_CONFIG[tag];
    if (config) {
      const tagSpan = document.createElement('span');
      tagSpan.className = `inss-nota-tag ${config.class}`;
      tagSpan.textContent = config.label;
      tagsContainer.appendChild(tagSpan);
    }
  });

  const preview = document.createElement('div');
  preview.className = 'inss-nota-preview';

  const header = document.createElement('div');
  header.className = 'inss-nota-preview-header';
  header.textContent = `📝 Nota: ${protocolo}`;

  const text = document.createElement('div');
  text.className = 'inss-nota-preview-text';
  text.textContent = nota.text;

  const footer = document.createElement('div');
  footer.className = 'inss-nota-preview-footer';
  footer.textContent = `Atualizado: ${new Date(nota.updatedAt).toLocaleDateString('pt-BR')}`;

  preview.appendChild(header);
  if (nota.tags && nota.tags.length > 0) {
    preview.appendChild(tagsContainer);
  }
  preview.appendChild(text);
  preview.appendChild(footer);

  document.body.appendChild(preview);

  // Posicionar preview
  const rect = element.getBoundingClientRect();
  const previewRect = preview.getBoundingClientRect();

  let top = rect.top - previewRect.height - 10;
  let left = rect.left;

  // Ajustar se sair da tela
  if (top < 10) {
    top = rect.bottom + 10;
  }
  if (left + previewRect.width > window.innerWidth - 10) {
    left = window.innerWidth - previewRect.width - 10;
  }

  preview.style.position = 'fixed';
  preview.style.top = `${top}px`;
  preview.style.left = `${left}px`;
}

function hidePreview() {
  const existing = document.querySelector('.inss-nota-preview');
  if (existing) {
    existing.remove();
  }
  if (previewTimer) {
    clearTimeout(previewTimer);
    previewTimer = null;
  }
}

// ============ FUNÇÕES DE INJEÇÃO ============

function createAddButton(protocolo) {
  const container = document.createElement('div');
  container.className = 'inss-nota-container';
  container.dataset.protocolo = protocolo;

  const button = document.createElement('button');
  button.className = 'inss-nota-add-btn';
  button.title = 'Adicionar nota';
  button.innerHTML = '📝 <span>Nota</span>';

  button.addEventListener('click', (e) => {
    console.log('[NotasPat] Botão clicado para protocolo:', protocolo);
    e.preventDefault();
    e.stopPropagation();
    try {
      openEditor(container, protocolo);
    } catch (error) {
      console.error('[NotasPat] Erro ao abrir editor:', error);
    }
  });

  container.appendChild(button);
  console.log('[NotasPat] Botão criar para protocolo:', protocolo);
  return container;
}

function createNoteSticky(protocolo, nota) {
  const container = document.createElement('div');
  container.className = 'inss-nota-container';
  if (isCompactMode) {
    container.classList.add('inss-nota-compact');
  }
  container.dataset.protocolo = protocolo;

  const sticky = document.createElement('div');
  sticky.className = 'inss-nota-sticky';
  sticky.style.setProperty('--nota-bg', nota.color);
  sticky.style.setProperty('--nota-dobra', getDobraColor(nota.color));

  // Tags - criar de forma segura usando DOM
  const tags = nota.tags || [];
  if (tags.length > 0) {
    const tagsContainer = document.createElement('div');
    tagsContainer.className = 'inss-nota-tags';
    tags.forEach(tag => {
      const config = TAGS_CONFIG[tag];
      if (config) {
        const tagSpan = document.createElement('span');
        tagSpan.className = `inss-nota-tag ${config.class}`;
        tagSpan.textContent = config.label.split(' ')[0];
        tagsContainer.appendChild(tagSpan);
      }
    });
    sticky.appendChild(tagsContainer);
  }

  // Header
  const header = document.createElement('div');
  header.className = 'inss-nota-header';

  const titulo = document.createElement('span');
  titulo.className = 'inss-nota-titulo';
  titulo.textContent = '📝';

  const actions = document.createElement('div');
  actions.className = 'inss-nota-actions';

  // Botões
  const btnEdit = createActionButton('✏️', 'Editar nota', () => {
    openEditor(container, protocolo, nota.text, nota.color, nota.tags);
  });
  btnEdit.className = 'inss-nota-btn inss-nota-edit';

  const btnDelete = createActionButton('🗑️', 'Excluir nota', () => {
    showConfirm(
      `Excluir nota do protocolo ${protocolo}?`,
      'Esta ação não pode ser desfeita.',
      () => deleteNoteHandler(container, protocolo),
      '🗑️'
    );
  });
  btnDelete.className = 'inss-nota-btn inss-nota-delete';

  actions.appendChild(btnEdit);
  actions.appendChild(btnDelete);

  header.appendChild(titulo);
  header.appendChild(actions);

  // Texto
  const text = document.createElement('div');
  text.className = 'inss-nota-text';
  text.textContent = nota.text;

  // Dobra
  const dobra = document.createElement('div');
  dobra.className = 'inss-nota-dobra';

  sticky.appendChild(header);
  sticky.appendChild(text);
  sticky.appendChild(dobra);
  container.appendChild(sticky);

  // Preview on hover (para notas longas)
  if (nota.text.length > 50) {
    let hoverTimer;
    sticky.addEventListener('mouseenter', () => {
      hoverTimer = setTimeout(() => {
        showPreview(sticky, nota, protocolo);
      }, 500);
    });
    sticky.addEventListener('mouseleave', () => {
      clearTimeout(hoverTimer);
      hidePreview();
    });
  }

  return container;
}

function createActionButton(emoji, title, onClick) {
  const button = document.createElement('button');
  button.className = 'inss-nota-btn';
  button.title = title;
  button.textContent = emoji;
  button.addEventListener('click', (e) => {
    console.log('[NotasPat] Botão de ação clicado:', title);
    e.preventDefault();
    e.stopPropagation();
    try {
      onClick();
    } catch (error) {
      console.error('[NotasPat] Erro no botão de ação:', error);
    }
  });
  return button;
}

// ============ EDITOR INLINE ============

function openEditor(container, protocolo, existingText = '', existingColor = DEFAULT_COLOR.hex, existingTags = []) {
  // Fechar outros editores
  document.querySelectorAll('.inss-nota-editor').forEach(editor => {
    editor.remove();
  });

  const editor = document.createElement('div');
  editor.className = 'inss-nota-editor';

  // Textarea
  const textarea = document.createElement('textarea');
  textarea.className = 'inss-nota-textarea';
  textarea.placeholder = 'Digite sua nota aqui...';
  textarea.value = existingText;
  textarea.rows = 3;
  textarea.maxLength = MAX_CHARS;

  // Character counter
  const charCounter = document.createElement('div');
  charCounter.className = 'inss-nota-char-counter';
  charCounter.textContent = `${existingText.length}/${MAX_CHARS}`;

  textarea.addEventListener('input', () => {
    const length = textarea.value.length;
    charCounter.textContent = `${length}/${MAX_CHARS}`;
    charCounter.classList.remove('warning', 'error');
    if (length >= MAX_CHARS) {
      charCounter.classList.add('error');
    } else if (length >= MAX_CHARS * 0.8) {
      charCounter.classList.add('warning');
    }
  });

  // Tag picker
  const tagPicker = document.createElement('div');
  tagPicker.className = 'inss-nota-tag-picker';

  let selectedTags = [...existingTags];

  Object.entries(TAGS_CONFIG).forEach(([key, config]) => {
    const tagEl = document.createElement('span');
    tagEl.className = `inss-nota-tag-option ${config.class} ${selectedTags.includes(key) ? 'selected' : ''}`;
    tagEl.dataset.tag = key;
    tagEl.textContent = config.label;

    tagEl.addEventListener('click', () => {
      if (selectedTags.includes(key)) {
        selectedTags = selectedTags.filter(t => t !== key);
        tagEl.classList.remove('selected');
      } else {
        selectedTags.push(key);
        tagEl.classList.add('selected');
      }
    });

    tagPicker.appendChild(tagEl);
  });

  // Color picker
  const colorPicker = document.createElement('div');
  colorPicker.className = 'inss-nota-color-picker';

  let selectedColor = existingColor;

  CORES_NOTAS.forEach(cor => {
    const dot = document.createElement('div');
    dot.className = 'inss-nota-color-dot';
    dot.style.backgroundColor = cor.hex;
    dot.title = cor.nome;
    if (cor.hex === existingColor) {
      dot.classList.add('selected');
    }

    dot.addEventListener('click', () => {
      colorPicker.querySelectorAll('.inss-nota-color-dot').forEach(d => d.classList.remove('selected'));
      dot.classList.add('selected');
      selectedColor = cor.hex;
    });

    colorPicker.appendChild(dot);
  });

  // Buttons
  const buttons = document.createElement('div');
  buttons.className = 'inss-nota-editor-buttons';

  const btnSave = document.createElement('button');
  btnSave.className = 'inss-nota-btn-save';
  btnSave.textContent = 'Salvar';

  const btnCancel = document.createElement('button');
  btnCancel.className = 'inss-nota-btn-cancel';
  btnCancel.textContent = 'Cancelar';

  buttons.appendChild(btnSave);
  buttons.appendChild(btnCancel);

  editor.appendChild(textarea);
  editor.appendChild(charCounter);
  editor.appendChild(tagPicker);
  editor.appendChild(colorPicker);
  editor.appendChild(buttons);

  // Hide existing elements
  const existingSticky = container.querySelector('.inss-nota-sticky');
  const existingAddBtn = container.querySelector('.inss-nota-add-btn');

  if (existingSticky) existingSticky.style.display = 'none';
  if (existingAddBtn) existingAddBtn.style.display = 'none';

  container.appendChild(editor);
  textarea.focus();

  // Events
  btnCancel.addEventListener('click', () => {
    editor.remove();
    if (existingSticky) existingSticky.style.display = '';
    if (existingAddBtn) existingAddBtn.style.display = '';
  });

  btnSave.addEventListener('click', () => {
    const text = textarea.value.trim();

    if (text) {
      saveNoteForProtocolo(container, protocolo, text, selectedColor, selectedTags);
    } else {
      editor.remove();
      if (existingSticky) existingSticky.style.display = '';
      if (existingAddBtn) existingAddBtn.style.display = '';
    }
  });

  // Impedir que eventos de teclado no textarea propaguem para a página
  // (evita conflito com atalhos do portal INSS, ex: espaço seleciona tarefa)
  textarea.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.ctrlKey && e.key === 'Enter') {
      btnSave.click();
    } else if (e.key === 'Escape') {
      btnCancel.click();
    }
  });
  textarea.addEventListener('keyup', (e) => e.stopPropagation());
  textarea.addEventListener('keypress', (e) => e.stopPropagation());
}

function saveNoteForProtocolo(container, protocolo, text, color, tags = []) {
  console.log('[NotasPat] Salvando nota para protocolo:', protocolo);
  saveNote(protocolo, text, color, tags).then(nota => {
    notasCache[protocolo] = nota;
    console.log('[NotasPat] Nota salva:', nota);

    // Limpar container
    container.innerHTML = '';

    // Criar e adicionar novo sticky
    const newContainer = createNoteSticky(protocolo, nota);
    const sticky = newContainer.querySelector('.inss-nota-sticky');
    if (sticky) {
      container.appendChild(sticky);
    }

    showToast('Nota salva com sucesso!', 'success');

    // Verificar saude do storage
    checkStorageHealth().then(health => {
      if (!health.ok && health.warning) {
        showToast(health.warning, 'warning');
      }
    });
  }).catch(err => {
    console.error('Erro ao salvar nota:', err);
    showToast('Erro ao salvar nota', 'error');
  });
}

// ============ COLOR PICKER POPUP ============

function openColorPicker(container, protocolo) {
  document.querySelectorAll('.inss-nota-color-popup').forEach(popup => popup.remove());

  const popup = document.createElement('div');
  popup.className = 'inss-nota-color-popup';

  CORES_NOTAS.forEach(cor => {
    const dot = document.createElement('div');
    dot.className = 'inss-nota-color-dot';
    dot.style.backgroundColor = cor.hex;
    dot.title = cor.nome;

    dot.addEventListener('click', () => {
      updateNoteColor(protocolo, cor.hex).then(nota => {
        if (nota) {
          notasCache[protocolo] = nota;
          const sticky = container.querySelector('.inss-nota-sticky');
          if (sticky) {
            sticky.style.setProperty('--nota-bg', cor.hex);
            sticky.style.setProperty('--nota-dobra', cor.dobra);
          }
          popup.remove();
          showToast('Cor alterada!', 'success');
        }
      });
    });

    popup.appendChild(dot);
  });

  const sticky = container.querySelector('.inss-nota-sticky');
  if (sticky) {
    sticky.appendChild(popup);
  }

  setTimeout(() => {
    document.addEventListener('click', function closePopup(e) {
      if (!popup.contains(e.target)) {
        popup.remove();
        document.removeEventListener('click', closePopup);
      }
    });
  }, 10);
}

// ============ DELETE ============

function deleteNoteHandler(container, protocolo) {
  console.log('[NotasPat] Excluindo nota para protocolo:', protocolo);
  deleteNote(protocolo).then(deleted => {
    console.log('[NotasPat] Nota excluída:', deleted);
    if (deleted) {
      delete notasCache[protocolo];

      // Encontrar o TD para recriar o botão
      const tdInteressado = container.closest('td');
      if (tdInteressado) {
        // Remover o container antigo
        container.remove();

        // Criar novo botão de adicionar diretamente no TD
        const addButton = createAddButton(protocolo);
        tdInteressado.appendChild(addButton);

        console.log('[NotasPat] Botão de adicionar recriado');
      }

      showToast('Nota excluída!', 'success');
    } else {
      console.log('[NotasPat] Nota não encontrada para excluir');
    }
  }).catch(err => {
    console.error('Erro ao excluir nota:', err);
    showToast('Erro ao excluir nota', 'error');
  });
}

// ============ PROCESSAMENTO DE TABELAS ============

/**
 * Coleta todos os protocolos visíveis nas tabelas da página
 * @returns {string[]} Array de protocolos únicos
 */
function collectVisibleProtocolos() {
  const protocolos = new Set();
  TABLE_IDS.forEach(tableId => {
    const table = document.getElementById(tableId);
    if (!table) return;
    const tbody = table.querySelector('tbody');
    if (!tbody) return;
    tbody.querySelectorAll('tr').forEach(tr => {
      const protocolo = getProtocoloFromRow(tr);
      if (protocolo) protocolos.add(protocolo);
    });
  });
  return Array.from(protocolos);
}

async function processRow(tr) {
  if (isRowProcessed(tr)) return;
  if (processingRows.has(tr)) return; // Já está sendo processada (mutex)
  processingRows.add(tr);

  try {
    const tds = tr.querySelectorAll('td');
    if (tds.length < 3) return;

    if (tr.textContent.includes('Nenhum registro encontrado')) return;

    const protocolo = getProtocoloFromRow(tr);
    if (!protocolo) return;

    const tdInteressado = getInteressadoTD(tr);
    if (!tdInteressado) return;

    // Lazy load: se não está no cache, buscar individualmente do storage
    if (!(protocolo in notasCache)) {
      try {
        const nota = await getNote(protocolo);
        notasCache[protocolo] = nota; // null se não existir
      } catch (err) {
        console.error(`[NotasPat] Erro ao carregar nota ${protocolo}:`, err);
      }
    }

    // Verificar novamente se a row já foi processada (pode ter sido processada durante o await)
    if (isRowProcessed(tr)) return;

    // Criar container da nota e anexar diretamente ao TD (sem mover filhos existentes)
    let noteContainer;
    if (notasCache[protocolo]) {
      noteContainer = createNoteSticky(protocolo, notasCache[protocolo]);
    } else {
      noteContainer = createAddButton(protocolo);
    }

    tdInteressado.appendChild(noteContainer);
  } finally {
    processingRows.delete(tr);
  }
}

function processTable(table) {
  if (!table) return;

  const tbody = table.querySelector('tbody');
  if (!tbody) return;

  const rows = tbody.querySelectorAll('tr');
  rows.forEach(row => processRow(row));
}

function scanAllTables() {
  TABLE_IDS.forEach(tableId => {
    const table = document.getElementById(tableId);
    if (table) {
      processTable(table);
    }
  });
}

// ============ MUTATION OBSERVER ============

function startMutationObserver() {
  let isScanning = false;

  const debouncedScan = () => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
    debounceTimer = setTimeout(() => {
      if (isScanning) return; // Evitar re-entrada
      isScanning = true;
      try {
        scanAllTables();
        scanForDraftEditors();
      } finally {
        isScanning = false;
      }
    }, 300);
  };

  const mainObserver = new MutationObserver((mutations) => {
    let hasRelevantMutations = false;

    for (const mutation of mutations) {
      if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
        // Ignorar mutações causadas pela própria extensão
        if (mutation.target.closest && mutation.target.closest('.inss-nota-container, .inss-nota-sticky, .inss-nota-editor, .inss-nota-preview, .inss-nota-toast-container, .inss-stdtext-btn, .inss-stdtext-dropdown, .inss-stdtext-confirm-overlay')) {
          continue;
        }

        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            // Ignorar elementos da extensão
            if (node.classList && (
              node.classList.contains('inss-nota-container') ||
              node.classList.contains('inss-nota-sticky') ||
              node.classList.contains('inss-nota-editor') ||
              node.classList.contains('inss-nota-preview') ||
              node.classList.contains('inss-nota-toast-container') ||
              node.classList.contains('inss-stdtext-btn') ||
              node.classList.contains('inss-stdtext-dropdown') ||
              node.classList.contains('inss-stdtext-confirm-overlay')
            )) {
              continue;
            }

            if (node.tagName === 'TR' || node.tagName === 'TBODY' ||
              node.tagName === 'TABLE' || node.classList?.contains('tab-pane')) {
              hasRelevantMutations = true;
              break;
            }
          }
        }
      }
      if (hasRelevantMutations) break;
    }

    if (hasRelevantMutations) {
      debouncedScan();
    }
  });

  // Observar #tarefas-container se existir (escopo mais restrito)
  const container = document.getElementById('tarefas-container');
  if (container) {
    mainObserver.observe(container, {
      childList: true,
      subtree: true
    });
    return mainObserver;
  }

  // Fallback: observar os pais diretos das tabelas-alvo
  const observedParents = new Set();
  TABLE_IDS.forEach(tableId => {
    const table = document.getElementById(tableId);
    if (table && table.parentElement && !observedParents.has(table.parentElement)) {
      observedParents.add(table.parentElement);
      mainObserver.observe(table.parentElement, {
        childList: true,
        subtree: true
      });
    }
  });

  // Se nenhuma tabela existe ainda, observar body mas apenas childList direto
  if (observedParents.size === 0) {
    mainObserver.observe(document.body, {
      childList: true,
      subtree: false
    });
  }

  return mainObserver;
}

// ============ PAGE TRANSITION HANDLERS ============

function handlePageTransitionDebounced() {
  if (transitionTimer) {
    clearTimeout(transitionTimer);
  }
  transitionTimer = setTimeout(handlePageTransition, 300);
}

function handlePageTransition() {
  if (isProcessingTransition) {
    console.log('[NotasPat] Transition already in progress, skipping');
    return;
  }

  isProcessingTransition = true;
  console.log('[NotasPat] Page transition detected, re-processing tables');

  try {
    // Re-scan tables - isRowProcessed() will handle stale container removal inline
    scanAllTables();
  } finally {
    isProcessingTransition = false;
  }
}

function setupNavigationHandlers() {
  // Prevent duplicate installation
  if (navigationHandlersInstalled) {
    console.log('[NotasPat] Navigation handlers already installed, skipping');
    return;
  }

  // Browser back/forward buttons
  window.addEventListener('popstate', handlePageTransitionDebounced);

  // bfcache restoration (pageshow event)
  window.addEventListener('pageshow', (e) => {
    if (e.persisted) {
      console.log('[NotasPat] Page restored from bfcache');
      handlePageTransitionDebounced();
    }
  });

  // SPA navigation - detect URL changes efficiently
  // Use title element as canary (cheaper than observing entire document)
  const titleEl = document.querySelector('title');
  if (titleEl) {
    titleObserver = new MutationObserver(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        handlePageTransitionDebounced();
      }
    });
    titleObserver.observe(titleEl, { subtree: true, characterData: true });
  }

  // Poll as fallback for SPA frameworks
  navPollInterval = setInterval(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      handlePageTransitionDebounced();
    }
  }, 2000);

  navigationHandlersInstalled = true;
  console.log('[NotasPat] Navigation handlers installed');
}

// ============ KEYBOARD SHORTCUTS ============

function setupKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    // Escape - close editor, preview
    if (e.key === 'Escape') {
      hidePreview();
      document.querySelectorAll('.inss-nota-editor').forEach(ed => {
        ed.remove();
        // Show hidden elements
        const container = ed.closest('.inss-nota-container');
        if (container) {
          const sticky = container.querySelector('.inss-nota-sticky');
          const addBtn = container.querySelector('.inss-nota-add-btn');
          if (sticky) sticky.style.display = '';
          if (addBtn) addBtn.style.display = '';
        }
      });
    }
  });
}

// ============ THEME SYNC ============

async function syncTheme() {
  try {
    const result = await chrome.storage.local.get(['theme']);
    isDarkTheme = result.theme === 'dark';
    document.body.classList.toggle('inss-dark-theme', isDarkTheme);
  } catch (error) {
    console.error('Erro ao sincronizar tema:', error);
  }
}

// Listen for storage changes (theme + standard texts cache)
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local') {
    if (changes.theme) {
      isDarkTheme = changes.theme.newValue === 'dark';
      document.body.classList.toggle('inss-dark-theme', isDarkTheme);
    }
    if (changes.standard_texts) {
      stdTextsCache = null; // Invalidate cache
    }
  }
});

// ============ TEXTOS PADRAO ============

let stdTextsCache = null;

async function loadStdTextsCache() {
  // Sempre recarregar do storage para evitar cache preso em []
  try {
    stdTextsCache = await withTimeout(getStandardTexts(), 5000);
  } catch (err) {
    console.warn('[NotasPat] Erro ao carregar textos padrao:', err.message);
    if (stdTextsCache === null) stdTextsCache = [];
  }
  return stdTextsCache;
}

const processedEditors = new WeakSet();

function scanForDraftEditors() {
  const editors = document.querySelectorAll('.public-DraftEditor-content[contenteditable="true"]');
  console.log('[NotasPat] scanForDraftEditors: encontrados', editors.length, 'editores');
  editors.forEach(editor => {
    if (processedEditors.has(editor)) return;
    processedEditors.add(editor);
    console.log('[NotasPat] Novo editor Draft.js detectado, injetando botao...');
    injectStdTextButton(editor);
  });
}

/**
 * Observer dedicado para detectar editores Draft.js em modais
 * que aparecem fora do escopo do observer de tabelas.
 */
function startDraftEditorObserver() {
  let scanTimer = null;

  const draftObserver = new MutationObserver((mutations) => {
    let shouldScan = false;

    for (const mutation of mutations) {
      if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== Node.ELEMENT_NODE) continue;
          // Ignorar elementos da extensao
          if (node.classList && (
            node.classList.contains('inss-stdtext-btn') ||
            node.classList.contains('inss-stdtext-dropdown') ||
            node.classList.contains('inss-stdtext-confirm-overlay')
          )) continue;

          // Verificar se o nodo adicionado contem um editor Draft.js
          if (node.classList?.contains('public-DraftEditor-content') ||
              node.querySelector?.('.public-DraftEditor-content[contenteditable="true"]')) {
            shouldScan = true;
            break;
          }
          // Verificar containers de modais de despacho
          if (node.classList?.contains('add-despacho-container') ||
              node.classList?.contains('DraftEditor-root') ||
              node.id?.startsWith('modal-despacho')) {
            shouldScan = true;
            break;
          }
        }
      }
      if (shouldScan) break;
    }

    if (shouldScan) {
      clearTimeout(scanTimer);
      scanTimer = setTimeout(() => {
        console.log('[NotasPat] Modal/editor detectado pelo DraftEditorObserver');
        scanForDraftEditors();
      }, 200);
    }
  });

  draftObserver.observe(document.body, {
    childList: true,
    subtree: true
  });

  console.log('[NotasPat] DraftEditorObserver iniciado (observando body)');
  return draftObserver;
}

function injectStdTextButton(editorElement) {
  // Preferir ancorar o botao na barra de ferramentas (.draft-controls)
  // para nao sobrepor o texto digitado. Fallback para .DraftEditor-root
  // caso a toolbar nao exista em alguma variacao do DOM.
  const textEditor = editorElement.closest('.text-editor');
  const toolbar = textEditor?.querySelector(':scope > .draft-controls');
  const root = toolbar
    || editorElement.closest('.DraftEditor-root')
    || editorElement.parentElement;
  if (!root) {
    console.warn('[NotasPat] injectStdTextButton: nao encontrou container root para o editor');
    return;
  }

  // Evitar injetar duas vezes no mesmo container (ex.: re-scan)
  if (root.querySelector(':scope > .inss-stdtext-btn')) {
    console.log('[NotasPat] injectStdTextButton: botao ja existe no container, pulando');
    return;
  }

  console.log('[NotasPat] injectStdTextButton: root encontrado:', root.className);

  const rootStyle = window.getComputedStyle(root);
  if (rootStyle.position === 'static') {
    root.style.position = 'relative';
  }

  const btn = document.createElement('button');
  btn.className = 'inss-stdtext-btn';
  btn.title = 'Inserir texto padrao';
  btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>Texto Padr\u00e3o';
  // Salvar selecao no mousedown (antes de perder foco do editor)
  btn.addEventListener('mousedown', (e) => {
    e.preventDefault(); // Impede que o botao roube foco do editor
    saveEditorSelection(editorElement);
  });
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleStdTextDropdown(btn, editorElement);
  });

  root.appendChild(btn);
  console.log('[NotasPat] Botao de texto padrao injetado com sucesso');
}

let activeDropdown = null;
let savedEditorSelection = null;

function saveEditorSelection(editorElement) {
  const sel = window.getSelection();
  if (sel.rangeCount > 0 && editorElement.contains(sel.anchorNode)) {
    savedEditorSelection = sel.getRangeAt(0).cloneRange();
  } else {
    savedEditorSelection = null;
  }
}

function restoreEditorSelection(editorElement) {
  if (savedEditorSelection) {
    editorElement.focus();
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(savedEditorSelection);
    savedEditorSelection = null;
    return true;
  }
  return false;
}

function toggleStdTextDropdown(btn, editorElement) {
  if (activeDropdown) {
    activeDropdown.remove();
    activeDropdown = null;
    btn.parentElement.style.overflow = '';
    return;
  }
  showStdTextDropdown(btn, editorElement);
}

async function showStdTextDropdown(btn, editorElement) {
  const texts = await loadStdTextsCache();

  const dropdown = document.createElement('div');
  dropdown.className = 'inss-stdtext-dropdown';

  const search = document.createElement('input');
  search.type = 'text';
  search.className = 'inss-stdtext-search';
  search.placeholder = 'Buscar texto padrao...';
  dropdown.appendChild(search);

  const list = document.createElement('div');
  list.className = 'inss-stdtext-list';
  dropdown.appendChild(list);

  // Footer com botao de gerenciamento
  const footer = document.createElement('div');
  footer.className = 'inss-stdtext-footer';
  const manageBtn = document.createElement('button');
  manageBtn.className = 'inss-stdtext-manage-btn';
  manageBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg> Gerenciar Textos Padrão';
  manageBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'openStdTextsPage' });
    dropdown.remove();
    activeDropdown = null;
  });
  footer.appendChild(manageBtn);
  dropdown.appendChild(footer);

  function renderList(filter) {
    list.innerHTML = '';
    const query = (filter || '').toLowerCase();
    const filtered = texts.filter(t =>
      t.title.toLowerCase().includes(query) || t.text.toLowerCase().includes(query)
    );

    if (filtered.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'inss-stdtext-empty';
      empty.textContent = texts.length === 0
        ? 'Nenhum texto padrao cadastrado.'
        : 'Nenhum resultado encontrado.';
      list.appendChild(empty);

      if (texts.length === 0) {
        const openLink = document.createElement('button');
        openLink.className = 'inss-stdtext-open-manager';
        openLink.textContent = 'Gerenciar textos padrao';
        openLink.addEventListener('click', () => {
          chrome.runtime.sendMessage({ action: 'openStdTextsPage' });
          dropdown.remove();
          activeDropdown = null;
        });
        list.appendChild(openLink);
      }
      return;
    }

    filtered.forEach(t => {
      const item = document.createElement('div');
      item.className = 'inss-stdtext-item';

      const title = document.createElement('div');
      title.className = 'inss-stdtext-item-title';
      title.textContent = t.title;
      item.appendChild(title);

      const preview = document.createElement('div');
      preview.className = 'inss-stdtext-item-preview';
      preview.textContent = t.text.length > 60 ? t.text.substring(0, 60) + '...' : t.text;
      item.appendChild(preview);

      item.addEventListener('click', () => {
        insertTextIntoDraftEditor(editorElement, t.text);
        dropdown.remove();
        activeDropdown = null;
        btn.parentElement.style.overflow = '';
      });
      list.appendChild(item);
    });
  }

  let searchTimer = null;
  search.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => renderList(search.value), 150);
  });

  renderList('');

  // Manter dentro do parent do botao (respeita focus trap de modais)
  // position:fixed no CSS garante que escapa do overflow visualmente
  // Dropdown dentro do parent (position:absolute no CSS o posiciona abaixo do botao)
  btn.parentElement.appendChild(dropdown);
  activeDropdown = dropdown;
  btn.parentElement.style.overflow = 'visible';

  setTimeout(() => search.focus(), 50);

  function onOutsideClick(e) {
    if (!dropdown.contains(e.target) && e.target !== btn) {
      dropdown.remove();
      activeDropdown = null;
      btn.parentElement.style.overflow = '';
      document.removeEventListener('click', onOutsideClick, true);
    }
  }
  setTimeout(() => document.addEventListener('click', onOutsideClick, true), 10);

  function onEscape(e) {
    if (e.key === 'Escape') {
      dropdown.remove();
      activeDropdown = null;
      btn.parentElement.style.overflow = '';
      document.removeEventListener('keydown', onEscape, true);
    }
  }
  document.addEventListener('keydown', onEscape, true);
}

function insertTextIntoDraftEditor(editorElement, text) {
  // Restaurar a posicao do cursor salva antes do dropdown abrir
  if (!restoreEditorSelection(editorElement)) {
    editorElement.focus();
  }

  // Usar paste event para injetar texto - Draft.js trata paste events
  // internamente sem conflitar com o React DOM reconciler
  try {
    const dataTransfer = new DataTransfer();
    dataTransfer.setData('text/plain', text);

    const pasteEvent = new ClipboardEvent('paste', {
      bubbles: true,
      cancelable: true,
      clipboardData: dataTransfer
    });

    editorElement.dispatchEvent(pasteEvent);
    console.log('[NotasPat] Texto padrao inserido via paste event');
  } catch (e) {
    console.error('[NotasPat] Erro ao inserir texto via paste:', e);
    try {
      navigator.clipboard.writeText(text).then(() => {
        document.execCommand('paste');
        console.log('[NotasPat] Texto padrao inserido via clipboard fallback');
      });
    } catch (e2) {
      console.error('[NotasPat] Todos os metodos de insercao falharam:', e2);
    }
  }
}


// ============ INICIALIZAÇÃO ============

function tryProcessTables(maxAttempts = 20, delay = 500) {
  let attempts = 0;

  function attempt() {
    attempts++;
    console.log(`[NotasPat] Tentativa ${attempts}/${maxAttempts}...`);

    let foundTables = 0;
    TABLE_IDS.forEach(tableId => {
      const table = document.getElementById(tableId);
      if (table) {
        foundTables++;
      }
    });

    if (foundTables > 0) {
      console.log(`[NotasPat] ${foundTables} tabela(s) encontrada(s)`);
      scanAllTables();
      startMutationObserver();
      setupKeyboardShortcuts();
      setupNavigationHandlers();
      return true;
    }

    if (attempts < maxAttempts) {
      setTimeout(attempt, delay);
    } else {
      console.log('[NotasPat] Tabelas não encontradas, iniciando observer anyway');
      startMutationObserver();
      setupKeyboardShortcuts();
      setupNavigationHandlers();
    }
    return false;
  }

  attempt();
}

async function init() {
  console.log('[NotasPat] Inicializando v1.3.3...');

  try {
    // Sync theme
    await syncTheme();

    // Carregar apenas notas dos protocolos visíveis na página (com timeout de segurança)
    const visibleProtocolos = collectVisibleProtocolos();
    try {
      notasCache = await withTimeout(getNotesForProtocolos(visibleProtocolos), 5000);
    } catch (err) {
      console.warn('[NotasPat] Storage timeout ou erro, iniciando com cache vazio:', err.message);
      notasCache = {};
    }
    console.log(`[NotasPat] Notas carregadas: ${Object.keys(notasCache).length} de ${visibleProtocolos.length} protocolos visíveis`);

    // Check domain
    if (!window.location.href.includes('atendimento.inss.gov.br')) {
      console.log('[NotasPat] Domínio incorreto');
      return;
    }

    // Wait for DOM
    if (document.readyState === 'loading') {
      await new Promise(resolve => {
        document.addEventListener('DOMContentLoaded', resolve, { once: true });
      });
    }

    // Process tables
    tryProcessTables(20, 500);

    // Observar modais de despacho para injetar botao de textos padrao
    startDraftEditorObserver();

    // Scan inicial para editores que ja existam no DOM
    setTimeout(() => scanForDraftEditors(), 2000);

  } catch (error) {
    console.error('[NotasPat] Erro ao inicializar:', error);
  }
}

// Start (isolado para nunca interferir no site)
try {
  console.log('[NotasPat] Script carregado');
  init().catch(err => {
    console.error('[NotasPat] Erro fatal na inicialização:', err);
  });
} catch (err) {
  console.error('[NotasPat] Erro ao carregar script:', err);
}
