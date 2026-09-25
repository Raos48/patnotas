# Feature: Sincronização de Notas Entre Computadores

**Date:** 2026-09-16
**Version:** Target 1.4.0
**Status:** Design Approved — revisado (v2), sem decisões pendentes; pronto para plano de implementação
**Related Issue:** Usuários perdem notas ao trocar de computador, mesmo com "repositório local" (não há sincronização real entre máquinas — `chrome.storage.local` é isolado por perfil/dispositivo)

---

## Problem Description

NotasPat armazena todos os dados (`note_<protocolo>`, `standard_texts`, `templates`, `theme`) em `chrome.storage.local`. Esse storage é local ao perfil do Chrome **naquele computador específico** — não é sincronizado entre dispositivos, mesmo quando o usuário está logado com a mesma conta Google em ambos.

Contexto de uso confirmado com o stakeholder:
- ~1000 usuários, a maioria logada no Chrome com conta Google (perfil sincronizado ativo).
- Uso heterogêneo: usuários disciplinados ficam com dezenas de notas; usuários que não limpam a caixa acumulam até 500+ notas (o aviso atual de `checkStorageHealth()` dispara em 500 mas não bloqueia nada).
- Sem apetite para manter backend próprio — soma-se ao fato de que notas podem conter dados de atendimento sensíveis (protocolos do INSS, textos de andamento), então evitar um servidor central também reduz superfície de risco/LGPD.

### Root Cause

`chrome.storage.local` é, por definição da API do Chrome, local ao perfil no dispositivo. Não existe replicação entre máquinas nessa API. O único mecanismo nativo do Chrome para sincronizar dados de extensão entre dispositivos via conta Google é `chrome.storage.sync`, que a extensão nunca usou.

---

## Proposed Solution

### Approach: Migrar para `chrome.storage.sync` com guarda de quota ativa

Trocar o backend de armazenamento de `note_<protocolo>` e `standard_texts` de `chrome.storage.local` para `chrome.storage.sync`. O Chrome cuida da replicação entre dispositivos via conta Google — nenhuma infraestrutura própria é necessária.

`templates` e `theme` **permanecem em `chrome.storage.local`** — são preferências de dispositivo/UI, não dados de trabalho do usuário, e mantê-los locais preserva orçamento de quota para o que importa.

**Por que esta opção e não um backend próprio:** zero servidor para manter, zero risco de vazamento centralizado de dados de atendimento do INSS, mantém a garantia existente do projeto de "no external requests". O trade-off aceito é o limite rígido de `chrome.storage.sync`:

| Limite | Valor |
|---|---|
| `QUOTA_BYTES` (total) | 102.400 bytes (100 KB) |
| `QUOTA_BYTES_PER_ITEM` | 8.192 bytes (8 KB) por chave |
| `MAX_ITEMS` | 512 chaves |
| `MAX_WRITE_OPERATIONS_PER_MINUTE` | 120 |

Como usuários pesados (500 notas) são um padrão real confirmado, esse limite **vai** ser atingido por parte da base — inclusive o de `MAX_ITEMS`, já que 500 notas ficam perto das 512 chaves permitidas. A mitigação é: (1) checagem de quota **antes** de gravar, com bloqueio e aviso acionável em vez de falha silenciosa; (2) fallback para `storage.local` quando um item não cabe, para não perder dados; (3) recalibração do aviso de "limpeza recomendada" para uso em bytes, não em contagem de notas.

Para dimensionar: com ~100 KB disponíveis e 500 notas, o orçamento médio é de ~200 bytes por nota — pouco, considerando que cada nota carrega `id`, `text`, `color`, `tags`, `reminder`, `createdAt` e `updatedAt` (os campos de metadados sozinhos já consomem ~120 bytes). Na prática, **o perfil de 500 notas não cabe inteiro em `sync`**. O design não finge que cabe: ele prioriza as notas mais recentes, mantém o excedente acessível localmente e torna a limpeza uma ação que o usuário entende e consegue executar.

### Alternativas consideradas

1. **Backend próprio (Firebase/Supabase)** — sem limite de tamanho, mas exige manter servidor, adiciona superfície de segurança para dados de atendimento do INSS, e contraria a convenção atual do projeto. Rejeitado pelo stakeholder.
2. **Export/Import manual guiado** — zero limite de tamanho, mas depende do usuário lembrar de agir antes de trocar de máquina; não resolve a reclamação de fundo (perda por esquecimento). Mantido como *fallback* de recuperação (já existe, não faz parte deste escopo de mudança), não como solução primária.

---

## Design Components

### 1. Módulo de quota compartilhado (`lib/quota.js`, novo)

Novo arquivo carregado nos três contextos (`content_scripts`, `background`, `popup`) que centraliza os limites e os cálculos de tamanho, para não duplicar constantes em três lugares.

```javascript
const SYNC_QUOTA_BYTES_TOTAL = chrome.storage.sync.QUOTA_BYTES; // 102400
const SYNC_QUOTA_BYTES_PER_ITEM = chrome.storage.sync.QUOTA_BYTES_PER_ITEM; // 8192
const SYNC_MAX_ITEMS = chrome.storage.sync.MAX_ITEMS; // 512

function getItemByteSize(key, value) {
  // chrome.storage soma o tamanho da chave (UTF-8) + JSON.stringify(value)
  return new TextEncoder().encode(key).length + new TextEncoder().encode(JSON.stringify(value)).length;
}

async function checkQuotaBeforeWrite(key, value) {
  const itemBytes = getItemByteSize(key, value);

  if (itemBytes > SYNC_QUOTA_BYTES_PER_ITEM) {
    return { ok: false, limitType: 'PER_ITEM', itemBytes };
  }

  const [currentTotal, existingBytes] = await Promise.all([
    new Promise(r => chrome.storage.sync.getBytesInUse(null, r)),
    // Se a chave já existe, seu tamanho atual é descontado antes de somar o novo.
    // Retorna 0 quando a chave não existe.
    new Promise(r => chrome.storage.sync.getBytesInUse(key, r))
  ]);

  const projectedTotal = currentTotal - existingBytes + itemBytes;
  if (projectedTotal > SYNC_QUOTA_BYTES_TOTAL) {
    return { ok: false, limitType: 'TOTAL', projectedTotal };
  }

  // MAX_ITEMS (512 chaves) é alcançável para o perfil de usuário pesado (500+ notas),
  // e é um limite independente dos bytes — precisa ser checado separadamente.
  // Só conta como novo item se a chave ainda não existir (existingBytes === 0).
  if (existingBytes === 0) {
    const itemCount = await new Promise(r => chrome.storage.sync.get(null, v => r(Object.keys(v).length)));
    if (itemCount + 1 > SYNC_MAX_ITEMS) {
      return { ok: false, limitType: 'MAX_ITEMS', itemCount };
    }
  }

  return { ok: true };
}
```

Erros são retornados como objeto tipado (`{ ok, limitType }`), não exceptions genéricas — os chamadores decidem a mensagem exata para o usuário a partir de `limitType`.

**A checagem prévia não substitui o tratamento do erro do Chrome.** Há uma janela de corrida entre checar e gravar (outra aba, ou uma alteração chegando via sync, pode consumir espaço nesse intervalo), e o Chrome também impõe limites de taxa de escrita. Portanto `chrome.runtime.lastError` continua sendo verificado após cada `.set()`, e um erro de quota vindo de lá é convertido no **mesmo** erro tipado `QUOTA_EXCEEDED`, acionando o mesmo fallback. A checagem prévia existe para dar mensagem melhor e evitar o caminho de erro na maioria dos casos — não é a única linha de defesa.

**Limites de taxa de escrita** (`MAX_WRITE_OPERATIONS_PER_MINUTE` = 120, `MAX_WRITE_OPERATIONS_PER_HOUR` = 1.800) também produzem falha de gravação. Esses erros **não** devem cair no fallback local permanente — são transitórios. Tratamento: retentar uma vez após breve espera e, persistindo, avisar o usuário para tentar de novo em instantes.

### 2. `lib/storage.js` — gravações passam pela guarda de quota

`saveNote()`, `saveStandardText()`, `updateStandardText()`, `importStandardTexts()` e `importNotes()` chamam `checkQuotaBeforeWrite()` antes de `chrome.storage.sync.set()`. Em caso de falha:

- Retorna rejeição com erro tipado: `{ code: 'QUOTA_EXCEEDED', limitType, message }`.
- **Fallback de segurança**: se a escrita em `sync` falhar por quota, a extensão tenta gravar a mesma nota em `chrome.storage.local` sob a mesma chave (`note_<protocolo>`), para não perder o dado que o usuário acabou de digitar. Essa nota fica marcada internamente (`_syncFallback: true`).
- `getAllNotes()` e `getNotesForProtocolos()` passam a consultar **ambos** os namespaces e mesclar por chave, para que notas em fallback continuem visíveis.

#### Regra de resolução quando a mesma chave existe nos dois namespaces

Esse caso é real e precisa de regra explícita, senão a leitura fica não-determinística. Cenário: a nota `note_123` ficou em `local` por falta de quota no PC A; depois o usuário libera espaço e edita a mesma nota, que agora grava em `sync`. Ou: a nota existe em `sync` (veio do PC B) e também em `local` (fallback antigo do PC A).

**Regra: vence o `updatedAt` mais recente.** Não "sync sempre vence" — isso descartaria uma edição local mais nova que o usuário acabou de fazer.

Adicionalmente, quando a leitura encontra a chave nos dois lados:
- Se o registro de `sync` é o mais recente, a cópia em `local` é obsoleta e **é removida** (limpeza automática do fallback — ele já cumpriu seu papel).
- Se o registro de `local` é o mais recente, ele é mantido e a extensão tenta reenviá-lo para `sync` (pode ser que agora haja espaço). Se couber, remove de `local`. Isso faz notas em fallback se auto-recuperarem assim que o usuário liberar espaço, sem exigir ação manual.

Todas as demais funções trocam `chrome.storage.local` → `chrome.storage.sync` mecanicamente (mesma assinatura de API de callback, comportamento idêntico do lado do chamador). `deleteNote()` é exceção: precisa remover a chave de **ambos** os namespaces, senão uma cópia em fallback ressuscita a nota "excluída" na próxima leitura.

### 3. `background/background.js`

- Troca `chrome.storage.local` por `chrome.storage.sync` nas operações sobre `note_<protocolo>`.
- `chrome.storage.onChanged` listener: filtro `namespace !== 'local'` vira `namespace !== 'sync' && namespace !== 'local'` — precisa reagir a mudanças em ambos os namespaces agora (uma nota pode chegar via sync de outro computador, ou existir em local por fallback de quota).
- `templates`, `theme` continuam exclusivamente em `local`, sem mudança.

### 4. Migração de dados existentes (`migrateNotesToSync()`, novo em `background.js`)

Roda em `chrome.runtime.onInstalled` com `details.reason === 'update'`, após a migração granular já existente:

1. Lê todas as `note_*` e `standard_texts` de `storage.local`.
2. **Ordena as notas por `updatedAt` decrescente** — se nem tudo couber, o que sincroniza é o trabalho mais recente (o mais provável de estar em uso), não uma fatia arbitrária determinada pela ordem das chaves.
3. Para cada item, chama `checkQuotaBeforeWrite()` contra o estado atual do `storage.sync`.
4. Se couber: grava em `sync`, **confirma que a gravação teve sucesso** (sem `chrome.runtime.lastError`) e só então remove a chave de `local`. A ordem grava-confirma-remove nunca é invertida.
5. Se não couber: mantém em `local`, marca `_syncFallback: true`, incrementa contador de itens não migrados.
6. Ao final, se houve itens não migrados, dispara uma notificação do Chrome (`chrome.notifications.create`) informando quantos itens não foram sincronizados e sugerindo limpeza.

**Caso especial `standard_texts`**: é uma única chave contendo um array inteiro, então está sujeita ao limite de 8 KB **como um todo** — um usuário com muitos textos padrão pode ter essa chave inteira rejeitada por `PER_ITEM`, mesmo que cada texto individual seja pequeno. Nesse caso a chave inteira permanece em `local` (não é fatiada), e o usuário é avisado de que os textos padrão não estão sincronizando. Fatiar `standard_texts` em chaves individuais (`stdtext_<id>`) resolveria isso, mas é uma mudança de formato maior — registrada em Open Questions, fora deste escopo.

Migração é idempotente e tolerante a interrupção: se o service worker for descartado no meio, o próximo start reprocessa. Itens já movidos com sucesso não existem mais em `local`; itens que falharam continuam em `local` e são reavaliados. Como a gravação em `sync` usa a mesma chave, um reprocessamento parcial sobrescreve com o mesmo valor, sem duplicar.

### 5. Aviso de limite ao usuário

Dois pontos de aviso, ambos reaproveitando `limitType` do módulo de quota:

**a) Bloqueio ativo ao salvar** (content script inline e popup): quando `saveNote`/`saveStandardText` rejeita com `QUOTA_EXCEEDED`, mostra mensagem contextual:

- `limitType === 'PER_ITEM'`: _"Esta nota/texto é muito longa para sincronizar (máx. 8 KB). Ela foi salva apenas neste computador. Reduza o texto para sincronizar."_
- `limitType === 'TOTAL'`: _"Limite de sincronização atingido — esta nota foi salva apenas neste computador. Exclua notas de tarefas já concluídas ou textos padrão não usados para voltar a sincronizar."_
- `limitType === 'MAX_ITEMS'`: _"Limite de 512 itens sincronizados atingido — esta nota foi salva apenas neste computador. Exclua notas de tarefas já concluídas."_

A nota digitada não é descartada — cai no fallback local (item 2), e o aviso deixa claro que ficou salva **só neste computador**.

> **Atenção de implementação — handlers genéricos existentes engolem a mensagem.**
> Hoje `content/content.js:606` faz `.catch(err => showToast('Erro ao salvar nota', 'error'))` e `popup/popup.js:209` faz o equivalente. Se esses handlers ficarem como estão, o erro `QUOTA_EXCEEDED` cai no toast genérico e **o aviso específico nunca aparece** — ou seja, a funcionalidade pedida silenciosamente não funciona. Cada `.catch()` que envolve uma gravação precisa inspecionar `err.code === 'QUOTA_EXCEEDED'` e usar `err.message` (já formatado a partir de `limitType`) antes de cair na mensagem genérica. Os pontos a alterar estão listados na tabela de Implementation Plan.

**b) `checkStorageHealth()` recalibrado** (`lib/storage.js`): hoje avisa em contagem fixa (500 itens), pensado para o limite de 10 MB do `local`. Passa a calcular percentual de uso de `chrome.storage.sync.getBytesInUse(null)` sobre `QUOTA_BYTES_TOTAL`:

```javascript
async function checkStorageHealth() {
  const bytesInUse = await new Promise(r => chrome.storage.sync.getBytesInUse(null, r));
  const percentUsed = bytesInUse / SYNC_QUOTA_BYTES_TOTAL;
  let warning = null;
  if (percentUsed >= 0.7) {
    warning = `Você está usando ${Math.round(percentUsed * 100)}% do limite de sincronização. Considere excluir notas de tarefas já concluídas.`;
  }
  return { ok: percentUsed < 0.7, percentUsed, warning };
}
```

Disparado a 70% de uso (não 100%) para dar folga antes do bloqueio rígido acontecer no meio de um atendimento.

### 6. Usuário sem sync ativo no Chrome

Ponto importante levantado na revisão: segundo a documentação do Chrome, quando a sincronização está desativada, **`storage.sync` se comporta como `storage.local`** — as gravações funcionam normalmente, sem erro, mas nada é replicado. Isso significa que um usuário sem sync ativo teria a extensão aparentemente funcionando e continuaria perdendo notas ao trocar de computador, que é exatamente a reclamação original.

O stakeholder estima que a maioria dos ~1000 usuários usa perfil Google logado, mas "a maioria" não é "todos", e essa é a falha mais silenciosa possível do design.

**Mitigação**: detectar o estado de sync e avisar. Não existe API direta que reporte "sync está ligado", então a detecção é indireta — verificar se o usuário tem identidade de perfil disponível (`chrome.identity.getProfileUserInfo`, requer permissão `identity.email`) ou, alternativa sem permissão extra, gravar um marcador com timestamp/ID de dispositivo em `sync` e observar se ele muda vindo de outro dispositivo ao longo do tempo.

**Decisão do stakeholder (2026-09-16): não detectar nesta entrega.** A permissão `identity.email` apareceria na tela de instalação/atualização para ~1000 usuários em contexto governamental, e o atrito e a desconfiança que isso geraria pesam mais do que o aviso que ela permitiria. A detecção heurística por marcador de dispositivo foi descartada por não distinguir "sync desativado" de "usuário usa só um computador".

**Consequência aceita conscientemente:** usuários sem sync ativo continuam com o problema original e sem qualquer sinal disso. Se aparecerem relatos de "atualizei e continuo perdendo notas", esse é o primeiro suspeito a investigar — e o tema volta à mesa com dados reais de quem reclamou, em vez de ser resolvido preventivamente às custas de toda a base.

### 7. Firefox

`inss-notas-extensao-firefox/` precisa da mesma mudança. `storage.sync` existe na WebExtensions API do Firefox com os mesmos limites de quota, mas **a sincronização depende de o usuário ter uma Conta Firefox ativa** — não da conta Google. Ou seja, a paridade é de *código*, não necessariamente de *comportamento observado*: um usuário de Firefox sem Conta Firefox tem o mesmo problema descrito no item 6. Aplicar em paralelo conforme convenção do CLAUDE.md ("Sync changes to both browsers").

---

## Data Flow

```
Usuário salva nota
        │
        ▼
saveNote() em lib/storage.js
        │
        ▼
checkQuotaBeforeWrite(key, note)
        │
   ┌────┴─────┐
   │ ok: true │──────► chrome.storage.sync.set() ──► onChanged (namespace: sync)
   └────┬─────┘                                              │
        │ ok: false                                          ▼
        ▼                                          background.js atualiza badge/alarmes
 chrome.storage.local.set()                        (mesmo código, filtro ampliado)
 (fallback, _syncFallback: true)
        │
        ▼
 UI mostra aviso com limitType
 (PER_ITEM ou TOTAL)
```

---

## Implementation Plan

| # | Arquivo | Função / Local | Mudança |
|---|---|---|---|
| 1 | `lib/quota.js` | NOVO | Constantes de quota, `getItemByteSize()`, `checkQuotaBeforeWrite()` |
| 2 | `manifest.json` | `content_scripts.js` | Adicionar `lib/quota.js` **antes** de `lib/storage.js` (é dependência) |
| 3 | `lib/storage.js` | todas as ops de nota | `chrome.storage.local` → `chrome.storage.sync` |
| 4 | `lib/storage.js` | `saveNote()` e writers de texto padrão | Guarda de quota + fallback local + erro tipado |
| 5 | `lib/storage.js` | `getAllNotes()`, `getNotesForProtocolos()` | Ler ambos namespaces + merge por `updatedAt` |
| 6 | `lib/storage.js` | `deleteNote()`, `deleteAllNotes()` | Remover de ambos namespaces |
| 7 | `lib/storage.js` | `checkStorageHealth()` (l. 346) | Recalibrar para % de bytes; remove campo `count` (não consumido) |
| 8 | `background/background.js` | ops de nota | `local` → `sync` |
| 9 | `background/background.js` | `onChanged` (l. 205) | Ampliar filtro para aceitar `sync` e `local` |
| 10 | `background/background.js` | NOVO `migrateNotesToSync()` | Migração ordenada por `updatedAt`, grava-confirma-remove |
| 11 | `content/content.js` | `.catch()` (l. 606) | Tratar `QUOTA_EXCEEDED` antes do toast genérico |
| 12 | `popup/popup.js` | `.catch()` (l. 209) e writers | Tratar `QUOTA_EXCEEDED` antes do toast genérico |
| 13 | `stdtexts/stdtexts.js` | writers de texto padrão | Tratar `QUOTA_EXCEEDED` |
| 14 | `inss-notas-extensao-firefox/` | todos os equivalentes | Espelhar mudanças 1–13 |
| 15 | `manifest.json` (ambos) | `version` | Bump para 1.4.0 |

---

## Testing Scenarios

| Scenario | Steps | Expected Result |
|---|---|---|
| Sincronização básica | Criar nota no PC A → abrir portal no PC B (mesma conta Google) | Nota aparece no PC B em poucos segundos |
| Item individual grande demais | Criar nota/texto padrão > 8 KB | Bloqueio com mensagem `PER_ITEM`, nota salva em local, aviso diz "só neste computador" |
| Quota total atingida | Preencher `sync` até ~100 KB, tentar salvar mais uma nota | Bloqueio com mensagem `TOTAL`, nota cai em fallback local |
| Limite de itens atingido | Ter 512 chaves em `sync`, criar nota nova | Bloqueio com mensagem `MAX_ITEMS` (não `TOTAL`) |
| **Toast específico chega ao usuário** | Forçar quota estourada e salvar pelo content script e pelo popup | Aparece a mensagem de quota, **não** o genérico "Erro ao salvar nota" |
| Aviso preventivo | Uso de sync atingir 70%+ | `checkStorageHealth()` retorna warning antes do bloqueio ocorrer |
| Migração de usuário existente | Usuário com 500 notas em `local` atualiza para nova versão | Notas mais recentes migram primeiro; excedentes ficam em `local` com notificação do total |
| Migração interrompida | Matar o service worker no meio da migração e reiniciar | Nenhuma nota perdida nem duplicada; migração completa |
| Fallback consultado corretamente | Nota em fallback local + notas em sync | `getAllNotes()` retorna todas, sem duplicar, sem perder |
| **Conflito de mesma chave** | `note_X` em `sync` (antiga) e em `local` (mais nova) | Vence a de `updatedAt` mais recente; cópia obsoleta é limpa |
| **Auto-recuperação do fallback** | Nota em fallback → excluir outras notas p/ liberar espaço → recarregar | Nota em fallback sobe para `sync` sozinha e sai de `local` |
| **Exclusão com fallback** | Excluir nota que existe nos dois namespaces | Nota não reaparece após recarregar |
| Multi-dispositivo com fallback | Nota em fallback local no PC A (por estourar quota) | Nota NÃO aparece no PC B (esperado) e o aviso deixou isso explícito |
| `standard_texts` acima de 8 KB | Acumular textos padrão até a chave passar de 8 KB | Chave inteira fica em `local`, usuário avisado de que não sincroniza |
| Sync desativado no Chrome | Desligar sync do perfil, criar nota, abrir no PC B | Nota não replica (limitação conhecida — ver item 6 e Open Questions) |
| Firefox paridade | Repetir cenários acima na build Firefox (com Conta Firefox) | Mesmo comportamento |

---

## Risk Assessment

| Risk | Likelihood | Mitigation |
|---|---|---|
| **Usuário sem sync ativo continua perdendo notas, sem qualquer erro** | Média | Maior risco do design: `storage.sync` cai para comportamento local silenciosamente. Detecção exige decisão de permissão — ver item 6 e Open Questions |
| Perda de dados durante migração | Baixa | Ordem grava-confirma-remove nunca invertida; fallback para `local` quando não cabe |
| Usuário não percebe que uma nota ficou só local (sem sync) | Média | Aviso explícito no bloqueio, com texto "salva apenas neste computador"; indicador visual persistente fica como follow-up |
| Migração falha no meio (service worker descartado) | Baixa | Idempotente: reexecuta no próximo start; sobrescrita pela mesma chave não duplica |
| Divergência entre cópia em `sync` e em `local` | Média | Regra explícita de `updatedAt` mais recente + limpeza da cópia obsoleta |
| Nota "excluída" ressuscitar a partir do fallback | Média | `deleteNote()` remove de ambos os namespaces |
| Limite de taxa de escrita (120/min) em uso intenso | Baixa | Escritas são por ação do usuário, não em loop; erro de taxa é transitório, com retentativa (não vira fallback permanente) |
| `standard_texts` competir por quota com notas | Média (aceito pelo stakeholder) | Ambos contam para o mesmo aviso de 70% e mesmo bloqueio de `TOTAL` |
| Perfil pesado (500 notas) esbarrar em `MAX_ITEMS` antes dos bytes | Média | `MAX_ITEMS` checado separadamente, com mensagem própria |

---

## Success Criteria

- [ ] Notas e textos padrão sincronizam automaticamente entre computadores **para usuários com sync ativo**, sem ação manual
- [ ] Nenhuma escrita falha silenciosamente por estouro de quota — toda falha gera mensagem acionável, **verificada chegando à tela** (não engolida por `.catch()` genérico)
- [ ] Nenhuma nota é perdida quando a quota é excedida (cai em fallback local)
- [ ] Nota excluída não reaparece via cópia em fallback
- [ ] Conflito entre cópias resolve deterministicamente pelo `updatedAt` mais recente
- [ ] Nota em fallback sobe para `sync` automaticamente quando houver espaço
- [ ] Usuários com storage abaixo de 100 KB não percebem nenhuma mudança além da sincronização
- [ ] Migração de instalações existentes preserva 100% dos dados (em `sync` ou em `local`)
- [ ] Aviso de "limite próximo" dispara a 70% de uso, antes do bloqueio rígido
- [ ] Paridade de código entre builds Chrome e Firefox

---

## Open Questions

Nenhuma decisão pendente — todas resolvidas.

**Resolvidas:**

- ~~Detectar e avisar quando o sync está desativado~~ → **decidido em 2026-09-16: não detectar nesta entrega**, para evitar a permissão `identity.email` na instalação. Ver item 6 para o raciocínio e a consequência aceita.

**Follow-ups, não bloqueiam esta entrega:**

- Reavaliar a detecção de sync desativado **se** surgirem relatos de "atualizei e continuo perdendo notas".

- Indicador visual persistente (ex: ícone na nota) para itens em fallback local, além do aviso pontual no momento do bloqueio.
- Fatiar `standard_texts` em chaves individuais (`stdtext_<id>`) para escapar do teto de 8 KB da chave única.
- Compressão de texto antes de gravar, para reduzir pressão sobre os 8 KB por item.
