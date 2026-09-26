/**
 * Popup Script - NotasPat
 * Versão 1.2.0 - Com Dark Mode, Tags, Templates, Filtros e mais
 */

// ============ CONSTANTES ============

const CORES_NOTAS = [
  { nome: 'Amarelo',  hex: '#fff8c6', dobra: '#f3e58d' },
  { nome: 'Verde',    hex: '#c6f8cf', dobra: '#8de5a0' },
  { nome: 'Azul',     hex: '#c6e5f8', dobra: '#8dc8f3' },
  { nome: 'Rosa',     hex: '#f8c6d4', dobra: '#f38da8' },
  { nome: 'Laranja',  hex: '#f8e0c6', dobra: '#f3c48d' },
  { nome: 'Roxo',     hex: '#e0c6f8', dobra: '#c48df3' }
];

// Ícones de interface: SVG inline (stroke: currentColor). Emoji são
// proibidos como interface pelo DESIGN.md — leitores de tela anunciam
// "clipboard emoji" em vez de "copiar".
const UI_ICONS = {
  copy: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
  edit: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z"/></svg>',
  trash: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>',
  note: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>',
  warn: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>'
};

const TAGS_DISPONIVEIS = ['urgente', 'pendencia', 'lembrete', 'concluido'];

const TEMPLATES_PADRAO = [
  { id: 'aguardando-doc', nome: 'Aguardando documentação', texto: 'Aguardando envio de documentação complementar pelo interessado.' },
  { id: 'ligar', nome: 'Ligar para interessado', texto: 'Ligar para o interessado para esclarecer pendências.' },
  { id: 'analise', nome: 'Em análise', texto: 'Processo em análise técnica.' },
  { id: 'retorno', nome: 'Aguardando retorno', texto: 'Aguardando retorno do interessado.' }
];

const MAX_CHARS = 500;
const PAGE_SIZE = 50;

// ============ ELEMENTOS DOM ============

const searchInput = document.getElementById('searchInput');
const notesList = document.getElementById('notesList');
const counterText = document.getElementById('counterText');
const btnExport = document.getElementById('btnExport');
const btnImport = document.getElementById('btnImport');
const fileInput = document.getElementById('fileInput');
const themeToggle = document.getElementById('themeToggle');
const toastContainer = document.getElementById('toastContainer');

// Standard Texts elements
const btnStdTexts = document.getElementById('btnStdTexts');
const stdTextsPanel = document.getElementById('stdTextsPanel');
const stdTextsSearch = document.getElementById('stdTextsSearch');
const stdTextsList = document.getElementById('stdTextsList');
const stdTextsForm = document.getElementById('stdTextsForm');
const stdTextTitle = document.getElementById('stdTextTitle');
const stdTextContent = document.getElementById('stdTextContent');
const stdTextCharCount = document.getElementById('stdTextCharCount');
const btnAddStdText = document.getElementById('btnAddStdText');
const btnSaveStdText = document.getElementById('btnSaveStdText');
const btnCancelStdText = document.getElementById('btnCancelStdText');
const btnOpenStdTextsPage = document.getElementById('btnOpenStdTextsPage');

let stdTextsData = [];
let editingStdTextId = null;

// Filtros
const filterOrder = document.getElementById('filterOrder');
const filterColor = document.getElementById('filterColor');
const filterTag = document.getElementById('filterTag');

// Estatísticas
const statsSection = document.getElementById('statsSection');
const statsToggle = document.getElementById('statsToggle');
const statTotal = document.getElementById('statTotal');
const statWeek = document.getElementById('statWeek');
const colorStats = document.getElementById('colorStats');

// Modal de Edição
const editModal = document.getElementById('editModal');
const modalClose = document.getElementById('modalClose');
const modalCancel = document.getElementById('modalCancel');
const modalSave = document.getElementById('modalSave');
const editProtocolo = document.getElementById('editProtocolo');
const editText = document.getElementById('editText');
const editColorPicker = document.getElementById('editColorPicker');
const charCounter = document.getElementById('charCounter');
const editTags = document.getElementById('editTags');
const availableTags = document.getElementById('availableTags');

// Templates
const templatesDropdown = document.getElementById('templatesDropdown');
const btnTemplates = document.getElementById('btnTemplates');
const templatesList = document.getElementById('templatesList');
const templatesModal = document.getElementById('templatesModal');
const templatesModalClose = document.getElementById('templatesModalClose');
const newTemplateName = document.getElementById('newTemplateName');
const newTemplateText = document.getElementById('newTemplateText');
const btnAddTemplate = document.getElementById('btnAddTemplate');
const savedTemplates = document.getElementById('savedTemplates');

// Alerta de Storage
const storageWarning = document.getElementById('storageWarning');
const storageWarningMessage = document.getElementById('storageWarningMessage');
const storageWarningDismiss = document.getElementById('storageWarningDismiss');

// Modal de Confirmação
const confirmModal = document.getElementById('confirmModal');
const confirmIcon = document.getElementById('confirmIcon');
const confirmMessage = document.getElementById('confirmMessage');
const confirmSub = document.getElementById('confirmSub');
const confirmCancel = document.getElementById('confirmCancel');
const confirmOk = document.getElementById('confirmOk');

// Modal de Importação
const importModal = document.getElementById('importModal');
const importModalMessage = document.getElementById('importModalMessage');
const importModalSub = document.getElementById('importModalSub');
const importCancel = document.getElementById('importCancel');
const importMerge = document.getElementById('importMerge');
const importReplace = document.getElementById('importReplace');
const importReplaceConfirmInput = document.getElementById('importReplaceConfirmInput');

// Frase que a usuária digita para liberar a via destrutiva da importação.
const REPLACE_CONFIRM_PHRASE = 'SUBSTITUIR';

let pendingImportText = null;

// ============ UTILIDADES - DEBOUNCE ============

function debounce(fn, delay) {
  let timer = null;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

// ============ ESTADO ============

let notasData = {};
let templatesData = [];
let selectedColor = CORES_NOTAS[0].hex;
let selectedTags = [];
let currentEditProtocolo = null;
let currentConfirmCallback = null;
let isDarkTheme = false;
// Estado de carga: erro ≠ vazio ≠ filtrado vazio. Ver renderNotes().
let loadError = false;
let displayedCount = PAGE_SIZE;

// Reset paginação e renderizar (usado por busca/filtros)
function resetAndRender() {
  displayedCount = PAGE_SIZE;
  renderNotes();
}

// Funções com debounce para busca e filtros
const debouncedRenderFromSearch = debounce(resetAndRender, 300);
const debouncedRenderFromFilter = debounce(resetAndRender, 150);

// ============ INICIALIZAÇÃO ============

document.addEventListener('DOMContentLoaded', async () => {
  await loadTheme();
  await loadNotes();
  await loadTemplates();
  setupEventListeners();
  createColorPicker();
  updateStatistics();
});

async function loadTheme() {
  try {
    const result = await chrome.storage.local.get(['theme']);
    isDarkTheme = result.theme === 'dark';
    
    // Detectar preferência do sistema se não houver preferência salva
    if (!result.theme) {
      isDarkTheme = window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    
    applyTheme();
  } catch (error) {
    console.error('[NotasPat] Erro ao carregar tema:', error);
  }
}

function applyTheme() {
  document.body.classList.toggle('dark-theme', isDarkTheme);
  // Toggle SVG icons for theme button
  const moonIcon = themeToggle.querySelector('.theme-icon-moon');
  const sunIcon = themeToggle.querySelector('.theme-icon-sun');
  if (moonIcon && sunIcon) {
    moonIcon.style.display = isDarkTheme ? 'none' : 'block';
    sunIcon.style.display = isDarkTheme ? 'block' : 'none';
  } else {
    // Fallback for emoji-based toggle
    // Os SVGs de sol/lua já vêm no HTML — alternar a visibilidade deles,
  // nunca substituir o conteúdo por um emoji.
  const moon = themeToggle.querySelector('.theme-icon-moon');
  const sun = themeToggle.querySelector('.theme-icon-sun');
  if (moon) moon.style.display = isDarkTheme ? 'none' : '';
  if (sun) sun.style.display = isDarkTheme ? '' : 'none';
  }
  themeToggle.title = isDarkTheme ? 'Tema claro' : 'Tema escuro';
}

async function toggleTheme() {
  isDarkTheme = !isDarkTheme;
  applyTheme();
  try {
    await chrome.storage.local.set({ theme: isDarkTheme ? 'dark' : 'light' });
    showToast(`Tema ${isDarkTheme ? 'escuro' : 'claro'} ativado`, 'success');
  } catch (error) {
    console.error('[NotasPat] Erro ao salvar tema:', error);
  }
}

/**
 * Preenche campos ausentes/invalidos de uma nota SOMENTE para exibicao -
 * nunca grava o resultado de volta no storage. Uma nota com color/tags
 * ausentes (dado incompleto ou corrompido) nao pode quebrar a
 * renderizacao da lista INTEIRA - antes desta funcao, isso e exatamente o
 * que acontecia (renderNotes mapeia todas de uma vez; um erro em qualquer
 * uma interrompia o map antes de desenhar qualquer nota).
 * @param {Object} nota
 * @returns {Object} copia da nota com campos seguros para exibir
 */
function normalizarNotaParaExibicao(nota) {
  return Object.assign({}, nota, {
    color: (typeof nota.color === 'string' && nota.color) ? nota.color : '#fff8c6',
    tags: Array.isArray(nota.tags) ? nota.tags : [],
    text: typeof nota.text === 'string' ? nota.text : '',
    reminder: nota.reminder || null
  });
}

async function loadNotes() {
  try {
    const brutas = await getAllNotes();
    notasData = {};
    Object.keys(brutas).forEach(protocolo => {
      notasData[protocolo] = normalizarNotaParaExibicao(brutas[protocolo]);
    });
    updateCounter();
    renderNotes();
    updateStatistics();
    await verifyStorageHealth();
  } catch (error) {
    console.error('[NotasPat] Erro ao carregar notas:', error);
    loadError = true;
    counterText.textContent = 'Erro ao carregar';
    counterText.closest('.counter-section')?.classList.add('is-error');
    showToast('Erro ao carregar notas. Elas continuam salvas.', 'error');
    renderNotes();
    return;
  }

  loadError = false;
  counterText.closest('.counter-section')?.classList.remove('is-error');
}

async function verifyStorageHealth() {
  try {
    const health = await checkStorageHealth();
    if (!health.ok && health.warning) {
      storageWarningMessage.textContent = health.warning;
      storageWarning.style.display = 'block';
    } else {
      storageWarning.style.display = 'none';
    }
  } catch (error) {
    console.error('[NotasPat] Erro ao verificar storage:', error);
  }
}

async function loadTemplates() {
  try {
    const result = await chrome.storage.local.get(['templates']);
    templatesData = result.templates || [...TEMPLATES_PADRAO];
    renderTemplatesList();
    renderSavedTemplates();
  } catch (error) {
    console.error('[NotasPat] Erro ao carregar templates:', error);
    templatesData = [...TEMPLATES_PADRAO];
  }
}

function setupEventListeners() {
  // Tema
  themeToggle.addEventListener('click', toggleTheme);

  // Busca (com debounce de 300ms para evitar re-renders a cada tecla)
  searchInput.addEventListener('input', debouncedRenderFromSearch);

  // Filtros (com debounce de 150ms)
  filterOrder.addEventListener('change', debouncedRenderFromFilter);
  filterColor.addEventListener('change', debouncedRenderFromFilter);
  filterTag.addEventListener('change', debouncedRenderFromFilter);

  // Estatísticas
  statsToggle.addEventListener('click', () => {
    statsSection.classList.toggle('expanded');
  });

  // Exportar/Importar
  btnExport.addEventListener('click', exportNotesToFile);
  // Importação acontece no próprio popup: abrir o seletor de arquivo aqui
  // em vez de empurrar a servidora para outra aba. (Nunca mais window.close()
  // — ela perde a lista de onde estava no meio da fila.)
  btnImport.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', importNotesFromFile);

  // Standard Texts events
  btnStdTexts.addEventListener('click', toggleStdTextsPanel);
  btnAddStdText.addEventListener('click', () => showStdTextForm());
  btnSaveStdText.addEventListener('click', handleSaveStdText);
  btnCancelStdText.addEventListener('click', hideStdTextForm);
  btnOpenStdTextsPage.addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('stdtexts/stdtexts.html') });
  });

  stdTextContent.addEventListener('input', () => {
    const len = stdTextContent.value.trim().length;
    stdTextCharCount.textContent = `${len} caractere${len !== 1 ? 's' : ''}`;
    stdTextCharCount.style.color = len < 30 ? '#dc3545' : '';
  });

  let stdTextsSearchTimer = null;
  stdTextsSearch.addEventListener('input', () => {
    clearTimeout(stdTextsSearchTimer);
    stdTextsSearchTimer = setTimeout(() => renderStdTextsList(), 300);
  });

  // Modal de Edição
  modalClose.addEventListener('click', closeEditModal);
  modalCancel.addEventListener('click', closeEditModal);
  modalSave.addEventListener('click', saveEditedNote);
  editModal.addEventListener('click', (e) => {
    if (e.target === editModal) closeEditModal();
  });

  // Contador de caracteres
  editText.addEventListener('input', updateCharCounter);

  // Tags
  availableTags.addEventListener('click', (e) => {
    const tagEl = e.target.closest('.tag');
    if (tagEl) {
      const tag = tagEl.dataset.tag;
      if (!selectedTags.includes(tag)) {
        selectedTags.push(tag);
        renderSelectedTags();
      }
    }
  });

  // Templates dropdown
  btnTemplates.addEventListener('click', (e) => {
    e.stopPropagation();
    templatesDropdown.classList.toggle('active');
  });

  document.addEventListener('click', (e) => {
    if (!templatesDropdown.contains(e.target)) {
      templatesDropdown.classList.remove('active');
    }
  });

  // Modal de Templates
  templatesModalClose?.addEventListener('click', () => {
    templatesModal.classList.remove('active');
  });

  btnAddTemplate?.addEventListener('click', addNewTemplate);

  templatesModal?.addEventListener('click', (e) => {
    if (e.target === templatesModal) {
      templatesModal.classList.remove('active');
    }
  });

  // Modal de Confirmação
  confirmCancel.addEventListener('click', closeConfirmModal);
  confirmOk.addEventListener('click', () => {
    if (currentConfirmCallback) {
      currentConfirmCallback();
    }
    closeConfirmModal();
  });
  confirmModal.addEventListener('click', (e) => {
    if (e.target === confirmModal) closeConfirmModal();
  });

  // Modal de Importação
  importCancel.addEventListener('click', closeImportModal);
  importMerge.addEventListener('click', async () => {
    const text = pendingImportText;
    closeImportModal();
    if (text) await doImport(text);
  });
  importReplace.addEventListener('click', async () => {
    // Guarda da via destrutiva: só avança se a frase foi digitada.
    if (!replaceConfirmReady()) {
      importReplaceConfirmInput?.focus();
      return;
    }
    const text = pendingImportText;
    closeImportModal();
    if (text) await doImport(text, true);
  });
  importReplaceConfirmInput?.addEventListener('input', syncReplaceConfirm);
  importModal.addEventListener('click', (e) => {
    if (e.target === importModal) closeImportModal();
  });

  // Alerta de storage
  storageWarningDismiss.addEventListener('click', () => {
    storageWarning.style.display = 'none';
  });

  // Atalhos de teclado
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeEditModal();
      closeConfirmModal();
      closeImportModal();
      templatesModal?.classList.remove('active');
    }
  });
}

// ============ TOAST NOTIFICATIONS ============

function showToast(message, type = 'success') {
  const icons = {
    success: '✓',
    error: '✕',
    warning: '⚠'
  };

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;

  const iconSpan = document.createElement('span');
  iconSpan.className = 'toast-icon';
  iconSpan.textContent = icons[type] || icons.success;

  const msgSpan = document.createElement('span');
  msgSpan.textContent = message;

  toast.appendChild(iconSpan);
  toast.appendChild(msgSpan);

  toastContainer.appendChild(toast);

  // Remover após animação
  setTimeout(() => {
    toast.remove();
  }, 3000);
}

// ============ MODAL DE CONFIRMAÇÃO ============

function showConfirm(message, subMessage = '', onConfirm, icon = '', actionLabel = 'Confirmar') {
  confirmIcon.textContent = icon;
  confirmMessage.textContent = message;
  confirmSub.textContent = subMessage;
  // O botão nomeia a ação real ("Excluir nota"), não "Confirmar" — sob
  // pressão de fila, "Confirmar" não diz o que está sendo confirmado.
  confirmOk.textContent = actionLabel;
  currentConfirmCallback = onConfirm;
  confirmModal.classList.add('active');
}

function closeConfirmModal() {
  confirmModal.classList.remove('active');
  currentConfirmCallback = null;
}

// ============ GUARDA DA VIA DESTRUTIVA (importação) ============

function replaceConfirmReady() {
  return (importReplaceConfirmInput?.value || '').trim().toUpperCase() === REPLACE_CONFIRM_PHRASE;
}

function syncReplaceConfirm() {
  if (!importReplace) return;
  const ready = replaceConfirmReady();
  importReplace.disabled = !ready;
  importReplace.classList.toggle('is-armed', ready);
}

function resetReplaceConfirm() {
  if (importReplaceConfirmInput) importReplaceConfirmInput.value = '';
  if (importReplace) {
    importReplace.disabled = true;
    importReplace.classList.remove('is-armed');
  }
}

function closeImportModal() {
  importModal.classList.remove('active');
  pendingImportText = null;
  resetReplaceConfirm();
}

// ============ RENDERIZAÇÃO ============

function updateCounter() {
  const count = Object.keys(notasData).length;
  const filtered = getFilteredNotes();
  const filteredCount = Object.keys(filtered).length;
  
  if (filteredCount !== count) {
    counterText.textContent = `${filteredCount} de ${count} nota${count !== 1 ? 's' : ''}`;
  } else {
    counterText.textContent = `${count} nota${count !== 1 ? 's' : ''} salva${count !== 1 ? 's' : ''}`;
  }
}

function updateStatistics() {
  const notes = Object.values(notasData);
  const total = notes.length;
  
  // Notas da semana
  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
  const weekNotes = notes.filter(n => new Date(n.createdAt) >= oneWeekAgo).length;
  
  statTotal.textContent = total;
  statWeek.textContent = weekNotes;
  
  // Estatísticas por cor
  const colorCounts = {};
  notes.forEach(n => {
    colorCounts[n.color] = (colorCounts[n.color] || 0) + 1;
  });
  
  colorStats.innerHTML = CORES_NOTAS.map(cor => {
    const count = colorCounts[cor.hex] || 0;
    // Pastel é papel (Two Materials Rule): o chip de chrome fica neutro e
    // só a amostra de cor é pastel. Sem sombra em repouso, sem wiggle.
    return `<div class="color-stat" title="${cor.nome}: ${count}"><span class="color-stat-dot" style="background:${cor.hex}"></span>${count}</div>`;
  }).join('');
}

function getFilteredNotes() {
  const term = searchInput.value.trim().toLowerCase();
  const colorFilter = filterColor.value;
  const tagFilter = filterTag.value;
  
  let filtered = {};
  
  Object.entries(notasData).forEach(([protocolo, nota]) => {
    // Filtro de busca
    if (term) {
      const matchesProtocolo = protocolo.includes(term);
      const matchesText = nota.text.toLowerCase().includes(term);
      if (!matchesProtocolo && !matchesText) return;
    }
    
    // Filtro de cor
    if (colorFilter !== 'all' && nota.color !== colorFilter) return;
    
    // Filtro de tag
    if (tagFilter !== 'all') {
      const notaTags = nota.tags || [];
      if (!notaTags.includes(tagFilter)) return;
    }
    
    filtered[protocolo] = nota;
  });
  
  return filtered;
}

function sortNotes(entries) {
  const order = filterOrder.value;
  
  return entries.sort((a, b) => {
    switch (order) {
      case 'date-desc':
        return new Date(b[1].updatedAt) - new Date(a[1].updatedAt);
      case 'date-asc':
        return new Date(a[1].updatedAt) - new Date(b[1].updatedAt);
      case 'protocolo':
        return a[0].localeCompare(b[0]);
      default:
        return new Date(b[1].updatedAt) - new Date(a[1].updatedAt);
    }
  });
}

function renderNotes() {
  const filtered = getFilteredNotes();
  const entries = Object.entries(filtered);

  updateCounter();

  // Três estados mutuamente exclusivos: erro de carga, vazio de verdade e
  // resultado filtrado vazio. Misturá-los faz a usuária não saber se perdeu
  // as notas ou se só filtrou demais — e "Erro ao carregar" não pode parecer
  // um status normal.
  if (loadError) {
    notesList.innerHTML = `
      <div class="empty-state empty-state-error">
        <p>Não foi possível carregar suas notas.</p>
        <small>As notas continuam salvas. Tente novamente.</small>
        <button type="button" class="btn-secondary btn-small" id="btnRetryLoad">Tentar novamente</button>
      </div>
    `;
    document.getElementById('btnRetryLoad')?.addEventListener('click', loadNotes);
    return;
  }

  if (entries.length === 0) {
    const hasSearch = searchInput.value.trim() || filterColor.value !== 'all' || filterTag.value !== 'all';
    notesList.innerHTML = `
      <div class="empty-state">
        <p>${hasSearch ? 'Nenhuma nota encontrada.' : 'Nenhuma nota salva ainda.'}</p>
        <small>${hasSearch ? 'Tente ajustar os filtros.' : 'Clique em "Nota" na página de tarefas para adicionar.'}</small>
      </div>
    `;
    return;
  }

  const sorted = sortNotes(entries);
  const paginated = sorted.slice(0, displayedCount);
  const remaining = sorted.length - displayedCount;

  // Uma nota malformada que normalizarNotaParaExibicao nao previu (campo
  // futuro, dado corrompido de outra forma) fica de fora da lista em vez
  // de derrubar a renderizacao inteira - o usuario ve as outras N-1 notas
  // normalmente, e o console aponta qual protocolo investigar.
  let html = paginated.map(([protocolo, nota]) => {
    try {
      return createNoteItem(protocolo, nota);
    } catch (e) {
      console.error('[NotasPat] Nota malformada, pulando da lista:', protocolo, e);
      return '';
    }
  }).join('');

  if (remaining > 0) {
    html += `<button class="btn-load-more" id="btnLoadMore">Carregar mais (${remaining} restante${remaining !== 1 ? 's' : ''})</button>`;
  }

  notesList.innerHTML = html;

  // Event listeners para ações
  notesList.querySelectorAll('.note-btn-edit').forEach(btn => {
    btn.addEventListener('click', () => openEditModal(btn.dataset.protocolo));
  });

  notesList.querySelectorAll('.note-btn-delete').forEach(btn => {
    btn.addEventListener('click', () => {
      showConfirm(
        `Excluir nota do protocolo ${btn.dataset.protocolo}?`,
        'Esta ação não pode ser desfeita.',
        () => deleteNoteByProtocolo(btn.dataset.protocolo),
        '',
        'Excluir nota'
      );
    });
  });

  notesList.querySelectorAll('.note-btn-copy').forEach(btn => {
    btn.addEventListener('click', () => copyProtocolo(btn.dataset.protocolo));
  });

  // Botão carregar mais
  const btnLoadMore = document.getElementById('btnLoadMore');
  if (btnLoadMore) {
    btnLoadMore.addEventListener('click', loadMoreNotes);
  }

  // Drag and drop
  setupDragAndDrop();
}

function loadMoreNotes() {
  displayedCount += PAGE_SIZE;
  renderNotes();
}

function createNoteItem(protocolo, nota) {
  const date = formatDate(nota.updatedAt);
  const tags = (nota.tags || []).filter(t => TAGS_DISPONIVEIS.includes(t));
  const tagsHtml = tags.map(tag =>
    `<span class="tag tag-${escapeAttr(tag)}">${escapeHtml(getTagLabel(tag))}</span>`
  ).join('');

  // Escapar dados do usuário
  const safeProtocolo = escapeAttr(protocolo);
  const safeText = escapeHtml(nota.text);
  const safeColor = escapeAttr(nota.color);
  const safeDobra = escapeAttr(getDobraColor(nota.color));
  const safeTextColor = escapeAttr(getTextColorForBackground(nota.color));

  return `
    <div class="note-item" data-protocolo="${safeProtocolo}">
      <div class="note-header">
        <div style="display: flex; align-items: center; gap: 8px;">
          <span class="drag-handle" title="Arrastar">⋮⋮</span>
          <span class="note-protocolo">${safeProtocolo}</span>
        </div>
        <div class="note-actions">
          <button class="note-btn note-btn-copy" data-protocolo="${safeProtocolo}" title="Copiar protocolo">${UI_ICONS.copy}</button>
          <button class="note-btn note-btn-edit" data-protocolo="${safeProtocolo}" title="Editar">${UI_ICONS.edit}</button>
          <button class="note-btn note-btn-delete" data-protocolo="${safeProtocolo}" title="Excluir">${UI_ICONS.trash}</button>
        </div>
      </div>
      ${tags.length > 0 ? `<div class="tags-container">${tagsHtml}</div>` : ''}
      <div class="note-text" style="--nota-bg: ${safeColor}; --nota-dobra: ${safeDobra}; --nota-text: ${safeTextColor}">
        ${safeText}
      </div>
      <div class="note-date">Atualizado: ${date}</div>
    </div>
  `;
}

function getTagLabel(tag) {
  const labels = {
    urgente: 'Urgente',
    pendencia: 'Pendência',
    lembrete: 'Lembrete',
    concluido: 'Concluído'
  };
  return labels[tag] || tag;
}

// ============ DRAG AND DROP ============

/**
 * Reordenação por arraste — DESATIVADA de propósito.
 *
 * O arraste só movia o nó no DOM e anunciava "Nota reordenada" com toast de
 * sucesso, mas nada era persistido: `sortNotes()` reordenava por data/protocolo
 * no próximo render (busca, filtro, paginação) e a ordem sumia. Era uma
 * promessa falsa no núcleo do produto ("nota não se perde").
 *
 * Volta quando existir ordem manual persistida por nota e o arraste for
 * desativado nos modos de ordenação automáticos. Até lá, nenhuma affordance.
 */
function setupDragAndDrop() {
  // intencionalmente sem efeito — ver comentário acima
}

// ============ MODAL DE EDIÇÃO ============

function createColorPicker() {
  editColorPicker.innerHTML = CORES_NOTAS.map(cor => `
    <div class="color-dot ${cor.hex === selectedColor ? 'selected' : ''}"
         style="background-color: ${cor.hex}"
         data-color="${cor.hex}"
         data-dobra="${cor.dobra}"
         title="${cor.nome}">
    </div>
  `).join('');

  editColorPicker.querySelectorAll('.color-dot').forEach(dot => {
    dot.addEventListener('click', () => {
      editColorPicker.querySelectorAll('.color-dot').forEach(d => d.classList.remove('selected'));
      dot.classList.add('selected');
      selectedColor = dot.dataset.color;
    });
  });
}

function openEditModal(protocolo) {
  const nota = notasData[protocolo];
  if (!nota) return;

  currentEditProtocolo = protocolo;
  editProtocolo.value = protocolo;
  editText.value = nota.text;
  selectedColor = nota.color;
  selectedTags = [...(nota.tags || [])];

  // Atualizar color picker
  editColorPicker.querySelectorAll('.color-dot').forEach(dot => {
    dot.classList.toggle('selected', dot.dataset.color === selectedColor);
  });

  // Atualizar contador
  updateCharCounter();
  
  // Atualizar tags
  renderSelectedTags();

  editModal.classList.add('active');
  editText.focus();
}

function closeEditModal() {
  editModal.classList.remove('active');
  currentEditProtocolo = null;
  selectedTags = [];
}

function updateCharCounter() {
  const length = editText.value.length;
  charCounter.textContent = `${length}/${MAX_CHARS}`;
  
  charCounter.classList.remove('warning', 'error');
  if (length >= MAX_CHARS) {
    charCounter.classList.add('error');
  } else if (length >= MAX_CHARS * 0.8) {
    charCounter.classList.add('warning');
  }
}

function renderSelectedTags() {
  editTags.innerHTML = selectedTags.map(tag => {
    const safeTag = escapeAttr(tag);
    return `
    <span class="tag tag-${safeTag}" data-tag="${safeTag}">
      ${escapeHtml(getTagLabel(tag))}
      <span class="tag-remove" data-tag="${safeTag}">×</span>
    </span>
  `;
  }).join('');

  editTags.querySelectorAll('.tag-remove').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const tag = btn.dataset.tag;
      selectedTags = selectedTags.filter(t => t !== tag);
      renderSelectedTags();
    });
  });
}

async function saveEditedNote() {
  if (!currentEditProtocolo) return;

  const text = editText.value.trim();
  if (!text) {
    showToast('Por favor, digite um texto para a nota.', 'warning');
    return;
  }

  try {
    const updated = await saveNote(currentEditProtocolo, text, selectedColor, selectedTags);
    notasData[currentEditProtocolo] = updated;

    renderNotes();
    updateStatistics();
    closeEditModal();
    showToast('Nota salva com sucesso!', 'success');
    await verifyStorageHealth();
  } catch (error) {
    console.error('[NotasPat] Erro ao salvar nota:', error);
    if (isQuotaError(error)) {
      notasData[currentEditProtocolo] = Object.assign({}, notasData[currentEditProtocolo], {
        text, color: selectedColor, tags: selectedTags, updatedAt: new Date().toISOString()
      });
      renderNotes();
      updateStatistics();
      closeEditModal();
      showToast(error.message, 'warning');
    } else {
      showToast('Erro ao salvar nota. Tente novamente.', 'error');
    }
  }
}

async function deleteNoteByProtocolo(protocolo) {
  try {
    await deleteNote(protocolo);
    delete notasData[protocolo];

    renderNotes();
    updateStatistics();
    showToast('Nota excluída com sucesso!', 'success');
  } catch (error) {
    console.error('[NotasPat] Erro ao excluir nota:', error);
    showToast('Erro ao excluir nota. Tente novamente.', 'error');
  }
}

function copyProtocolo(protocolo) {
  navigator.clipboard.writeText(protocolo).then(() => {
    showToast(`Protocolo ${protocolo} copiado!`, 'success');
  }).catch(() => {
    showToast('Erro ao copiar protocolo.', 'error');
  });
}

// ============ TEMPLATES ============

function renderTemplatesList() {
  templatesList.innerHTML = templatesData.map(t => {
    const safeId = escapeAttr(t.id);
    const safeNome = escapeHtml(t.nome);
    return `
      <div class="template-item" data-id="${safeId}">
        ${UI_ICONS.note} ${safeNome}
      </div>
    `;
  }).join('');

  templatesList.querySelectorAll('.template-item').forEach(item => {
    item.addEventListener('click', () => {
      const template = templatesData.find(t => t.id === item.dataset.id);
      if (template) {
        editText.value = template.texto;
        updateCharCounter();
        templatesDropdown.classList.remove('active');
        showToast(`Template "${template.nome}" aplicado`, 'success');
      }
    });
  });
}

function renderSavedTemplates() {
  if (!savedTemplates) return;

  savedTemplates.innerHTML = templatesData.map(t => {
    const safeId = escapeAttr(t.id);
    const safeNome = escapeHtml(t.nome);
    const safeTexto = escapeHtml(t.texto);
    return `
      <div class="note-item" style="margin-bottom: 8px;">
        <div class="note-header">
          <span class="note-protocolo">${safeNome}</span>
          <button class="note-btn" data-id="${safeId}" title="Excluir">${UI_ICONS.trash}</button>
        </div>
        <div class="note-text" style="--nota-bg: #f5f5f5; font-size: 11px;">${safeTexto}</div>
      </div>
    `;
  }).join('');

  savedTemplates.querySelectorAll('.note-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      showConfirm(
        'Excluir este template?',
        '',
        () => deleteTemplate(btn.dataset.id),
        '',
        'Excluir template'
      );
    });
  });
}

async function addNewTemplate() {
  const nome = newTemplateName.value.trim();
  const texto = newTemplateText.value.trim();

  if (!nome || !texto) {
    showToast('Preencha o nome e texto do template.', 'warning');
    return;
  }

  const newTemplate = {
    id: 'custom-' + Date.now(),
    nome,
    texto
  };

  templatesData.push(newTemplate);
  await saveTemplates();
  
  newTemplateName.value = '';
  newTemplateText.value = '';
  
  renderTemplatesList();
  renderSavedTemplates();
  showToast('Template adicionado!', 'success');
}

async function deleteTemplate(id) {
  templatesData = templatesData.filter(t => t.id !== id);
  await saveTemplates();
  renderTemplatesList();
  renderSavedTemplates();
  showToast('Template excluído!', 'success');
}

async function saveTemplates() {
  try {
    await chrome.storage.local.set({ templates: templatesData });
  } catch (error) {
    console.error('[NotasPat] Erro ao salvar templates:', error);
  }
}

// ============ EXPORTAR/IMPORTAR ============

async function exportNotesToFile() {
  try {
    const json = await exportNotes();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `notaspat-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    showToast('Notas exportadas com sucesso!', 'success');
  } catch (error) {
    console.error('[NotasPat] Erro ao exportar notas:', error);
    showToast('Erro ao exportar notas.', 'error');
  }
}

async function importNotesFromFile(event) {
  const file = event.target.files[0];
  if (!file) return;

  // Ler conteúdo IMEDIATAMENTE antes de limpar o input.
  // No Firefox, limpar fileInput.value pode invalidar o objeto File,
  // e o popup pode fechar ao abrir o diálogo de arquivos.
  let fileText;
  try {
    fileText = await file.text();
  } catch (error) {
    console.error('[NotasPat] Erro ao ler arquivo:', error);
    showToast('Erro ao ler arquivo.', 'error');
    return;
  }

  fileInput.value = '';

  const importCount = Object.keys(notasData).length;

  if (importCount > 0) {
    pendingImportText = fileText;
    importModalMessage.textContent = `Você tem ${importCount} nota(s) salva(s).`;
    importModalSub.textContent = 'Mesclar mantém suas notas atuais. Substituir apaga todas e importa apenas o arquivo.';
    importModal.classList.add('active');
  } else {
    await doImport(fileText);
  }
}

/**
 * Grava o arquivo de importação.
 *
 * ORDEM SEGURA (restrição dura do produto: nunca perder notas existentes):
 * o arquivo é gravado PRIMEIRO; as notas antigas só saem depois que a
 * gravação foi confirmada. Nunca existe um instante em que as antigas já
 * foram e as novas ainda não chegaram.
 *
 * @param {string} text - JSON exportado
 * @param {boolean} replace - true apaga o que não veio no arquivo
 */
async function doImport(text, replace = false) {
  // Antes de qualquer escrita, registrar o que já existe — só para saber
  // o que sobrou depois. Não se apaga nada aqui.
  let anteriores = [];
  if (replace) {
    try {
      anteriores = Object.keys(await getAllNotes());
    } catch (error) {
      console.warn('[NotasPat] Não foi possível listar as notas atuais:', error);
    }
  }

  let result;
  try {
    result = await importNotes(text);
  } catch (error) {
    // importNotes só rejeita ANTES de gravar (JSON/formato) ou DEPOIS de
    // gravar tudo (cota: parte ficou só neste computador, com .imported).
    if (error && error.code === 'QUOTA_EXCEEDED' && error.imported) {
      result = error.imported;
      console.warn('[NotasPat] Importado com aviso de cota:', error.message);
    } else {
      console.error('[NotasPat] Erro ao importar notas:', error);
      showToast('Erro ao importar. Suas notas atuais não foram alteradas.', 'error');
      return;
    }
  }

  const importadas = new Set(Object.keys(result || {}));

  if (replace && anteriores.length > 0) {
    const sobraram = anteriores.filter(p => !importadas.has(p));
    if (sobraram.length > 0) {
      try {
        await removeFromBothAreas(sobraram.map(p => NOTE_PREFIX + p));
      } catch (error) {
        // A importação valeu; só a limpeza falhou. Não é perda de dado.
        console.error('[NotasPat] Falha ao remover notas antigas:', error);
        showToast(`Importado, mas ${sobraram.length} nota(s) antiga(s) não puderam ser removidas.`, 'error');
        await loadNotes();
        await verifyStorageHealth();
        return;
      }
    }
  }

  await loadNotes();
  showToast(
    replace ? 'Notas substituídas com sucesso!' : 'Notas importadas com sucesso!',
    'success'
  );
  await verifyStorageHealth();
}

// ============ UTILIDADES ============

function formatDate(isoString) {
  const date = new Date(isoString);
  return date.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit'
  });
}

function getDobraColor(color) {
  for (const cor of CORES_NOTAS) {
    if (cor.hex === color) {
      return cor.dobra;
    }
  }
  return '#f3e58d';
}

/**
 * Calcula a cor do texto baseada na luminosidade do fundo
 * Usa a fórmula de luminosidade relativa (perceptiva)
 * @param {string} hexColor - Cor de fundo em formato hex (#RRGGBB)
 * @returns {string} Cor do texto (#1a1a1a para fundos claros, #ffffff para fundos escuros)
 */
function getTextColorForBackground(hexColor) {
  // Nota sem color definido (dado corrompido/incompleto) nao pode quebrar a
  // renderizacao de TODAS as notas - renderNotes mapeia a lista inteira
  // numa unica passada, e um erro nao tratado aqui interrompe a lista
  // inteira antes mesmo de desenhar a primeira nota.
  if (!hexColor || typeof hexColor !== 'string') return '#1a1a1a';
  // Remover # se presente
  const hex = hexColor.replace('#', '');

  // Converter para RGB
  const r = parseInt(hex.substr(0, 2), 16);
  const g = parseInt(hex.substr(2, 2), 16);
  const b = parseInt(hex.substr(4, 2), 16);

  // Calcular luminosidade relativa (fórmula perceptiva)
  // Valores: 0 (preto) a 255 (branco)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b);

  // Se luminosidade > 128, fundo é claro → texto escuro
  // Se luminosidade ≤ 128, fundo é escuro → texto claro
  return luminance > 128 ? '#1a1a1a' : '#ffffff';
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

// ============ TEXTOS PADRAO ============

function toggleStdTextsPanel() {
  const visible = stdTextsPanel.style.display !== 'none';
  stdTextsPanel.style.display = visible ? 'none' : '';
  if (!visible) loadStdTexts();
}

async function loadStdTexts() {
  try {
    stdTextsData = await getStandardTexts();
    renderStdTextsList();
  } catch (err) {
    console.error('[NotasPat] Erro ao carregar textos padrao:', err);
  }
}

function renderStdTextsList() {
  stdTextsList.innerHTML = '';
  const query = (stdTextsSearch.value || '').toLowerCase();
  const filtered = stdTextsData.filter(t =>
    t.title.toLowerCase().includes(query) || t.text.toLowerCase().includes(query)
  );

  if (filtered.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'stdtexts-empty';
    empty.textContent = stdTextsData.length === 0 ? 'Nenhum texto padrão cadastrado.' : 'Nenhum resultado.';
    stdTextsList.appendChild(empty);
    return;
  }

  filtered.forEach(t => {
    const item = document.createElement('div');
    item.className = 'stdtexts-item';

    const info = document.createElement('div');
    info.className = 'stdtexts-item-info';

    const title = document.createElement('div');
    title.className = 'stdtexts-item-title';
    title.textContent = t.title;
    info.appendChild(title);

    const meta = document.createElement('div');
    meta.className = 'stdtexts-item-meta';
    meta.textContent = `${t.text.length} caracteres`;
    info.appendChild(meta);

    item.appendChild(info);

    const actions = document.createElement('div');
    actions.className = 'stdtexts-item-actions';

    const editBtn = document.createElement('button');
    editBtn.className = 'stdtexts-item-btn';
    editBtn.textContent = '\u270F\uFE0F';
    editBtn.title = 'Editar';
    editBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      showStdTextForm(t);
    });
    actions.appendChild(editBtn);

    const delBtn = document.createElement('button');
    delBtn.className = 'stdtexts-item-btn stdtexts-item-btn-danger';
    delBtn.textContent = '\uD83D\uDDD1\uFE0F';
    delBtn.title = 'Excluir';
    delBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      handleDeleteStdText(t);
    });
    actions.appendChild(delBtn);

    item.appendChild(actions);
    stdTextsList.appendChild(item);
  });
}

function showStdTextForm(existing) {
  stdTextsForm.style.display = '';
  btnAddStdText.style.display = 'none';
  if (existing && existing.id) {
    editingStdTextId = existing.id;
    stdTextTitle.value = existing.title;
    stdTextContent.value = existing.text;
  } else {
    editingStdTextId = null;
    stdTextTitle.value = '';
    stdTextContent.value = '';
  }
  const len = stdTextContent.value.trim().length;
  stdTextCharCount.textContent = `${len} caractere${len !== 1 ? 's' : ''}`;
  stdTextCharCount.style.color = len < 30 ? '#dc3545' : '';
  stdTextTitle.focus();
}

function hideStdTextForm() {
  stdTextsForm.style.display = 'none';
  btnAddStdText.style.display = '';
  editingStdTextId = null;
  stdTextTitle.value = '';
  stdTextContent.value = '';
  stdTextCharCount.textContent = '0 caracteres';
}

async function handleSaveStdText() {
  const title = stdTextTitle.value.trim();
  const text = stdTextContent.value.trim();

  if (!title) { showToast('Título é obrigatório', 'error'); return; }
  if (text.length < 30) { showToast('Texto deve ter no minimo 30 caracteres', 'error'); return; }

  try {
    if (editingStdTextId) {
      await updateStandardText(editingStdTextId, title, text);
      showToast('Texto atualizado com sucesso', 'success');
    } else {
      await saveStandardText(title, text);
      showToast('Texto criado com sucesso', 'success');
    }
    hideStdTextForm();
    await loadStdTexts();
  } catch (error) {
    console.error('[NotasPat] Erro ao salvar texto padrao:', error);
    showToast(isQuotaError(error) ? error.message : 'Erro ao salvar texto padrão.', isQuotaError(error) ? 'warning' : 'error');
  }
}

async function handleDeleteStdText(item) {
  showConfirm(
    `Excluir "${escapeHtml(item.title)}"?`,
    'Esta ação não pode ser desfeita.',
    async () => {
      try {
        await deleteStandardText(item.id);
        showToast('Texto excluído', 'success');
        await loadStdTexts();
      } catch (err) {
        showToast('Erro ao excluir: ' + err.message, 'error');
      }
    },
    '',
    'Excluir texto'
  );
}
