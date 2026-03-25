/**
 * Pagina Dedicada - Textos Padrao (NotasPat)
 * CRUD completo, busca, exportar/importar.
 */

// ============ ELEMENTOS ============

const searchInput = document.getElementById('searchInput');
const btnNew = document.getElementById('btnNew');
const btnExport = document.getElementById('btnExport');
const btnImportFile = document.getElementById('btnImportFile');
const fileInput = document.getElementById('fileInput');

const formSection = document.getElementById('formSection');
const inputTitle = document.getElementById('inputTitle');
const inputText = document.getElementById('inputText');
const titleHint = document.getElementById('titleHint');
const textHint = document.getElementById('textHint');
const btnFormSave = document.getElementById('btnFormSave');
const btnFormCancel = document.getElementById('btnFormCancel');

const textsList = document.getElementById('textsList');

const importSection = document.getElementById('importSection');
const importInfo = document.getElementById('importInfo');
const btnImportMerge = document.getElementById('btnImportMerge');
const btnImportReplace = document.getElementById('btnImportReplace');
const btnImportCancel = document.getElementById('btnImportCancel');

// ============ ESTADO ============

let allTexts = [];
let editingId = null;
let pendingImportText = null;

// ============ INIT ============

document.addEventListener('DOMContentLoaded', async () => {
  console.log('[NotasPat][stdtexts] Pagina inicializada');
  await loadTexts();
  setupEvents();
});

function setupEvents() {
  btnNew.addEventListener('click', () => showForm());
  btnFormSave.addEventListener('click', handleSave);
  btnFormCancel.addEventListener('click', hideForm);

  inputTitle.addEventListener('input', () => {
    titleHint.textContent = `${inputTitle.value.length}/100`;
  });

  inputText.addEventListener('input', () => {
    const len = inputText.value.trim().length;
    textHint.textContent = `${len} caractere${len !== 1 ? 's' : ''}`;
    textHint.style.color = len < 30 ? '#dc3545' : '';
  });

  let searchTimer = null;
  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => renderList(), 300);
  });

  // Export
  btnExport.addEventListener('click', handleExport);

  // Import
  btnImportFile.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (file) await handleImportFile(file);
    fileInput.value = '';
  });

  btnImportMerge.addEventListener('click', () => doImport(false));
  btnImportReplace.addEventListener('click', () => doImport(true));
  btnImportCancel.addEventListener('click', () => {
    pendingImportText = null;
    importSection.style.display = 'none';
  });
}

// ============ CRUD ============

async function loadTexts() {
  try {
    allTexts = await getStandardTexts();
    renderList();
  } catch (err) {
    console.error('[NotasPat][stdtexts] Erro ao carregar:', err);
    showToast('Erro ao carregar textos', 'error');
  }
}

function renderList() {
  textsList.innerHTML = '';
  const query = (searchInput.value || '').toLowerCase();
  const filtered = allTexts.filter(t =>
    t.title.toLowerCase().includes(query) || t.text.toLowerCase().includes(query)
  );

  if (filtered.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'texts-empty';
    empty.textContent = allTexts.length === 0
      ? 'Nenhum texto padrao cadastrado. Clique em "+ Novo" para criar.'
      : 'Nenhum resultado.';
    textsList.appendChild(empty);
    return;
  }

  filtered.forEach(t => {
    const card = document.createElement('div');
    card.className = 'text-card';

    const header = document.createElement('div');
    header.className = 'text-card-header';

    const title = document.createElement('div');
    title.className = 'text-card-title';
    title.textContent = t.title;
    header.appendChild(title);

    const actions = document.createElement('div');
    actions.className = 'text-card-actions';

    const editBtn = document.createElement('button');
    editBtn.className = 'text-card-btn';
    editBtn.textContent = 'Editar';
    editBtn.addEventListener('click', () => showForm(t));
    actions.appendChild(editBtn);

    const delBtn = document.createElement('button');
    delBtn.className = 'text-card-btn text-card-btn-danger';
    delBtn.textContent = 'Excluir';
    delBtn.addEventListener('click', () => handleDelete(t));
    actions.appendChild(delBtn);

    header.appendChild(actions);
    card.appendChild(header);

    const preview = document.createElement('div');
    preview.className = 'text-card-preview';
    preview.textContent = t.text.length > 120 ? t.text.substring(0, 120) + '...' : t.text;
    card.appendChild(preview);

    const meta = document.createElement('div');
    meta.className = 'text-card-meta';
    meta.textContent = `${t.text.length} caracteres \u00B7 Criado em ${formatDate(t.createdAt)}`;
    card.appendChild(meta);

    textsList.appendChild(card);
  });
}

function showForm(existing) {
  formSection.style.display = '';
  if (existing) {
    editingId = existing.id;
    inputTitle.value = existing.title;
    inputText.value = existing.text;
  } else {
    editingId = null;
    inputTitle.value = '';
    inputText.value = '';
  }
  titleHint.textContent = `${inputTitle.value.length}/100`;
  const len = inputText.value.trim().length;
  textHint.textContent = `${len} caractere${len !== 1 ? 's' : ''}`;
  textHint.style.color = len < 30 ? '#dc3545' : '';
  inputTitle.focus();
  formSection.scrollIntoView({ behavior: 'smooth' });
}

function hideForm() {
  formSection.style.display = 'none';
  editingId = null;
  inputTitle.value = '';
  inputText.value = '';
}

async function handleSave() {
  const title = inputTitle.value.trim();
  const text = inputText.value.trim();

  if (!title) { showToast('Titulo e obrigatorio', 'error'); return; }
  if (text.length < 30) { showToast('Texto deve ter no minimo 30 caracteres', 'error'); return; }

  try {
    if (editingId) {
      await updateStandardText(editingId, title, text);
      showToast('Texto atualizado!', 'success');
    } else {
      await saveStandardText(title, text);
      showToast('Texto criado!', 'success');
    }
    hideForm();
    await loadTexts();
  } catch (err) {
    showToast('Erro: ' + err.message, 'error');
  }
}

async function handleDelete(item) {
  if (!confirm(`Excluir "${item.title}"? Esta acao nao pode ser desfeita.`)) return;
  try {
    await deleteStandardText(item.id);
    showToast('Texto excluido', 'success');
    await loadTexts();
  } catch (err) {
    showToast('Erro: ' + err.message, 'error');
  }
}

// ============ EXPORT / IMPORT ============

async function handleExport() {
  try {
    const json = await exportStandardTexts();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'textos-padrao.json';
    a.click();
    URL.revokeObjectURL(url);
    showToast('Exportado com sucesso!', 'success');
  } catch (err) {
    showToast('Erro ao exportar: ' + err.message, 'error');
  }
}

async function handleImportFile(file) {
  if (!file.name.endsWith('.json')) {
    showToast('Selecione um arquivo .json', 'error');
    return;
  }

  try {
    const text = await file.text();
    const parsed = JSON.parse(text);

    if (parsed.type !== 'standard_texts' || !Array.isArray(parsed.texts)) {
      showToast('Arquivo nao e um export de textos padrao', 'error');
      return;
    }

    pendingImportText = text;
    const count = parsed.texts.length;
    importInfo.textContent = `Arquivo: ${file.name} (${count} texto${count !== 1 ? 's' : ''}). Voce tem ${allTexts.length} texto(s) salvo(s).`;
    importSection.style.display = '';
  } catch (err) {
    showToast('Arquivo invalido: ' + err.message, 'error');
  }
}

async function doImport(replace) {
  if (!pendingImportText) return;
  try {
    const result = await importStandardTexts(pendingImportText, replace);
    const count = result.length;
    showToast(
      replace
        ? `${count} texto(s) importado(s) (substituicao)`
        : `${count} texto(s) no total (mesclagem)`,
      'success'
    );
    pendingImportText = null;
    importSection.style.display = 'none';
    await loadTexts();
  } catch (err) {
    showToast('Erro: ' + err.message, 'error');
  }
}

// ============ UTILS ============

function formatDate(iso) {
  try {
    return new Date(iso).toLocaleDateString('pt-BR');
  } catch {
    return '';
  }
}

function showToast(message, type) {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}
