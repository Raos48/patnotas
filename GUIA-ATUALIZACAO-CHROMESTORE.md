# Guia: Como Atualizar a Extensão na Chrome Web Store

## Passo 1 - Incrementar a Versão no manifest.json

Antes de enviar, atualize o campo `version` no arquivo `manifest.json`.
A versão atual é `1.2.0`. Altere para um número maior, por exemplo:

```json
"version": "1.2.1"
```

> A Chrome Web Store rejeita uploads com a mesma versão já publicada.

---

## Passo 2 - Gerar o Arquivo ZIP

A Chrome Web Store exige um arquivo `.zip` contendo **apenas os arquivos da extensão** (o conteúdo da pasta `inss-notas-extensao`).

### Opção A - Pelo Explorador de Arquivos

1. Abra a pasta `inss-notas-extensao`
2. Selecione **todos os arquivos e pastas** dentro dela:
   - `manifest.json`
   - `background/`
   - `content/`
   - `popup/`
   - `lib/`
   - `icons/`
   - `PRIVACY.md`
3. Clique com o botão direito > **Compactar para arquivo ZIP**
4. Nomeie como `notaspat-v1.2.1.zip`

### Opção B - Pelo Terminal (PowerShell)

```powershell
Compress-Archive -Path "inss-notas-extensao\*" -DestinationPath "notaspat-v1.2.1.zip" -Force
```

> **IMPORTANTE:** O `manifest.json` deve estar na **raiz** do ZIP, e NÃO dentro de uma subpasta.

---

## Passo 3 - Acessar o Chrome Web Store Developer Dashboard

1. Acesse: **https://chrome.google.com/webstore/devconsole**
2. Faça login com sua conta Google (a mesma usada para publicar)

---

## Passo 4 - Selecionar a Extensão

1. No painel, localize **NotasPat** na lista de extensões
2. Clique no nome da extensão para abrir os detalhes

---

## Passo 5 - Fazer Upload do Novo Pacote

1. No menu lateral, clique em **Pacote** (ou **Package**)
2. Clique no botão **Fazer upload de novo pacote** (ou **Upload new package**)
3. Selecione o arquivo `notaspat-v1.2.1.zip` que você criou
4. Aguarde o upload e a validação automática
5. Se houver erros, corrija conforme indicado e repita o upload

---

## Passo 6 - Revisar as Informações

Antes de enviar para revisão, verifique:

- **Descrição**: Está atualizada?
- **Screenshots**: Refletem a versão atual?
- **Política de Privacidade**: O link está funcionando?
  - URL: `https://raos48.github.io/patnotas/privacy.html`
- **Categoria**: Produtividade
- **Idioma**: Português (Brasil)

---

## Passo 7 - Enviar para Revisão

1. Clique em **Enviar para revisão** (ou **Submit for review**)
2. A Google irá analisar a extensão (pode levar de algumas horas a alguns dias)
3. Você receberá um e-mail quando a revisão for concluída

---

## Resumo Rápido

| Etapa | Ação |
|-------|------|
| 1 | Atualizar `version` no `manifest.json` |
| 2 | Gerar ZIP com os arquivos da extensão |
| 3 | Acessar https://chrome.google.com/webstore/devconsole |
| 4 | Selecionar a extensão NotasPat |
| 5 | Upload do novo ZIP |
| 6 | Revisar informações da listagem |
| 7 | Enviar para revisão |

---

## Dicas

- **Sempre incremente a versão** antes de enviar (ex: 1.2.0 -> 1.2.1 -> 1.2.2)
- O `manifest.json` deve estar na **raiz do ZIP**
- Após aprovação, a atualização chega automaticamente para todos os usuários
- Guarde uma cópia do ZIP de cada versão enviada para referência
