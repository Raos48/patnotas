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

const TAGS_DISPONIVEIS = ['urgente', 'pendencia', 'lembrete', 'concluido'];

const TEMPLATES_PADRAO = [
  { id: 'aguardando-doc', nome: 'Aguardando documentação', texto: 'Aguardando envio de documentação complementar pelo interessado.' },
  { id: 'ligar', nome: 'Ligar para interessado', texto: 'Ligar para o interessado para esclarecer pendências.' },
  { id: 'analise', nome: 'Em análise', texto: 'Processo em análise técnica.' },
  { id: 'retorno', nome: 'Aguardando retorno', texto: 'Aguardando retorno do interessado.' }
];

const MAX_CHARS = 500;

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

// Funções com debounce para busca e filtros
const debouncedRenderFromSearch = debounce(renderNotes, 300);
const debouncedRenderFromFilter = debounce(renderNotes, 150);

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
    await chrome.storage.local.set({ theme: isDarkTheme ? 'dark' : 'light' });
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
    const result = await chrome.storage.local.get(['templates']);
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
  toast.innerHTML = `
    <span class="toast-icon">${icons[type] || icons.success}</span>
    <span>${message}</span>
  `;

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
  
  colorStats.innerHTML = CORES_NOTAS.map(cor => {
    const count = colorCounts[cor.hex] || 0;
    return `<div class="color-stat" style="background: ${cor.hex}" title="${cor.nome}: ${count}">${count}</div>`;
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

  if (entries.length === 0) {
    const hasSearch = searchInput.value.trim() || filterColor.value !== 'all' || filterTag.value !== 'all';
    notesList.innerHTML = `
      <div class="empty-state">
        <p>${hasSearch ? 'Nenhuma nota encontrada.' : 'Nenhuma nota salva ainda.'}</p>
        <small>${hasSearch ? 'Tente ajustar os filtros.' : 'Clique em "📝 Nota" na página de tarefas para adicionar.'}</small>
      </div>
    `;
    return;
  }

  const sorted = sortNotes(entries);

  notesList.innerHTML = sorted.map(([protocolo, nota]) => createNoteItem(protocolo, nota)).join('');

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
        '🗑️'
      );
    });
  });

  notesList.querySelectorAll('.note-btn-copy').forEach(btn => {
    btn.addEventListener('click', () => copyProtocolo(btn.dataset.protocolo));
  });

  // Drag and drop
  setupDragAndDrop();
}

function createNoteItem(protocolo, nota) {
  const date = formatDate(nota.updatedAt);
  const tags = nota.tags || [];
  const tagsHtml = tags.map(tag =>
    `<span class="tag tag-${tag}">${getTagLabel(tag)}</span>`
  ).join('');

  // Escapar dados do usuário
  const safeProtocolo = escapeAttr(protocolo);
  const safeText = escapeHtml(nota.text);
  const safeColor = escapeAttr(nota.color);
  const safeDobra = escapeAttr(getDobraColor(nota.color));

  return `
    <div class="note-item" draggable="true" data-protocolo="${safeProtocolo}">
      <div class="note-header">
        <div style="display: flex; align-items: center; gap: 8px;">
          <span class="drag-handle" title="Arrastar">⋮⋮</span>
          <span class="note-protocolo">${safeProtocolo}</span>
        </div>
        <div class="note-actions">
          <button class="note-btn note-btn-copy" data-protocolo="${safeProtocolo}" title="Copiar protocolo">📋</button>
          <button class="note-btn note-btn-edit" data-protocolo="${safeProtocolo}" title="Editar">✏️</button>
          <button class="note-btn note-btn-delete" data-protocolo="${safeProtocolo}" title="Excluir">🗑️</button>
        </div>
      </div>
      ${tags.length > 0 ? `<div class="tags-container">${tagsHtml}</div>` : ''}
      <div class="note-text" style="--nota-bg: ${safeColor}; --nota-dobra: ${safeDobra}">
        ${safeText}
      </div>
      <div class="note-date">Atualizado: ${date}</div>
    </div>
  `;
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
  editTags.innerHTML = selectedTags.map(tag => `
    <span class="tag tag-${tag}" data-tag="${tag}">
      ${getTagLabel(tag)}
      <span class="tag-remove" data-tag="${tag}">×</span>
    </span>
  `).join('');

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
  templatesList.innerHTML = templatesData.map(t => {
    const safeId = escapeAttr(t.id);
    const safeNome = escapeHtml(t.nome);
    return `
      <div class="template-item" data-id="${safeId}">
        📋 ${safeNome}
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
          <button class="note-btn" data-id="${safeId}" title="Excluir">🗑️</button>
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
        '🗑️'
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
