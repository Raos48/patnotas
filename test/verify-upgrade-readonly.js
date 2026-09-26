/**
 * Verificacao SOMENTE LEITURA do teste de atualizacao real 1.3.7 -> 1.4.0
 * ---------------------------------------------------------------
 * NAO faz parte do build. Nao entra no ZIP de release.
 * NAO ALTERA NADA no storage - so le e reporta. Seguro rodar quantas
 * vezes quiser, mesmo com dados reais.
 *
 * Combina com test/seed-upgrade-1.3.7.js: espera os protocolos fixos
 * 90000000000-90000000149, o texto A com id 'texto_a_seed' e o texto B
 * com o titulo exato "Texto B - criado na 1.3.7".
 *
 * ONDE COLAR: console do SERVICE WORKER, DEPOIS de completar os passos
 * do teste de atualizacao (ver mensagem que acompanha este arquivo).
 *   chrome://extensions/ > card do NotasPat > "service worker"
 *
 * O que confere:
 *   - snapshot pre-migracao (premigracao_1_4_0) existe e bate campo a
 *     campo com o estado atual das notas (prova que a migracao nao
 *     alterou nenhum dado, so mudou de lugar)
 *   - as 150 notas (protocolos fixos) estao TODAS no sync, nenhuma
 *     sobrou em local
 *   - os dois textos padrao (id texto_a_seed e titulo "Texto B...")
 *     estao no sync, nenhum se perdeu
 *   - as duas flags de execucao unica estao marcadas
 *   - o alarme reminder_90000000000 (lembrete da nota #0) existe
 *   - NENHUMA notificacao de "nao couberam" deveria ter aparecido
 *     (isso voce confirma visualmente, o script nao ve notificacoes)
 */
(function () {
  const linha = (ok, msg) => console.log(`[NotasPat][UPGRADE] ${ok ? 'OK  ' : 'FALHA'} ${msg}`);
  let falhas = 0;
  const checar = (ok, msg) => { linha(ok, msg); if (!ok) falhas++; };

  const PROTOCOLO_COM_LEMBRETE = '90000000000';
  const TITULO_TEXTO_B = 'Texto B - criado na 1.3.7';

  console.log('[NotasPat][UPGRADE] ===== VERIFICACAO READ-ONLY DO UPGRADE 1.3.7 -> 1.4.0 =====');

  chrome.storage.local.get(null, (local) => {
    chrome.storage.sync.get(null, (sync) => {
      // --- Flags de execucao unica ---
      checar(local.premigracao_1_4_0_criado === true, 'flag premigracao_1_4_0_criado presente');
      checar(local.textosPadraoMigrados1_4_0 === true, 'flag textosPadraoMigrados1_4_0 presente');

      // --- Snapshot pre-migracao ---
      const snap = local.premigracao_1_4_0;
      checar(!!snap, 'snapshot premigracao_1_4_0 existe');
      if (snap) {
        const chavesSnap = Object.keys(snap.notas || {});
        checar(chavesSnap.length === 150, `snapshot guarda 150 notas (achou ${chavesSnap.length})`);
        checar(!!snap.notas['note_' + PROTOCOLO_COM_LEMBRETE], 'snapshot inclui a nota do lembrete (note_' + PROTOCOLO_COM_LEMBRETE + ')');

        // Cada nota do snapshot bate campo a campo com o estado atual
        // (sync ou local, o que existir) - prova que a migracao so MOVEU
        // dado, nunca alterou. Comparacao por JSON de chaves ordenadas
        // evita falso-negativo por ordem de propriedades diferente.
        const ordenar = obj => JSON.stringify(obj, Object.keys(obj).sort());
        let notasDiferentes = [];
        chavesSnap.forEach(chave => {
          const doSnapshot = snap.notas[chave];
          const atual = sync[chave] || local[chave];
          if (!atual) { notasDiferentes.push(chave + ' (sumiu)'); return; }
          if (ordenar(doSnapshot) !== ordenar(atual)) notasDiferentes.push(chave);
        });
        checar(notasDiferentes.length === 0,
          `todas as ${chavesSnap.length} notas do snapshot batem com o estado atual` +
          (notasDiferentes.length ? ` (diferentes: ${notasDiferentes.slice(0, 5).join(', ')}${notasDiferentes.length > 5 ? '...' : ''})` : ''));
      }

      // --- As 150 notas (protocolos fixos) estao no sync, nenhuma sobrou em local ---
      const notasSync = Object.keys(sync).filter(k => k.startsWith('note_90000000'));
      const notasLocal = Object.keys(local).filter(k => k.startsWith('note_90000000'));
      checar(notasSync.length === 150, `sync tem as 150 notas semeadas (achou ${notasSync.length})`);
      checar(notasLocal.length === 0, `local nao tem nenhuma das notas semeadas sobrando (achou ${notasLocal.length})`);

      // --- Textos padrao: A (id fixo, semeado direto no sync) e B (titulo fixo, criado pela UI) ---
      const textos = Array.isArray(sync.standard_texts) ? sync.standard_texts : [];
      const temTextoA = textos.some(t => t.id === 'texto_a_seed');
      const temTextoB = textos.some(t => t.title === TITULO_TEXTO_B);
      checar(temTextoA, 'texto A (id texto_a_seed) esta no sync');
      checar(temTextoB, `texto B (titulo "${TITULO_TEXTO_B}") esta no sync`);
      if (!temTextoA || !temTextoB) {
        console.log('[NotasPat][UPGRADE] Titulos encontrados no sync: ' + textos.map(t => JSON.stringify(t.title)).join(', '));
      }
      checar(!local.standard_texts || (Array.isArray(local.standard_texts) && local.standard_texts.length === 0),
        'local nao tem standard_texts sobrando');

      // --- Alarme do lembrete de teste (nota #0) ---
      chrome.alarms.getAll((alarmes) => {
        const nomeAlarme = 'reminder_' + PROTOCOLO_COM_LEMBRETE;
        checar(alarmes.some(a => a.name === nomeAlarme), `alarme ${nomeAlarme} existe`);

        console.log('[NotasPat][UPGRADE] ===== FIM: ' + (falhas === 0 ? 'TUDO OK' : falhas + ' FALHA(S)') + ' =====');
        if (falhas > 0) {
          console.error('[NotasPat][UPGRADE] *** HA FALHAS ACIMA - NAO prossiga para o teste de 2 computadores sem investigar ***');
        }
        console.log('[NotasPat][UPGRADE] Lembrete manual: confirme visualmente que NENHUMA notificacao');
        console.log('[NotasPat][UPGRADE] "X notas nao couberam" apareceu durante o carregamento da extensao.');
      });
    });
  });
})();
