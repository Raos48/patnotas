# Analise de Arquitetura - NotasPat

## Componentes e Fluxo de Dados

```
┌─────────────────────────────────────────────────────────────────┐
│                    chrome.storage.local                         │
│              { notes: { "12345": {...}, ... } }                 │
└──────────┬──────────────────┬────────────────────┬──────────────┘
           │                  │                    │
     ┌─────▼──────┐   ┌──────▼───────┐    ┌──────▼──────────┐
     │ storage.js  │   │ background.js│    │  (change event) │
     │ (CRUD API)  │   │ (service wkr)│    │                 │
     └─────┬───┬───┘   └──────┬───────┘    └─────────────────┘
           │   │              │
     ┌─────▼───┘        ┌────▼──────────┐
     │                   │ - Badge count │
┌────▼─────┐  ┌────▼────┐│ - Alarmes     │
│content.js│  │popup.js ││ - Notificacoes│
│(DOM site)│  │(popup)  │└───────────────┘
└──────────┘  └─────────┘
```

### Passo a passo

1. **Inicializacao** (`content.js:913`): Carrega TODAS as notas para `notasCache` via `getAllNotes()`, depois varre as tabelas do site do INSS.
2. **Armazenamento** (`storage.js:52-78`): Cada operacao de escrita faz `getAllNotes()` -> modifica o objeto inteiro -> `chrome.storage.local.set()` com o objeto completo de volta. Padrao read-modify-write total.
3. **Injecao no DOM** (`content.js:723-756`): Para cada linha de tabela com protocolo valido, injeta um botao "Nota" ou o sticky note completo.
4. **MutationObserver** (`content.js:779-827`): Observa `document.body` inteiro com `subtree: true`, disparando `scanAllTables()` a cada mutacao relevante (debounce 150ms).
5. **Background** (`background.js:74-98`): A cada mudanca no storage, limpa TODOS os alarmes (`clearAll`) e recria um alarme individual para cada nota com lembrete.
6. **Popup** (`popup.js:378-421`): Renderiza todas as notas filtradas como HTML via `innerHTML` de uma vez, com event listeners individuais.

---

## Avaliacao de Impacto: Volume Grande de Notas

### Cenarios simulados

| Qtd. Notas | Tamanho estimado em storage | Impacto |
|---|---|---|
| 100 | ~50 KB | Nenhum problema |
| 500 | ~250 KB | Leve lentidao em escritas |
| 1.000 | ~500 KB | Problemas perceptiveis |
| 5.000 | ~2.5 MB | Degradacao seria |
| 10.000+ | ~5 MB+ | Proximo do limite de 10 MB |

### Problemas Identificados (por severidade)

#### CRITICO - Escrita completa a cada operacao

Em `storage.js:54-71`, cada `saveNote`, `updateNoteColor`, `updateNoteTags` e `deleteNote`:
1. Le todas as notas do storage
2. Modifica uma unica nota
3. Reescreve todas as notas de volta

Com 5.000 notas, cada salvamento serializa/desserializa ~2.5 MB de JSON. Isso e O(N) para cada operacao unitaria.

#### CRITICO - Recriacao total de alarmes

Em `background.js:74-98`, `setupReminders()` e chamado a cada mudanca no storage (`background.js:164-171`):
- Faz `clearAll()` destruindo todos os alarmes
- Itera todas as notas recriando alarmes
- Chrome tem limite de ~500 alarmes simultaneos

#### ALTO - Popup renderiza tudo de uma vez

Em `popup.js:397`, `renderNotes()` gera todo o HTML como string e injeta via `innerHTML`. Com 2.000 notas, isso gera milhares de nos DOM + event listeners individuais para edit/delete/copy + drag-and-drop em cada item.

#### ALTO - Busca sem debounce no Popup

Em `popup.js:167`, o `searchInput` dispara `renderNotes()` a cada keystroke, sem debounce. Com muitas notas, isso causa re-render completo a cada tecla digitada.

#### MEDIO - MutationObserver no body inteiro

Em `content.js:821-823`, o observer escuta `document.body` com `subtree: true`. Qualquer mudanca no DOM do site (nao apenas nas tabelas) pode disparar callbacks.

#### BAIXO - Cache em memoria sem limite

`notasCache` no content script e `notasData` no popup carregam tudo para a memoria. Nao ha paginacao, arquivamento ou limpeza.

---

## Veredicto

Sim, e um problema significativo, mas proporcional ao uso esperado. Um servidor do INSS que lida com centenas de protocolos por mes pode acumular milhares de notas em 1-2 anos. A degradacao seria gradual e perceptivel a partir de ~500-1.000 notas.

O problema mais grave e o padrao de escrita total no storage - cada edicao de uma nota reescreve todas as outras. Isso nao escala.

---

## Checklist de Implementacao

### 1. Storage granular (IMPLEMENTADO)

Cada nota armazenada individualmente com prefixo `note_<protocolo>` em vez de um unico objeto `notes`.

- [x] `getAllNotes()` usa `chrome.storage.local.get(null)` e filtra por prefixo `note_`
- [x] `getNote()` le apenas `chrome.storage.local.get(["note_" + protocolo])`
- [x] `saveNote()` le/grava apenas a chave individual `note_<protocolo>`
- [x] `deleteNote()` usa `chrome.storage.local.remove("note_" + protocolo)`
- [x] `updateNoteColor()` e `updateNoteTags()` fazem leitura/escrita individual
- [x] `setNoteReminder()` faz leitura/escrita individual
- [x] `migrateToGranularStorage()` no `background.js` converte formato antigo para novo
- [x] Migracao executada em `onInstalled` e como safety check a cada startup do service worker
- [x] `exportNotes()` coleta notas do novo formato (via `getAllNotes()`)
- [x] `importNotes()` grava cada nota como chave individual
- [x] `background.js` atualizado: badge, alarmes, stats, mensagens usam formato granular
- [x] `onChanged` listener filtra por prefixo `note_` e atualiza alarmes individualmente
- [ ] Testar migracao com dados existentes sem perda

### 2. Debounce na busca do Popup (IMPLEMENTADO)

- [x] Criar funcao utilitaria `debounce(fn, delay)` em `popup.js`
- [x] Aplicar debounce de 300ms ao listener do `searchInput`
- [x] Aplicar debounce de 150ms aos filtros `filterOrder`, `filterColor`, `filterTag`
- [ ] Testar que a busca continua responsiva mas sem re-renders excessivos

### 3. Paginacao no Popup (IMPLEMENTADO)

- [x] Definir constante `PAGE_SIZE = 50`
- [x] Adicionar variavel de estado `displayedCount` em `popup.js`
- [x] Modificar `renderNotes()` para renderizar apenas `displayedCount` notas por vez
- [x] Adicionar botao "Carregar mais" no final da lista com contagem de restantes
- [x] Estilizar botao `.btn-load-more` em `popup.css`
- [x] Resetar `displayedCount` quando filtros ou busca mudam (via `resetAndRender()`)
- [ ] Testar com volume grande de notas

### 4. Alarmes inteligentes (IMPLEMENTADO)

- [x] Manter `setupReminders()` com `clearAll()` apenas para o evento `onInstalled` (inicializacao completa)
- [x] No listener `chrome.storage.onChanged`, substituir `setupReminders()` por `handleRemindersChanged(change)`
- [x] Comparar `oldValue` vs `newValue` para identificar apenas as notas que mudaram
- [x] Para nota adicionada/alterada: criar ou atualizar apenas o alarme dessa nota
- [x] Para nota removida: limpar apenas o alarme dessa nota
- [ ] Testar que lembretes continuam funcionando corretamente apos a mudanca

### 5. Arquivamento automatico (MEDIO)

- [ ] Criar chave de storage separada `notes_archive` (ou prefixo `archived_note_`)
- [ ] Criar funcao `archiveOldNotes(daysThreshold)` que move notas com tag "concluido" mais antigas que X dias
- [ ] Adicionar botao "Arquivar concluidos" no popup
- [ ] Criar secao "Arquivo" no popup para visualizar notas arquivadas
- [ ] Permitir restaurar notas do arquivo
- [ ] Executar verificacao periodica via alarme no background (ex: 1x por dia)
- [ ] Excluir notas arquivadas da contagem do badge e das estatisticas ativas

### 6. MutationObserver otimizado (IMPLEMENTADO)

- [x] Remover o observer generico de `document.body` com `subtree: true`
- [x] Manter observer em `#tarefas-container` como primeira opcao (retorna imediatamente se encontrar)
- [x] Fallback: observar pais diretos das tabelas-alvo se `#tarefas-container` nao existir
- [x] Fallback final: observar `document.body` apenas com `childList: true` (sem subtree)
- [x] Filtrar mutacoes: ignorar elementos criados pela extensao (`.inss-nota-*`, `.inss-widget`, etc.)
- [ ] Testar que a extensao continua detectando novas linhas em todas as tabelas

### 7. Otimizacao de memoria do cache (BAIXO)

- [ ] No content script, carregar para `notasCache` apenas as notas dos protocolos visiveis na pagina atual
- [ ] Implementar lazy loading: ao encontrar um protocolo na tabela, verificar cache primeiro, depois storage individual
- [ ] No popup, manter `notasData` mas implementar paginacao (item 3) para limitar o DOM
- [ ] Considerar LRU cache com limite maximo (ex: 200 notas em memoria)

### 8. Alerta de volume de notas (IMPLEMENTADO)

- [x] Criar funcao `checkStorageHealth()` em `storage.js` que retorna alerta quando >= 500 notas
- [x] Adicionar banner visual no `popup.html` (acima das estatisticas)
- [x] Estilizar banner com cores de warning e animacao em `popup.css`
- [x] Integrar verificacao no `popup.js`: ao carregar notas, apos salvar e apos importar
- [x] Adicionar botao de fechar (dismiss) no banner
- [x] Integrar toast de alerta no `content.js` ao salvar nota no site

---

## Ordem de Implementacao Recomendada

| Prioridade | Item | Esforco | Impacto |
|---|---|---|---|
| 1 | Debounce na busca | Baixo | Alto |
| 2 | Alarmes inteligentes | Medio | Critico |
| 3 | Storage granular | Alto | Critico |
| 4 | Paginacao no Popup | Medio | Alto |
| 5 | MutationObserver otimizado | Baixo | Medio |
| 6 | Arquivamento automatico | Alto | Medio |
| 7 | Otimizacao de memoria | Medio | Baixo |

> A ordem prioriza quick wins primeiro (debounce) e depois segue pela relacao impacto/esforco.
> O storage granular e o mais impactante mas tambem o mais trabalhoso, por isso vem apos os alarmes inteligentes que sao mais simples de implementar.
