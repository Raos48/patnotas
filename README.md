# NotasPat - Notas Adesivas para Tarefas

**Versão:** 1.3.0
**Autor:** Ricardo Alves

## Descrição

Extensão Google Chrome que adiciona notas adesivas (sticky notes) às tarefas de portais de atendimento. Permite registrar observações sobre tarefas específicas de forma visual e persistente, com suporte a tags, cores, templates e lembretes.

## Características

- Notas adesivas visuais vinculadas ao número de protocolo
- Suporte a tags para categorização (urgente, pendência, lembrete, concluído)
- 6 cores de notas disponíveis
- Templates de texto pré-definidos
- Lembretes com notificações do navegador
- Widget flutuante para acesso rápido
- Busca e filtro de notas com debounce
- Paginação automática para grandes volumes de notas
- Exportação/importação de notas (JSON)
- Modo escuro
- Atalho de teclado (Ctrl+Shift+N)
- Storage granular otimizado para performance
- Alerta de volume quando há muitas notas salvas

## Instalação

### Via Chrome Web Store

1. Acesse a Chrome Web Store
2. Busque por "NotasPat"
3. Clique em "Adicionar ao Chrome"

### Modo de Desenvolvedor

1. Baixe este repositório
2. Abra o Google Chrome e navegue para `chrome://extensions/`
3. Ative o **Modo do desenvolvedor** (canto superior direito)
4. Clique em **Carregar sem compactação**
5. Selecione a pasta `inss-notas-extensao`
6. A extensão será instalada e o ícone aparecerá na barra de ferramentas

## Uso

### Adicionar uma Nota

1. Acesse o Portal de Atendimento desejado
2. Navegue até a tela de Tarefas
3. Cada linha da tabela terá um botão **"📝 Nota"** na coluna "Interessado"
4. Clique no botão para adicionar uma nota

### Editar uma Nota

1. Clique no botão **✏️** no canto superior direito da nota
2. Faça as alterações desejadas
3. Clique em **Salvar**

### Alterar a Cor

1. Clique no botão **🎨** na nota
2. Selecione uma das 6 cores disponíveis

### Adicionar Tags

1. No editor de nota, clique nas tags disponíveis
2. Tags disponíveis: `urgente`, `pendencia`, `lembrete`, `concluido`

### Definir Lembrete

1. No editor de nota, clique no campo **Data/Hora do Lembrete**
2. Selecione a data e hora desejada
3. Salve a nota
4. Você receberá uma notificação no horário definido

### Excluir uma Nota

1. Clique no botão **🗑️** na nota
2. Confirme a exclusão

## Atalhos de Teclado

| Atalho | Ação |
|--------|------|
| `Ctrl+Shift+N` (Windows/Linux) | Abrir popup de notas |
| `Command+Shift+N` (Mac) | Abrir popup de notas |

## Estrutura de Arquivos

```
inss-notas-extensao/
├── manifest.json              # Configuração da extensão (Manifest V3)
├── icons/                     # Ícones da extensão (16, 48, 128px)
├── lib/
│   └── storage.js            # CRUD granular para chrome.storage.local
├── content/
│   ├── content.js            # Script injetado na página (observer otimizado + cache seletivo)
│   └── content.css           # Estilos das notas adesivas
├── popup/
│   ├── popup.html            # Popup do ícone da extensão
│   ├── popup.js              # Lógica do popup (debounce + paginação)
│   └── popup.css             # Estilos do popup
└── background/
    └── background.js         # Service Worker (migração + alarmes inteligentes)
```

## Templates Disponíveis

A extensão vem com 4 templates pré-definidos:

1. **Aguardando documentação** - "Aguardando envio de documentação complementar pelo interessado."
2. **Ligar para interessado** - "Ligar para o interessado para esclarecer pendências."
3. **Em análise** - "Processo em análise técnica."
4. **Aguardando retorno** - "Aguardando retorno do interessado."

## Exportar/Importar Notas

### Exportar

1. Clique no ícone da extensão na barra de ferramentas
2. Clique em **Exportar**
3. O arquivo JSON será baixado com todas as suas notas

### Importar

1. Clique no ícone da extensão
2. Clique em **Importar**
3. Selecione o arquivo JSON previamente exportado
4. As notas serão mescladas com as existentes

## Privacidade e Segurança

- Todas as notas são armazenadas **localmente** no navegador
- Nenhum dado é enviado para servidores externos
- As notas podem conter dados sensíveis - ao exportar, tenha cuidado com o destino do arquivo
- A extensão utiliza práticas de segurança para prevenir XSS (Cross-Site Scripting)

## Requisitos

- Google Chrome ou Chromium (versão 88+)
- Manifest V3
- Acesso ao portal de atendimento compatível

## Troubleshooting

### Alerta de volume de notas

A partir de 500 notas salvas, a extensão exibe um aviso recomendando excluir notas antigas. Isso ajuda a manter o desempenho ideal.

### As notas não aparecem após mudar de aba

A extensão usa MutationObserver otimizado para detectar mudanças. Se as notas não aparecerem:
1. Aguarde alguns segundos
2. Se necessário, recarregue a página (F5)

### O botão de nota não aparece

1. Verifique se você está no domínio compatível
2. Abra o console do navegador (F12) e verifique se há erros
3. Verifique se a extensão está ativada em `chrome://extensions/`

### Lembretes não funcionam

1. Verifique se as notificações estão permitidas para o Chrome
2. Verifique se a extensão tem permissão de notificações em `chrome://extensions/`

## Changelog

### Versão 1.3.0 - Otimização de Performance
- **Storage granular**: cada nota é armazenada individualmente (`note_<protocolo>`) em vez de um objeto monolítico, eliminando o padrão read-all/write-all
- **Migração automática**: ao atualizar, as notas do formato antigo são migradas automaticamente para o novo formato sem perda de dados
- **Alarmes inteligentes**: lembretes são atualizados de forma diferencial (apenas a nota alterada), sem recriar todos os alarmes a cada mudança
- **Debounce na busca**: busca no popup com debounce de 300ms e filtros com 150ms, evitando re-renders excessivos
- **Paginação no popup**: notas são exibidas em lotes de 50, com botão "Carregar mais" para volumes grandes
- **MutationObserver otimizado**: observador prioriza container específico das tarefas, com fallback gradual; ignora mutações geradas pela própria extensão
- **Cache seletivo de memória**: carrega apenas notas dos protocolos visíveis na página, com lazy loading para linhas dinâmicas
- **Alerta de volume**: aviso automático quando o número de notas ultrapassa 500, recomendando limpeza

### Versão 1.2.0
- Renomeada para "NotasPat"
- Melhorias de segurança (escapamento de HTML)
- Atualização para Chrome Web Store
- Política de privacidade adicionada

### Versão 1.1.0
- Adicionado suporte a tags
- Adicionado lembretes com notificações
- Adicionado modo escuro
- Adicionado templates de texto
- Adicionado widget flutuante
- Adicionado tooltips de preview

### Versão 1.0.0
- Lançamento inicial
- Notas adesivas básicas
- Suporte a 6 cores
- CRUD completo
- Exportação/importação

## Licença

Esta extensão foi desenvolvida para uso profissional.

## Suporte

Para dúvidas, sugestões ou reportar problemas, entre em contato:

**Ricardo Alves**
E-mail: ric2035843@gmail.com

---

*Desenvolvido para facilitar o trabalho no atendimento de tarefas e processos.*
