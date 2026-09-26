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
const replaceConfirmWrap = document.getElementById('replaceConfirmWrap');
const replaceConfirmInput = document.getElementById('replaceConfirmInput');

// Texto que a usuária digita para liberar a via destrutiva.
const REPLACE_CONFIRM_PHRASE = 'SUBSTITUIR';

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
  btnReplace.addEventListener('click', () => {
    // Guarda de via destrutiva: só avança se a frase foi digitada.
    // Nunca deixar a destruição a um clique de distância.
    if (!replaceConfirmReady()) {
      replaceConfirmInput?.focus();
      return;
    }
    doImport(true);
  });
  btnModeCancel.addEventListener('click', () => {
    pendingText = null;
    resetReplaceConfirm();
    showState('select');
  });

  replaceConfirmInput?.addEventListener('input', syncReplaceConfirm);

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
  if (state !== 'mode') resetReplaceConfirm();
}

// ============ GUARDA DA VIA DESTRUTIVA ============

function replaceConfirmReady() {
  return (replaceConfirmInput?.value || '').trim().toUpperCase() === REPLACE_CONFIRM_PHRASE;
}

function syncReplaceConfirm() {
  if (!btnReplace) return;
  const ready = replaceConfirmReady();
  btnReplace.disabled = !ready;
  btnReplace.classList.toggle('is-armed', ready);
  if (replaceConfirmWrap) {
    replaceConfirmWrap.classList.toggle('is-invalid', !ready && (replaceConfirmInput?.value || '').length > 0);
  }
}

function resetReplaceConfirm() {
  if (replaceConfirmInput) replaceConfirmInput.value = '';
  if (btnReplace) {
    btnReplace.disabled = true;
    btnReplace.classList.remove('is-armed');
  }
  if (replaceConfirmWrap) replaceConfirmWrap.classList.remove('is-invalid');
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
    resetReplaceConfirm();
    showState('mode');
  } else {
    // Importar direto
    await doImport(false);
  }
}

/**
 * Importa o arquivo pendente.
 *
 * ORDEM SEGURA (restrição dura do produto: nunca perder notas existentes):
 * o arquivo é gravado PRIMEIRO. As notas antigas só saem depois que a
 * gravação foi confirmada. Se a importação falhar no meio, a usuária
 * continua com tudo o que já tinha — nunca há um instante em que as notas
 * antigas já foram e as novas ainda não chegaram.
 */
async function doImport(replace) {
  if (!pendingText) return;

  showState('loading');
  console.log('[NotasPat][import] Importando... modo:', replace ? 'substituir' : 'mesclar');

  // Só o modo "substituir" precisa saber o que já existia, para limpar o
  // que sobrou depois. Listar antes de escrever, nunca apagar antes.
  let anteriores = [];
  if (replace) {
    try {
      anteriores = Object.keys(await getAllNotes());
    } catch (error) {
      console.warn('[NotasPat][import] Não foi possível listar as notas atuais:', error);
    }
  }

  let result;
  try {
    result = await importNotes(pendingText);
  } catch (error) {
    // importNotes só rejeita ANTES de gravar (JSON inválido / formato) ou
    // DEPOIS de gravar tudo (cota: parte ficou só neste computador, e o
    // erro vem com .imported). No segundo caso nada foi perdido.
    if (error && error.code === 'QUOTA_EXCEEDED' && error.imported) {
      result = error.imported;
      console.warn('[NotasPat][import] Importado com aviso de cota:', error.message);
    } else {
      console.error('[NotasPat][import] Erro na importação:', error);
      showError('Erro ao importar', (error && error.message) || 'Suas notas atuais não foram alteradas.');
      pendingText = null;
      return;
    }
  }

  const importadas = new Set(Object.keys(result || {}));

  // Só agora, com o arquivo gravado, é que o que sobrou do modo "substituir"
  // pode sair. Uma remoção só (removeFromBothAreas), não uma por nota.
  if (replace && anteriores.length > 0) {
    const sobraram = anteriores.filter(p => !importadas.has(p));
    if (sobraram.length > 0) {
      try {
        await removeFromBothAreas(sobraram.map(p => NOTE_PREFIX + p));
        console.log('[NotasPat][import] Notas antigas removidas após a gravação:', sobraram.length);
      } catch (error) {
        // A importação valeu; a limpeza é que falhou. Não é perda de dado.
        console.error('[NotasPat][import] Falha ao remover notas antigas:', error);
        showError(
          'Importado, mas com sobras',
          `As novas notas foram salvas. ${sobraram.length} nota(s) antiga(s) não puderam ser removidas — exclua manualmente se quiser.`
        );
        pendingText = null;
        return;
      }
    }
  }

  const count = importadas.size;
  console.log('[NotasPat][import] Importação concluída:', count, 'notas');

  successText.textContent = replace
    ? `${count} nota${count !== 1 ? 's' : ''} importada${count !== 1 ? 's' : ''} (substituição).`
    : `${count} nota${count !== 1 ? 's' : ''} importada${count !== 1 ? 's' : ''} (mesclagem).`;
  showState('success');
  pendingText = null;
}

function showError(title, hint) {
  errorText.textContent = title;
  errorHint.textContent = hint || '';
  showState('error');
}
