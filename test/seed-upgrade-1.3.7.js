/**
 * Semeia dados no formato da v1.3.7 (ANTES da sincronizacao) para o teste
 * de atualizacao real.
 * ---------------------------------------------------------------
 * NAO faz parte do build. Nao entra no ZIP de release.
 *
 * ONDE COLAR: console do POPUP da extensao NA VERSAO 1.3.7 (main),
 * carregada como unpacked. NAO cole isto com a v1.4.0 carregada - o
 * script se recusa a rodar nesse caso (ver guarda abaixo).
 *
 * O QUE FAZ:
 *   1. Limpa sync + local (chrome.storage.sync.clear/local.clear)
 *   2. Grava 150 notas com protocolos fixos '9000000000' + i (i de 0 a 149),
 *      SEM padding real: String(i).padStart(2, '0') so garante 2 digitos
 *      minimos, entao i=0..99 rende protocolos de 12 digitos
 *      (900000000000-900000000099) mas i=100..149 rende protocolos de 13
 *      digitos (9000000000100-9000000000149), ja que padStart nao trunca.
 *      Isso NAO FOI CORRIGIDO de proposito: o codigo de producao nao limita
 *      quantidade de digitos, entao um seed com protocolos de tamanhos
 *      MISTOS (12 e 13) e um teste ainda melhor do que um so tamanho fixo -
 *      confirmado na pratica: os 50 protocolos de 13 digitos sobreviveram
 *      migracao, exportacao e importacao intactos.
 *      Gravado diretamente no formato local (como a 1.3.7 gravaria de verdade)
 *   3. A primeira delas (900000000000) recebe um lembrete 24h a frente
 *   4. Grava um texto padrao 'A' DIRETO NO SYNC (id fixo texto_a_seed),
 *      simulando um segundo computador que ja teria atualizado e subido
 *      o proprio texto - e exatamente o cenario que o merge de textos
 *      padrao (D4/D6) precisa tratar sem perder nada
 *
 * DEPOIS DE RODAR ESTE SCRIPT, faca manualmente (nao da para automatizar
 * no popup real): abra a pagina de Textos Padrao e crie um texto com
 * titulo EXATO "Texto B - criado na 1.3.7" e qualquer conteudo com pelo
 * menos 30 caracteres. Esse e o texto B que o script de verificacao
 * espera encontrar.
 */
(async function () {
  if (typeof checkQuotaBeforeWrite === 'function') {
    console.error('[NotasPat][SEED] PARE - isto parece ser a v1.4.0 (tem checkQuotaBeforeWrite), nao a 1.3.7.');
    console.error('[NotasPat][SEED] Confirme que fez git checkout main e recarregou a extensao ANTES de colar isto.');
    return;
  }
  if (typeof saveNote !== 'function') {
    console.error('[NotasPat][SEED] PARE - saveNote nao existe neste console. Cole no console do POPUP (botao direito no icone > Inspecionar popup).');
    return;
  }

  // Guarda de dados reais: mesmo raciocinio de manual-harness.js. Este
  // script tambem apaga TUDO antes de semear - se o perfil ja tiver notas
  // reais (protocolo 5+ digitos numericos) ou textos padrao reais, para
  // em vez de apagar. So imprime, nao restaura sozinho - o backup fica a
  // cargo de quem roda, avisado aqui.
  const antesDoSeed = await new Promise(r => chrome.storage.local.get(null, r));
  const suspeitosLocal = Object.keys(antesDoSeed).filter(k => k.startsWith('note_') && /^\d{5,}$/.test(k.substring(5)));
  const textosReais = Array.isArray(antesDoSeed.standard_texts) && antesDoSeed.standard_texts.length > 0;
  if (suspeitosLocal.length > 0 || textosReais) {
    console.error('[NotasPat][SEED] PARE - este perfil parece ter dados REAIS em local. NADA foi alterado.');
    if (suspeitosLocal.length > 0) console.error('[NotasPat][SEED]   notas suspeitas: ' + suspeitosLocal.join(', '));
    if (textosReais) console.error('[NotasPat][SEED]   textos padrao: ' + antesDoSeed.standard_texts.map(t => JSON.stringify(t.title)).join(', '));
    console.error('[NotasPat][SEED] Faca backup manual (exportar pelo popup) antes de rodar este script num perfil com dados reais.');
    return;
  }

  console.log('[NotasPat][SEED] Limpando storage...');
  await new Promise(r => chrome.storage.sync.clear(r));
  await new Promise(r => chrome.storage.local.clear(r));

  console.log('[NotasPat][SEED] Gravando 150 notas (protocolos 900000000000-900000000149)...');
  const notas = {};
  for (let i = 0; i < 150; i++) {
    const protocolo = '9000000000' + String(i).padStart(2, '0');
    notas['note_' + protocolo] = {
      id: protocolo,
      text: 'Nota de teste do upgrade #' + i,
      color: '#fff8c6',
      tags: i % 3 === 0 ? ['teste-upgrade'] : [],
      reminder: i === 0 ? new Date(Date.now() + 86400000).toISOString() : null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: new Date(2026, 0, i + 1).toISOString()
    };
  }
  await new Promise(r => chrome.storage.local.set(notas, r));

  console.log('[NotasPat][SEED] Gravando texto padrao A direto no sync (simula 2o PC ja atualizado)...');
  await new Promise(r => chrome.storage.sync.set({
    standard_texts: [{
      id: 'texto_a_seed',
      title: 'Texto A - ja estava no sync (2o PC)',
      text: 'x'.repeat(50),
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z'
    }]
  }, r));

  const confereLocal = await new Promise(r => chrome.storage.local.get(null, r));
  const qtdNotas = Object.keys(confereLocal).filter(k => k.startsWith('note_')).length;
  console.log('[NotasPat][SEED] ===== FEITO: ' + qtdNotas + ' notas em local, texto A no sync =====');
  console.log('[NotasPat][SEED] PROXIMO PASSO MANUAL: abra Textos Padrao e crie um texto com o titulo EXATO:');
  console.log('[NotasPat][SEED]   "Texto B - criado na 1.3.7"');
  console.log('[NotasPat][SEED] (qualquer conteudo com 30+ caracteres). So entao faca o git checkout de volta.');
})();
