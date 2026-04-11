# Guia de Release — NotasPat

Passo a passo completo para atualizar a versão da extensão e publicar nas lojas Chrome e Firefox.

---

## Visão Geral

O projeto mantém **dois builds paralelos**:

| Pasta | Destino |
|---|---|
| `inss-notas-extensao/` | Chrome Web Store |
| `inss-notas-extensao-firefox/` | Firefox Add-ons (AMO) |

Qualquer atualização de versão deve ser aplicada nos **dois builds simultaneamente**.

---

## Passo 1 — Localizar todas as referências de versão

Antes de editar, confirme exatamente onde a versão atual aparece. No terminal, a partir da raiz do projeto:

```bash
grep -rn "1\.3\.7" .
```

> Substitua `1.3.7` pela versão que está sendo substituída.

As referências de versão ficam nos seguintes arquivos (atualmente 10 ocorrências em 6 arquivos):

| Arquivo | Linha | Campo |
|---|---|---|
| `inss-notas-extensao/manifest.json` | 5 | `"version"` |
| `inss-notas-extensao-firefox/manifest.json` | 5 | `"version"` |
| `inss-notas-extensao/background/background.js` | 3 | Comentário do cabeçalho JSDoc |
| `inss-notas-extensao/background/background.js` | última | `console.log(... carregado)` |
| `inss-notas-extensao-firefox/background/background.js` | 3 | Comentário do cabeçalho JSDoc |
| `inss-notas-extensao-firefox/background/background.js` | última | `console.log(... carregado)` |
| `inss-notas-extensao/popup/popup.html` | ~195 | `<span class="version">` |
| `inss-notas-extensao-firefox/popup/popup.html` | ~195 | `<span class="version">` |
| `build_zip.py` | 19 | Nome do arquivo de saída (Firefox) |
| `build_zip.py` | 20 | Nome do arquivo de saída (Chrome) |

---

## Passo 2 — Atualizar a versão em todos os arquivos

Edite cada arquivo da tabela acima substituindo a versão antiga pela nova.

### 2.1 `manifest.json` (Chrome e Firefox)

```json
"version": "1.3.8"
```

> A versão do manifesto deve seguir o formato `MAJOR.MINOR.PATCH` sem prefixo "v".

### 2.2 `background/background.js` (Chrome e Firefox)

Cabeçalho (linha 3):
```js
 * Manifest V3 - Versão 1.3.8
```

Log de inicialização (última linha do arquivo):
```js
console.log('[NotasPat] Background Service Worker v1.3.8 carregado');
```

### 2.3 `popup/popup.html` (Chrome e Firefox)

```html
<span class="version">v1.3.8</span>
```

### 2.4 `build_zip.py`

```python
create_zip('inss-notas-extensao-firefox', 'notaspat-firefox-v1.3.8.zip')
create_zip('inss-notas-extensao', 'notaspat-chrome-v1.3.8.zip')
```

### 2.5 Verificar que não restou nenhuma referência antiga

```bash
grep -rn "1\.3\.7" .
```

O comando não deve retornar nenhum resultado.

---

## Passo 3 — Gerar os arquivos ZIP

Execute o script de build na raiz do projeto:

```bash
python build_zip.py
```

Saída esperada:

```
notaspat-firefox-v1.3.8.zip: OK (21 arquivos)
notaspat-chrome-v1.3.8.zip: OK (24 arquivos)
```

Os ZIPs são gerados na raiz do projeto. Cada um contém os arquivos internos da respectiva pasta de extensão com caminhos relativos corretos (sem backslash), prontos para envio às lojas.

> O script valida automaticamente a ausência de backslashes nos caminhos internos, que causariam rejeição na Chrome Web Store.

---

## Passo 4 — Publicar na Chrome Web Store

1. Acesse o painel de desenvolvedor: **https://chrome.google.com/webstore/devconsole**
2. Faça login com a conta Google associada à publicação.
3. Localize **NotasPat** na lista de extensões e clique nela.
4. No menu lateral, clique em **Pacote** → **Fazer upload de novo pacote**.
5. Selecione o arquivo `notaspat-chrome-v1.3.8.zip`.
6. Aguarde a validação automática. Se houver erros, corrija e repita o upload.
7. Revise as informações da listagem se necessário (descrição, screenshots).
8. Clique em **Enviar para revisão**.
9. A Google analisa a extensão (horas a dias). Um e-mail confirma a aprovação.

Após aprovação, a atualização é distribuída automaticamente para todos os usuários instalados.

---

## Passo 5 — Publicar no Firefox Add-ons (AMO)

1. Acesse: **https://addons.mozilla.org/pt-BR/developers/**
2. Faça login com a conta Mozilla associada à publicação.
3. Localize **NotasPat** e clique em **Editar produto**.
4. Clique em **Upload nova versão**.
5. Selecione o arquivo `notaspat-firefox-v1.3.8.zip`.
6. Siga o assistente (compatibilidade, notas da versão).
7. Submeta para revisão.

---

## Resumo rápido

```
1. Localizar referências antigas:   grep -rn "1.3.7" .
2. Editar os 6 arquivos (10 ocorrências)
3. Confirmar ausência:              grep -rn "1.3.7" .   → sem resultados
4. Gerar ZIPs:                      python build_zip.py
5. Enviar notaspat-chrome-vX.X.X.zip  → Chrome Web Store
6. Enviar notaspat-firefox-vX.X.X.zip → Firefox Add-ons (AMO)
```

---

## Dicas

- **Sempre** incremente a versão antes de enviar — as lojas rejeitam uploads com a mesma versão já publicada.
- Guarde uma cópia dos ZIPs de cada versão enviada. Os arquivos gerados pelo `build_zip.py` ficam na raiz do projeto e podem ser movidos para uma pasta de histórico (`releases/`).
- O `manifest.json` deve estar na **raiz** do ZIP — o script `build_zip.py` já garante isso.
- Chrome e Firefox têm diferenças de manifest (Chrome: `service_worker`; Firefox: `scripts` + `browser_specific_settings.gecko`). Os builds são independentes — não compacte a pasta errada.
