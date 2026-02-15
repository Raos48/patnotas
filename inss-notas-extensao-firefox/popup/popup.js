/**
 * Popup Script - NotasPat
 * Versão 1.3.0 (Firefox) - Com Dark Mode, Tags, Templates, Filtros e mais
 * Usa browser.* APIs nativas do Firefox.
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
let draggedItem = null;
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
    const result = await browser.storage.local.get(['theme']);
    isDarkTheme = result.theme === 'dark';
    
    // Detectar preferência do sistema se não houver preferência salva
    if (!result.theme) {
      isDarkTheme = window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    
    applyTheme();
  } catch (error) {
    console.error('Erro ao carregar tema:', error);
  }
}

function applyTheme() {
  document.body.classList.toggle('dark-theme', isDarkTheme);
  themeToggle.textContent = isDarkTheme ? '☀️' : '🌙';
  themeToggle.title = isDarkTheme ? 'Tema claro' : 'Tema escuro';
}

async function toggleTheme() {
  isDarkTheme = !isDarkTheme;
  applyTheme();
  try {
    await browser.storage.local.set({ theme: isDarkTheme ? 'dark' : 'light' });
    showToast(`Tema ${isDarkTheme ? 'escuro' : 'claro'} ativado`, 'success');
  } catch (error) {
    console.error('Erro ao salvar tema:', error);
  }
}

async function loadNotes() {
  try {
    notasData = await getAllNotes();
    updateCounter();
    renderNotes();
    updateStatistics();
    await verifyStorageHealth();
  } catch (error) {
    console.error('Erro ao carregar notas:', error);
    counterText.textContent = 'Erro ao carregar';
    showToast('Erro ao carregar notas', 'error');
  }
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
    console.error('Erro ao verificar storage:', error);
  }
}

async function loadTemplates() {
  try {
    const result = await browser.storage.local.get(['templates']);
    templatesData = result.templates || [...TEMPLATES_PADRAO];
    renderTemplatesList();
    renderSavedTemplates();
  } catch (error) {
    console.error('Erro ao carregar templates:', error);
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
  btnImport.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', importNotesFromFile);

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

  // Alerta de storage
  storageWarningDismiss.addEventListener('click', () => {
    storageWarning.style.display = 'none';
  });

  // Atalhos de teclado
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeEditModal();
      closeConfirmModal();
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

function showConfirm(message, subMessage = '', onConfirm, icon = '⚠️') {
  confirmIcon.textContent = icon;
  confirmMessage.textContent = message;
  confirmSub.textContent = subMessage;
  currentConfirmCallback = onConfirm;
  confirmModal.classList.add('active');
}

function closeConfirmModal() {
  confirmModal.classList.remove('active');
  currentConfirmCallback = null;
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
  
  colorStats.textContent = '';
  CORES_NOTAS.forEach(cor => {
    const count = colorCounts[cor.hex] || 0;
    const stat = document.createElement('div');
    stat.className = 'color-stat';
    stat.style.background = cor.hex;
    stat.title = `${cor.nome}: ${count}`;
    stat.textContent = count;
    colorStats.appendChild(stat);
  });
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

  notesList.textContent = '';

  if (entries.length === 0) {
    const hasSearch = searchInput.value.trim() || filterColor.value !== 'all' || filterTag.value !== 'all';
    const emptyDiv = document.createElement('div');
    emptyDiv.className = 'empty-state';
    const p = document.createElement('p');
    p.textContent = hasSearch ? 'Nenhuma nota encontrada.' : 'Nenhuma nota salva ainda.';
    const small = document.createElement('small');
    small.textContent = hasSearch ? 'Tente ajustar os filtros.' : 'Clique em "📝 Nota" na página de tarefas para adicionar.';
    emptyDiv.appendChild(p);
    emptyDiv.appendChild(small);
    notesList.appendChild(emptyDiv);
    return;
  }

  const sorted = sortNotes(entries);
  const paginated = sorted.slice(0, displayedCount);
  const remaining = sorted.length - displayedCount;

  paginated.forEach(([protocolo, nota]) => {
    notesList.appendChild(createNoteItemElement(protocolo, nota));
  });

  if (remaining > 0) {
    const btnLoadMore = document.createElement('button');
    btnLoadMore.className = 'btn-load-more';
    btnLoadMore.id = 'btnLoadMore';
    btnLoadMore.textContent = `Carregar mais (${remaining} restante${remaining !== 1 ? 's' : ''})`;
    btnLoadMore.addEventListener('click', loadMoreNotes);
    notesList.appendChild(btnLoadMore);
  }

  // Drag and drop
  setupDragAndDrop();
}

function loadMoreNotes() {
  displayedCount += PAGE_SIZE;
  renderNotes();
}

function createNoteItemElement(protocolo, nota) {
  const date = formatDate(nota.updatedAt);
  const tags = nota.tags || [];

  const item = document.createElement('div');
  item.className = 'note-item';
  item.draggable = true;
  item.dataset.protocolo = protocolo;

  // Header
  const header = document.createElement('div');
  header.className = 'note-header';

  const leftDiv = document.createElement('div');
  leftDiv.style.cssText = 'display: flex; align-items: center; gap: 8px;';
  const dragHandle = document.createElement('span');
  dragHandle.className = 'drag-handle';
  dragHandle.title = 'Arrastar';
  dragHandle.textContent = '⋮⋮';
  const protocoloSpan = document.createElement('span');
  protocoloSpan.className = 'note-protocolo';
  protocoloSpan.textContent = protocolo;
  leftDiv.appendChild(dragHandle);
  leftDiv.appendChild(protocoloSpan);

  const actionsDiv = document.createElement('div');
  actionsDiv.className = 'note-actions';

  const btnCopy = document.createElement('button');
  btnCopy.className = 'note-btn note-btn-copy';
  btnCopy.dataset.protocolo = protocolo;
  btnCopy.title = 'Copiar protocolo';
  btnCopy.textContent = '📋';
  btnCopy.addEventListener('click', () => copyProtocolo(protocolo));

  const btnEdit = document.createElement('button');
  btnEdit.className = 'note-btn note-btn-edit';
  btnEdit.dataset.protocolo = protocolo;
  btnEdit.title = 'Editar';
  btnEdit.textContent = '✏️';
  btnEdit.addEventListener('click', () => openEditModal(protocolo));

  const btnDelete = document.createElement('button');
  btnDelete.className = 'note-btn note-btn-delete';
  btnDelete.dataset.protocolo = protocolo;
  btnDelete.title = 'Excluir';
  btnDelete.textContent = '🗑️';
  btnDelete.addEventListener('click', () => {
    showConfirm(
      `Excluir nota do protocolo ${protocolo}?`,
      'Esta ação não pode ser desfeita.',
      () => deleteNoteByProtocolo(protocolo),
      '🗑️'
    );
  });

  actionsDiv.appendChild(btnCopy);
  actionsDiv.appendChild(btnEdit);
  actionsDiv.appendChild(btnDelete);
  header.appendChild(leftDiv);
  header.appendChild(actionsDiv);
  item.appendChild(header);

  // Tags
  if (tags.length > 0) {
    const tagsContainer = document.createElement('div');
    tagsContainer.className = 'tags-container';
    tags.forEach(tag => {
      const tagSpan = document.createElement('span');
      tagSpan.className = `tag tag-${tag}`;
      tagSpan.textContent = getTagLabel(tag);
      tagsContainer.appendChild(tagSpan);
    });
    item.appendChild(tagsContainer);
  }

  // Note text
  const noteText = document.createElement('div');
  noteText.className = 'note-text';
  noteText.style.setProperty('--nota-bg', nota.color);
  noteText.style.setProperty('--nota-dobra', getDobraColor(nota.color));
  noteText.textContent = nota.text;
  item.appendChild(noteText);

  // Date
  const noteDate = document.createElement('div');
  noteDate.className = 'note-date';
  noteDate.textContent = `Atualizado: ${date}`;
  item.appendChild(noteDate);

  return item;
}

function getTagLabel(tag) {
  const labels = {
    urgente: '🔴 Urgente',
    pendencia: '🟡 Pendência',
    lembrete: '🔵 Lembrete',
    concluido: '🟢 Concluído'
  };
  return labels[tag] || tag;
}

// ============ DRAG AND DROP ============

function setupDragAndDrop() {
  const items = notesList.querySelectorAll('.note-item');
  
  items.forEach(item => {
    item.addEventListener('dragstart', handleDragStart);
    item.addEventListener('dragend', handleDragEnd);
    item.addEventListener('dragover', handleDragOver);
    item.addEventListener('drop', handleDrop);
    item.addEventListener('dragleave', handleDragLeave);
  });
}

function handleDragStart(e) {
  draggedItem = this;
  this.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
}

function handleDragEnd() {
  this.classList.remove('dragging');
  draggedItem = null;
  notesList.querySelectorAll('.note-item').forEach(item => {
    item.classList.remove('drag-over');
  });
}

function handleDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  if (this !== draggedItem) {
    this.classList.add('drag-over');
  }
}

function handleDragLeave() {
  this.classList.remove('drag-over');
}

function handleDrop(e) {
  e.preventDefault();
  this.classList.remove('drag-over');
  
  if (this !== draggedItem && draggedItem) {
    const items = Array.from(notesList.querySelectorAll('.note-item'));
    const draggedIndex = items.indexOf(draggedItem);
    const targetIndex = items.indexOf(this);
    
    if (draggedIndex < targetIndex) {
      this.parentNode.insertBefore(draggedItem, this.nextSibling);
    } else {
      this.parentNode.insertBefore(draggedItem, this);
    }
    
    showToast('Nota reordenada', 'success');
  }
}

// ============ MODAL DE EDIÇÃO ============

function createColorPicker() {
  editColorPicker.textContent = '';
  CORES_NOTAS.forEach(cor => {
    const dot = document.createElement('div');
    dot.className = `color-dot${cor.hex === selectedColor ? ' selected' : ''}`;
    dot.style.backgroundColor = cor.hex;
    dot.dataset.color = cor.hex;
    dot.dataset.dobra = cor.dobra;
    dot.title = cor.nome;
    dot.addEventListener('click', () => {
      editColorPicker.querySelectorAll('.color-dot').forEach(d => d.classList.remove('selected'));
      dot.classList.add('selected');
      selectedColor = dot.dataset.color;
    });
    editColorPicker.appendChild(dot);
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
  editTags.textContent = '';
  selectedTags.forEach(tag => {
    const tagSpan = document.createElement('span');
    tagSpan.className = `tag tag-${tag}`;
    tagSpan.dataset.tag = tag;
    tagSpan.textContent = getTagLabel(tag) + ' ';
    const removeBtn = document.createElement('span');
    removeBtn.className = 'tag-remove';
    removeBtn.dataset.tag = tag;
    removeBtn.textContent = '×';
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      selectedTags = selectedTags.filter(t => t !== tag);
      renderSelectedTags();
    });
    tagSpan.appendChild(removeBtn);
    editTags.appendChild(tagSpan);
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
    console.error('Erro ao salvar nota:', error);
    showToast('Erro ao salvar nota. Tente novamente.', 'error');
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
    console.error('Erro ao excluir nota:', error);
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
  templatesList.textContent = '';
  templatesData.forEach(t => {
    const item = document.createElement('div');
    item.className = 'template-item';
    item.dataset.id = t.id;
    item.textContent = `📋 ${t.nome}`;
    item.addEventListener('click', () => {
      const template = templatesData.find(tmpl => tmpl.id === t.id);
      if (template) {
        editText.value = template.texto;
        updateCharCounter();
        templatesDropdown.classList.remove('active');
        showToast(`Template "${template.nome}" aplicado`, 'success');
      }
    });
    templatesList.appendChild(item);
  });
}

function renderSavedTemplates() {
  if (!savedTemplates) return;

  savedTemplates.textContent = '';
  templatesData.forEach(t => {
    const item = document.createElement('div');
    item.className = 'note-item';
    item.style.marginBottom = '8px';

    const header = document.createElement('div');
    header.className = 'note-header';
    const nome = document.createElement('span');
    nome.className = 'note-protocolo';
    nome.textContent = t.nome;
    const btnDel = document.createElement('button');
    btnDel.className = 'note-btn';
    btnDel.dataset.id = t.id;
    btnDel.title = 'Excluir';
    btnDel.textContent = '🗑️';
    btnDel.addEventListener('click', () => {
      showConfirm(
        'Excluir este template?',
        '',
        () => deleteTemplate(t.id),
        '🗑️'
      );
    });
    header.appendChild(nome);
    header.appendChild(btnDel);

    const text = document.createElement('div');
    text.className = 'note-text';
    text.style.setProperty('--nota-bg', '#f5f5f5');
    text.style.fontSize = '11px';
    text.textContent = t.texto;

    item.appendChild(header);
    item.appendChild(text);
    savedTemplates.appendChild(item);
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
    await browser.storage.local.set({ templates: templatesData });
  } catch (error) {
    console.error('Erro ao salvar templates:', error);
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
    console.error('Erro ao exportar notas:', error);
    showToast('Erro ao exportar notas.', 'error');
  }
}

async function importNotesFromFile(event) {
  const file = event.target.files[0];
  if (!file) return;

  fileInput.value = '';

  const importCount = Object.keys(notasData).length;
  
  if (importCount > 0) {
    showConfirm(
      `Você tem ${importCount} nota(s) salva(s).`,
      'Deseja importar e mesclar com as notas existentes?',
      async () => {
        await doImport(file);
      },
      '📥'
    );
  } else {
    await doImport(file);
  }
}

async function doImport(file) {
  try {
    const text = await file.text();
    await importNotes(text);
    await loadNotes();
    showToast('Notas importadas com sucesso!', 'success');
    await verifyStorageHealth();
  } catch (error) {
    console.error('Erro ao importar notas:', error);
    showToast('Erro ao importar. Verifique o arquivo.', 'error');
  }
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
