---
target: popup/popup.html
total_score: 16
max_score: 40
na_heuristics: 
p0_count: 2
p1_count: 2
target_identity: "file:F:\\PYTHON\\Extensão Chrome Notas PAT\\inss-notas-extensao\\popup\\popup.html"
target_fingerprint: "sha256:5cd81f9ba57d97460dc9fde3e0d88ef2fd0862d9a8b618680d3a12e6f57fa513"
target_path: "F:\\PYTHON\\Extensão Chrome Notas PAT\\inss-notas-extensao\\popup\\popup.html"
timestamp: 2026-09-26T18-04-36Z
slug: inss-notas-extensao-popup-popup-html
---
Method: dual-agent (A: design review · B: detector + browser evidence)

Target: `inss-notas-extensao/popup/popup.html` — popup da extensão NotasPat (superfície Operate).
Slug: `inss-notas-extensao-popup-popup-html`

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | `.counter-section` pinta "Erro ao carregar" em verde de marca (`--accent-primary` fixo); toast "Nota reordenada" anuncia sucesso de um no-op |
| 2 | Match System / Real World | 2 | pt-BR e "protocolo" corretos; mas tags com emoji (`🔴 Urgente`), botão "Textos" vs painel "Textos Padrão", stats "Total / Esta Semana" falam métrica de produto, não linguagem de fila |
| 3 | User Control and Freedom | 1 | `btnImport` chama `window.close()` e destrói o contexto; exclusão sem undo; drag-reorder não desfaz; `Substituir` destrói sem segundo confirm |
| 4 | Consistency and Standards | 1 | HTML usa SVG inline, JS gera `📋 ✏️ 🗑️ ⚠️`; empty state estático `"Nota"` vs dinâmico `"📝 Nota"`; `templatesModal` existe no DOM e nunca abre |
| 5 | Error Prevention | 1 | `deleteAllNotes()` roda antes de `importNotes()` — falha na importação e as notas já foram |
| 6 | Recognition Rather Than Recall | 2 | "X de Y" e filtros visíveis ajudam; `searchInput` e `stdTextsSearch` sem `<label>`; `color-dot` são 6 quadrados identificados só por `title` |
| 7 | Flexibility and Efficiency of Use | 2 | Debounce, paginação e Escape existem; falta "Limpar filtros", atalho de busca, e a busca não distingue protocolo de texto |
| 8 | Aesthetic and Minimalist Design | 2 | Banda do contador inteira para 3 palavras; rodapé repete "NotasPat"; `color-stat` com sombra em repouso + pastel fora da nota; emoji na UI |
| 9 | Help Recognize/Diagnose/Recover | 1 | "Erro ao carregar" sem causa, sem retry, e ao lado de "Nenhuma nota salva ainda" — não se sabe se está vazio ou quebrado |
| 10 | Help and Documentation | 2 | Empty state aponta o próximo passo (bom); zero explicação de tag, cor, template vs. texto padrão, ou do que "Substituir" destrói |
| **Total** | | **16/40** | **Poor** (12–19) |

A soma das linhas da tabela é 16 (a avaliação bruta reportou 17; aritmética corrigida). Nenhuma heurística marcada `n/a`; máximo aplicável **40**.

## Design Specificity Verdict

**LLM assessment.** A vizinha honesta não conseguiria copiar este popup inteiro, mas copiaria 90% da composição sem pedir licença. O que é inegavelmente NotasPat — o número de protocolo em Bricolage verde, o corpo de papel pastel com a dobra (`note-text::after`), o vocabulário `urgente/pendência/lembrete/concluído` — vive quase todo dentro do cartão de nota. A casca em volta (header com degradê, cartões de estatística, busca, três selects em fila, grade de três botões, rodapé com versão) é o chrome padrão de extensão/painel SaaS: rebrandável.

O `color-stat` com os seis pastéis como chips de contagem e o `stat-card` "Total / Esta Semana" são o auge do intercambiável — paleta de labels de app de notas e métrica de retenção, não de serventia. O DESIGN.md promete "O Caderno do Protocolo" e "densidade de formulário público". O popup entrega densidade, mas não caderno: nada aqui responde "onde eu parei na fila". Os pastéis vazam para fora da nota (violando a Pastel Is Paper Rule) e o JS enfia emoji onde o sistema proíbe. Há caráter de produto no DNA, mas está afogado em template.

**Deterministic scan.** O CLI retornou 1 achado (`gpt-thin-border-wide-shadow`, advisory), exit 0. Isto não é uma varredura limpa — é suprimida: `.impeccable/config.json` tem `low-contrast` e `tiny-text` ignorados para este arquivo exato, com razão registrada de identidade corporativa do INSS já confirmada. O detector do navegador não carrega `ignoreValues`, e foi lá que os dois reapareceram.

| Regra | CLI | Navegador | Onde |
|---|---|---|---|
| `low-contrast` 2.2:1 (mín. 4.5:1) `#a4aabc` sobre `#f5f7fa` | suprimido | 2 nós | `.empty-state` / `.empty-state-icon` e `.stat-label` |
| `tiny-text` 11.5px | suprimido | 1 nó | `span.subtitle` |
| `tiny-text` 11px | suprimido | 2 nós | `div.stat-label` e `option` dos três `<select>` |
| `gpt-thin-border-wide-shadow` | 1 (advisory) | 2 nós | `.templates-list` (encaixe literal) e `.modal-content` |

Falsos positivos: `gpt-thin-border-wide-shadow` em `.modal-content` (a "hairline" é anel `box-shadow: 0 0 0 1px`, não `border`). Popup de extensão é largura fixa por natureza.

**Visual overlays.** Injeção bem-sucedida: preflight de mutação passou, `detect.js` carregou e rodou, 4 etiquetas pintadas na página. Captura em `.impeccable/critique-b-popup.png`. Aba fechada e servidor parado — não há aba viva.

## Overall Impression

O produto tem um dos melhores componentes-assinatura em extensão de navegador — o papel com a dobra é o material certo. Mas a casca ao redor trabalha contra ele: template de SaaS genérico, emoji de chat, métrica de dono de produto e dois erros de confiança que atacam a promessa central ("nunca perder notas"). Maior oportunidade: fazer o popup responder "o que preciso retomar agora?" e não deixar nenhuma ação destrutiva acontecer sem que o usuário veja o que será perdido.

## What's Working

1. O papel com a dobra (`note-text` + `::after` em `--nota-dobra`) — material distinto do chrome, tinta legível, `inset` simulando luz no topo. Não mexer.
2. O empty state dá o próximo passo — ancora a ação no portal, alinhado com "Contexto onde a tarefa é lida".
3. O aviso de volume (`storageWarning`) é honesto, específico, com dismiss.

## Priority Issues

### [P0] "Substituir" apaga tudo com um clique — e o guardião do popup é código morto
Why: restrição dura "nunca perder notas". `doImport(true)` em `import/import.js` chama `deleteAllNotes()` antes de `importNotes()`. O `importModal` do `popup.html` (copy "Mesclar mantém suas notas atuais. Substituir apaga todas…") nunca abre — `btnImport` vai para `import.html` e fecha o popup; `fileInput` nunca dispara. `window.close()` arranca a servidora do contexto.
Fix: só apagar depois de importação gravada com sucesso; segunda confirmação explícita (digitar `SUBSTITUIR`); religar ou remover o `importModal` morto; parar de chamar `window.close()`.
Command: `/impeccable harden`

### [P0] "Nota reordenada" é uma mentira com toast de sucesso
Why: `handleDrop` só faz `insertBefore` no DOM e mostra `showToast('Nota reordenada', 'success')`. Nada é persistido; `sortNotes()` reordena no próximo render.
Fix: remover o drag até existir ordem manual persistida, ou persistir `order` por nota e desativar o drag quando `filterOrder !== 'manual'`. Nunca toast de sucesso para no-op.
Command: `/impeccable harden`

### [P1] Emoji como interface — violação direta do DESIGN.md
Why: DESIGN.md proíbe emoji como interface. Ainda assim: `📋 ✏️ 🗑️` em `createNoteItem`, `⚠️`/`🗑️` no confirm, `📋` em templates, `🔴 Urgente` em `getTagLabel`, `"📝 Nota"` no empty state dinâmico, `content.js` com `button.innerHTML = '📝 <span>Nota</span>'`. Leitor de tela anuncia "clipboard emoji".
Fix: trocar por SVG inline `stroke: currentColor` (vocabulário já existe no HTML); tags só por chip + texto; empty state volta a `"Nota"`.
Command: `/impeccable polish`

### [P1] Estado de erro visualmente idêntico a status — e contraditório com o vazio
Why: `.counter-section` é sempre `color: var(--accent-primary)`. "Erro ao carregar" aparece em verde de marca ao lado de "Nenhuma nota salva ainda". Detector reforça: texto de orientação a 2.2:1 de contraste, o pior caso da tela.
Fix: token de erro (`--error-ink`) para falha de carga; estados mutuamente exclusivos (erro ≠ vazio ≠ filtrado vazio); "Tentar novamente"; contraste do texto de orientação acima de 4.5:1.
Command: `/impeccable clarify`

### [P2] Casca genérica + métricas que não servem a Patrícia
Why: "Total / Esta Semana" é métrica de dono de produto. `color-stat` usa os seis pastéis fora da nota (viola Pastel Is Paper) com `box-shadow` em repouso (viola Flat-By-Default) e `scale(1.15)` no hover. Rodapé repete "NotasPat". `filterOrder` agrupado com filtros. `note-btn` a `opacity: 0.45`.
Fix (composição preservada, conforme decisão do usuário): remover pastel e sombra em repouso do `color-stat`, remover o wiggle de hover, subir opacidade das ações da nota, remover duplicação do rodapé, separar "Ordenar" dos filtros.
Command: `/impeccable distill`

## Persona Red Flags

**Patrícia, servidora do INSS** — `stat-card` "0 / ESTA SEMANA" não a ajuda a retomar atendimento; Importar fecha o popup; botão do confirm se chama "Confirmar" e não "Excluir nota".

**Riley, Deliberate Stress Tester** — drag → toast → filtrar → ordem perdida; `templatesModal` existe e nenhum caminho o abre; "Substituir" com arquivo corrompido já apagou tudo.

**Sam, Accessibility-Dependent** — `searchInput` e `stdTextsSearch` sem `<label>`; `note-btn` com emoji e sem `aria-label`; modais sem `role="dialog"`/`aria-modal`/focus trap; `.empty-state small` a 11px `opacity: 0.7` sobre `#A4AABC`.

## Minor Observations

- `title="Textos Padrao"` sem acento; toasts: `"Titulo e obrigatorio"`, `"Texto excluido"`, `"texto padrao"`.
- Empty state estático `"Nota"` vs dinâmico `"📝 Nota"`.
- `renderSavedTemplates` usa `--nota-bg: #f5f5f5` e classe `note-protocolo` para nome de template — viola Protocol Number Rule e Two Materials Rule.
- `brand-icon` com `backdrop-filter: blur(4px)` — único blur decorativo do sistema.
- Contador e "Estatísticas" em verde de marca competem com a voz de ação (One Voice Rule).
- `PAGE_SIZE = 50` em `.notes-list { max-height: 280px }` — rolamento interno pesado em popup de 380px.
- Sem indicador de filtro ativo além dos selects; sem "Limpar filtros".
- `gpt-thin-border-wide-shadow` em `.templates-list` resolve-se escolhendo borda definida ou elevação suave.

## Questions to Consider

1. Se o popup sumisse e as notas vivessem só na injeção da tabela do PAT, o que a Patrícia perderia?
2. Por que "Total / Esta Semana" existe? Se fosse "3 protocolos com lembrete amanhã", ela agiria diferente?
3. O que faria a lista parecer papéis sobre a mesa em vez de linhas de CRUD — e isso ajudaria a escanear sob pressão?
