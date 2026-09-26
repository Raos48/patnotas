# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Servidor do INSS na fila de tarefas do Portal de Atendimento (PAT), `https://atendimento.inss.gov.br/`. Processa várias tarefas por dia, cada uma identificada por um número de protocolo, e precisa reter o contexto de cada processo entre atendimentos e entre dias.

O canal de distribuição é a Chrome Web Store e a Firefox AMO (extensão pública, autor Ricardo Alves), então outros servidores do INSS formam o público real — não é ferramenta de uso pessoal restrito.

## Product Purpose

A NotasPat fixa notas adesivas nas tarefas do PAT, ancoradas ao número de protocolo. Cada nota guarda texto, cor, tags, templates e lembrete: um caderno de pendências por processo, que também acompanha o profissional entre computadores.

Sucesso é o servidor nunca perder a memória de uma tarefa e nunca precisar sair do portal para consultá-la.

## Positioning

Mecanismos que um produto vizinho não poderia copiar com honestidade, combinados:

1. **Nota dentro da fila do PAT** — a observação aparece na própria linha do protocolo, onde a tarefa é lida. Nada de trocar de tela ou de sistema.
2. **Caderno por protocolo** — texto, cor, tag, template e lembrete num único registro por processo.
3. **Notas seguem o servidor** — sincronização entre computadores via `chrome.storage.sync` (v1.4.0), com fallback local quando a cota não alcança.

## Operating Context

- Ferramenta usada **durante o trabalho real de atendimento**, em sessões curtas e interrompidas, com pressão de fila. Não é um app que se abre para "organizar a vida" — é memória auxiliar no meio da tarefa.
- Superfícies: tabela de tarefas do portal (injeção DOM), popup da extensão, páginas de textos padrão e de importação.
- Ritual de release: bump de versão nos dois manifests, ZIP do conteúdo da pasta (não da pasta), upload nas lojas — ver `GUIA-RELEASE.md` e `GUIA-ATUALIZACAO-CHROMESTORE.md`.
- QA é manual: carregar sem compactação no `chrome://extensions/` e testar no portal. Há harness em `test/` (inclui verificações da v1.4.0) e um snapshot do portal em `ARQUIVOSPAT/` para testar injeção DOM fora do ambiente real.

## Capabilities and Constraints

**Funcionalidades confirmadas:** notas por protocolo com 6 cores; tags (`urgente`, `pendencia`, `lembrete`, `concluido`); templates de texto; textos padrão (CRUD próprio); lembretes com notificações do navegador; busca e filtro com debounce; paginação (50 por página); exportação/importação JSON (notas e textos padrão); modo escuro; atalho `Ctrl+Shift+N`; alerta de volume acima de 500 notas.

**Restrições duras (confirmadas pelo usuário):**
- **Nunca quebrar o site do INSS.** Falha da extensão jamais pode virar falha do atendimento. Nada de interferir no funcionamento, layout ou dados do portal.
- **Nunca perder, apagar ou destruir notas e textos padrão existentes.** Duracidade de dados do usuário é inegociável em qualquer mudança (inclui migrações de storage, sync e refactors de UI que toquem em persistência).

**Restrições técnicas registradas no código:**
- Sem requisições externas, sem analytics, sem servidor próprio. Dados vivem no `chrome.storage.local` e `chrome.storage.sync` do navegador (ver `docs/privacy.html`).
- `chrome.storage.sync` tem cota dura: ~100 KB total, 8 KB por item, 512 chaves. Notas grandes ou volumosas caem para fallback local — nunca podem ser recusadas em silêncio.
- Vanilla JavaScript, sem build system, sem npm/webpack/transpilação.
- Duas builds paralelas: `inss-notas-extensao/` (Chrome, Manifest V3, service worker) e `inss-notas-extensao-firefox/` (Firefox, `browser_specific_settings.gecko`). O CSS é idêntico; a divergência de código é pontual e intencional (manifesto, background e um trecho de `content.js` no Firefox para o editor Draft.js do portal) — sincronizar sem apagar o que é deliberado.
- Prevenção de XSS obrigatória: `textContent` para dado do usuário, nunca `innerHTML`. Logs em console usam o prefixo `[NotasPat]`.
- Protocolos do PAT têm 5+ dígitos (cresceram de 11 para 12) — o regex não pode ter limite superior fixo.
- Storage granular: uma chave `note_<protocolo>` por nota.

## Brand Commitments

- **Nome:** NotasPat - Notas Adesivas para Tarefas.
- **Identidade visual corporativa INSS** (`identidade_visual.txt`, aplicada desde a v1.3.5 e confirmada como compromisso): séria e profissional, inspirada nas cores do INSS mas refinada para interface moderna. Verde `#0B7D3B` (primária), azul `#145FA3` (secundária), amarelo `#F2B73B` (acento), neutros corporativos (`#F5F7FA`, `#FFFFFF`, `#D4D9E2`, `#22252C`, `#5C6473`, `#A4AABC`).
- **Idioma da interface:** pt-BR.
- **Autoria:** Ricardo Alves.

## Evidence on Hand

- `identidade_visual.txt` — paleta, estados de interface e sugestão de uso (fonte da marca).
- `ARQUIVOSPAT/` — snapshot do portal (`atendimento.html`) para testar injeção DOM.
- `test/` — `manual-harness.js`, `verify-1.4.0.js`, `verify-1.4.0-sw.js`, `verify-1.4.0-ui.js`.
- Zips de releases publicadas (v1.2.0 → v1.3.9, Chrome e Firefox) na raiz do repositório.
- `README.md`, `GUIA-RELEASE.md`, `GUIA-ATUALIZACAO-CHROMESTORE.md`, `ANALISE-ARQUITETURA.md`, `docs/privacy.html`.
- Histórico git denso em torno de duracidade de dados: migração local → sync, snapshot de segurança, promoção de notas, reconciliação de alarmes.

**Ausências que trabalho futuro não deve inventar:** sem testemunhos de usuários, sem métricas de uso, sem benchmarks, sem clientes nomeados, sem dados de retenção, sem pricing.

## Product Principles

1. **O portal é sagrado.** Toda decisão de implementação se subordina a "isso pode quebrar o site do INSS?". Em caso de dúvida, a extensão cede.
2. **Nota não se perde.** Migração, sync, refactors e UI nunca podem destruir uma nota ou um texto padrão já salvo. Quando a escolha for entre perder dado e recusar uma ação, recusa-se a ação.
3. **Contexto onde a tarefa é lida.** A informação volta para a linha do protocolo no PAT. Se uma ideia tirar o servidor do portal para consultá-la, ela vai contra o produto.
4. **Uma verdade, duas builds.** Lógica compartilhada é idêntica em Chrome e Firefox; divergência existe só onde o manifesto exige.
5. **Dado do usuário fica com o usuário.** Sem rede, sem telemetria, sem servidor. Storage do navegador é o único destino.
