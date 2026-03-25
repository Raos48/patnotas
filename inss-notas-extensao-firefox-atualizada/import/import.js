/**
 * Página de Importação - NotasPat (Firefox)
 * Página dedicada para importar notas, contornando a limitação
 * do popup do Firefox que fecha ao abrir diálogos de arquivo.
 */

// ============ ELEMENTOS ============

const stateSelect = document.getElementById('stateSelect');
const stateMode = document.getElementById('stateMode');
const stateLoading = document.getElementById('stateLoading');
const stateSuccess = document.getElementById('stateSuccess');
const stateError = document.getElementById('stateError');

const dropArea = document.getElementById('dropArea');
const btnSelectFile = document.getElementById('btnSelectFile');
const fileInput = document.getElementById('fileInput');

const modeFileInfo = document.getElementById('modeFileInfo');
const modeMessage = document.getElementById('modeMessage');
const btnMerge = document.getElementById('btnMerge');
const btnReplace = document.getElementById('btnReplace');
const btnModeCancel = document.getElementById('btnModeCancel');

const successText = document.getElementById('successText');
const btnClose = document.getElementById('btnClose');

const errorText = document.getElementById('errorText');
const errorHint = document.getElementById('errorHint');
const btnRetry = document.getElementById('btnRetry');

// ============ ESTADO ============

let pendingText = null;
let existingCount = 0;

// ============ INICIALIZAÇÃO ============

document.addEventListener('DOMContentLoaded', async () => {
  console.log('[NotasPat][import] Página de importação inicializada');

  // Contar notas existentes
  try {
    const notes = await getAllNotes();
    existingCount = Object.keys(notes).length;
    console.log('[NotasPat][import] Notas existentes:', existingCount);
  } catch (error) {
    console.error('[NotasPat][import] Erro ao contar notas:', error);
  }

  setupEvents();
});

// ============ EVENTOS ============

function setupEvents() {
  // Botão selecionar arquivo
  btnSelectFile.addEventListener('click', (e) => {
    e.stopPropagation();
    fileInput.click();
  });

  // File input change
  fileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (file) await handleFile(file);
    fileInput.value = '';
  });

  // Drop area click também abre file dialog
  dropArea.addEventListener('click', () => {
    fileInput.click();
  });

  // Drag & drop
  ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(event => {
    dropArea.addEventListener(event, (e) => {
      e.preventDefault();
      e.stopPropagation();
    });
  });

  dropArea.addEventListener('dragenter', () => {
    dropArea.classList.add('drag-hover');
  });

  dropArea.addEventListener('dragleave', (e) => {
    if (!dropArea.contains(e.relatedTarget)) {
      dropArea.classList.remove('drag-hover');
    }
  });

  dropArea.addEventListener('drop', async (e) => {
    dropArea.classList.remove('drag-hover');
    const file = e.dataTransfer.files[0];
    if (file) await handleFile(file);
  });

  // Botões do modo
  btnMerge.addEventListener('click', () => doImport(false));
  btnReplace.addEventListener('click', () => doImport(true));
  btnModeCancel.addEventListener('click', () => {
    pendingText = null;
    showState('select');
  });

  // Botão fechar
  btnClose.addEventListener('click', () => {
    window.close();
  });

  // Botão tentar novamente
  btnRetry.addEventListener('click', () => {
    pendingText = null;
    showState('select');
  });
}

// ============ LÓGICA ============

function showState(state) {
  stateSelect.style.display = state === 'select' ? '' : 'none';
  stateMode.style.display = state === 'mode' ? '' : 'none';
  stateLoading.style.display = state === 'loading' ? '' : 'none';
  stateSuccess.style.display = state === 'success' ? '' : 'none';
  stateError.style.display = state === 'error' ? '' : 'none';
}

async function handleFile(file) {
  console.log('[NotasPat][import] Arquivo selecionado:', file.name, 'tamanho:', file.size);

  if (!file.name.endsWith('.json')) {
    showError('Formato inválido', 'Selecione um arquivo .json exportado pelo NotasPat.');
    return;
  }

  let text;
  try {
    text = await file.text();
    console.log('[NotasPat][import] Arquivo lido, tamanho texto:', text.length);
  } catch (error) {
    console.error('[NotasPat][import] Erro ao ler arquivo:', error);
    showError('Erro ao ler arquivo', error.message);
    return;
  }

  // Validar JSON
  let parsed;
  try {
    parsed = JSON.parse(text);
    if (!parsed.notes || typeof parsed.notes !== 'object') {
      throw new Error('Formato de arquivo inválido');
    }
  } catch (error) {
    console.error('[NotasPat][import] JSON inválido:', error);
    showError('Arquivo inválido', 'O arquivo não é um export válido do NotasPat.');
    return;
  }

  const importCount = Object.keys(parsed.notes).length;
  console.log('[NotasPat][import] Notas no arquivo:', importCount);
  pendingText = text;

  if (existingCount > 0) {
    // Mostrar opções mesclar/substituir
    modeFileInfo.textContent = `Arquivo: ${file.name} (${importCount} nota${importCount !== 1 ? 's' : ''})`;
    modeMessage.textContent = `Você tem ${existingCount} nota(s) salva(s).`;
    showState('mode');
  } else {
    // Importar direto
    await doImport(false);
  }
}

async function doImport(replace) {
  if (!pendingText) return;

  showState('loading');
  console.log('[NotasPat][import] Importando... modo:', replace ? 'substituir' : 'mesclar');

  try {
    if (replace) {
      await deleteAllNotes();
      console.log('[NotasPat][import] Notas existentes removidas');
    }

    const result = await importNotes(pendingText);
    const count = Object.keys(result).length;
    console.log('[NotasPat][import] Importação concluída:', count, 'notas');

    successText.textContent = replace
      ? `${count} nota${count !== 1 ? 's' : ''} importada${count !== 1 ? 's' : ''} (substituição).`
      : `${count} nota${count !== 1 ? 's' : ''} importada${count !== 1 ? 's' : ''} (mesclagem).`;
    showState('success');
    pendingText = null;
  } catch (error) {
    console.error('[NotasPat][import] Erro na importação:', error);
    showError('Erro ao importar', error.message);
    pendingText = null;
  }
}

function showError(title, hint) {
  errorText.textContent = title;
  errorHint.textContent = hint || '';
  showState('error');
}
