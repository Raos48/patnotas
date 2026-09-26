---
name: NotasPat
description: Extensão de notas adesivas para o Portal de Atendimento do INSS — o caderno do protocolo, dentro da fila de tarefas.
colors:
  green-office: "#0B7D3B"
  green-office-deep: "#0A6F35"
  green-office-active: "#08592A"
  green-office-wash: "rgba(11, 125, 59, 0.08)"
  green-office-glow: "rgba(11, 125, 59, 0.2)"
  green-office-live: "#2EAD5E"
  green-office-hover-dark: "#28A055"
  accent-on-primary: "#FFFFFF"
  accent-on-primary-dark: "#0A2416"
  blue-expediente: "#145FA3"
  blue-expediente-deep: "#11528E"
  blue-expediente-wash: "rgba(20, 95, 163, 0.08)"
  yellow-seal: "#F2B73B"
  ink-primary: "#22252C"
  ink-secondary: "#5C6473"
  ink-muted: "#656C7B"
  ink-muted-dark: "#8B93A3"
  ground-mist: "#F5F7FA"
  ground-recess: "#EDF0F5"
  card-white: "#FFFFFF"
  border-hairline: "#D4D9E2"
  border-light: "#E2E6ED"
  success-wash: "#E3F3EB"
  success-ink: "#0B7D3B"
  success-border: "#A8DCBA"
  error-wash: "#FDE7E7"
  error-ink: "#B3261E"
  error-deep: "#8C1D18"
  warning-wash: "#FFF4DD"
  warning-ink: "#C18516"
  paper-yellow: "#fff8c6"
  paper-yellow-fold: "#f3e58d"
  paper-green: "#c6f8cf"
  paper-green-fold: "#8de5a0"
  paper-blue: "#c6e5f8"
  paper-blue-fold: "#8dc8f3"
  paper-pink: "#f8c6d4"
  paper-pink-fold: "#f38da8"
  paper-orange: "#f8e0c6"
  paper-orange-fold: "#f3c48d"
  paper-purple: "#e0c6f8"
  paper-purple-fold: "#c48df3"
  paper-ink: "#1a1a1a"
typography:
  display:
    fontFamily: "Bricolage Grotesque, sans-serif"
    fontSize: "20px"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "-0.3px"
  headline:
    fontFamily: "Bricolage Grotesque, sans-serif"
    fontSize: "17px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.2px"
  title:
    fontFamily: "Bricolage Grotesque, sans-serif"
    fontSize: "12px"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "0.2px"
  body:
    fontFamily: "DM Sans, sans-serif"
    fontSize: "12.5px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  label:
    fontFamily: "DM Sans, sans-serif"
    fontSize: "10.5px"
    fontWeight: 500
    lineHeight: 1.3
    letterSpacing: "0.5px"
rounded:
  xs: "4px"
  sm: "6px"
  md: "8px"
  lg: "10px"
  xl: "12px"
  "2xl": "16px"
  full: "50%"
spacing:
  xs: "4px"
  sm: "6px"
  md: "8px"
  lg: "10px"
  xl: "12px"
  "2xl": "14px"
  "3xl": "18px"
  "4xl": "20px"
components:
  button-primary:
    backgroundColor: "{colors.green-office}"
    textColor: "#ffffff"
    typography: "{typography.body}"
    rounded: "{rounded.lg}"
    padding: "9px 18px"
  button-primary-hover:
    backgroundColor: "{colors.green-office-deep}"
  button-secondary:
    backgroundColor: "#E2E6ED"
    textColor: "{colors.ink-primary}"
    typography: "{typography.body}"
    rounded: "{rounded.lg}"
    padding: "9px 18px"
  button-danger:
    backgroundColor: "{colors.error-ink}"
    textColor: "#ffffff"
    typography: "{typography.body}"
    rounded: "{rounded.lg}"
    padding: "9px 18px"
  button-action:
    backgroundColor: "{colors.card-white}"
    textColor: "{colors.ink-primary}"
    typography: "{typography.body}"
    rounded: "{rounded.lg}"
    padding: "9px 10px"
  input-field:
    backgroundColor: "{colors.card-white}"
    textColor: "{colors.ink-primary}"
    typography: "{typography.body}"
    rounded: "{rounded.lg}"
    padding: "10px 12px"
  chip-tag:
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "4px 10px"
  card-note:
    backgroundColor: "{colors.card-white}"
    rounded: "{rounded.xl}"
    padding: "12px 14px"
  card-stat:
    backgroundColor: "{colors.card-white}"
    rounded: "{rounded.lg}"
    padding: "12px"
  note-paper:
    backgroundColor: "{colors.paper-yellow}"
    textColor: "{colors.paper-ink}"
    rounded: "{rounded.sm}"
    padding: "8px 10px"
  modal-panel:
    backgroundColor: "{colors.card-white}"
    rounded: "{rounded.2xl}"
    padding: "18px 20px"
---

# Design System: NotasPat

## Overview

**Creative North Star: "O Caderno do Protocolo"**

A NotasPat não é um app de produtividade genérico encaixado no portal do INSS — é **um caderno de serventia aberto sobre a fila de tarefas**. A página do portal é o formulário: reto, institucional, feito para ser lido em série. A nota adesiva é o papel colocado em cima dele: um material diferente, mais quente, mais tátil, que carrega a memória humana do que já se fez naquele protocolo. Todo o sistema visual existe para manter esses dois materiais distintos e legíveis um ao lado do outro.

O tom é **sério com calor de papel**. A seriedade vem da identidade corporativa do INSS — verde institucional, azul de apoio, amarelo de sinalização, neutros limpos, densidade de formulário público. O calor vem só do papel: as seis cores pastel das notas, a dobra no canto, o texto que se lê como anotação. A ferramenta deve parecer algo que um servidor reconheceria como seu: confiável, sóbrio, sem performance de marketing — mas não fria, porque guarda o que uma pessoa escreveu.

O chrome da interface se **contém** de propósito. Botões, campos, cartões e cabeçalhos são discretos, com borda fina e cor funcional. Isso não é timidez: é o que permite que a nota adesiva seja a coisa mais viva na tela. Se o chrome gritar junto, o caderno vira ruído. A expressão está nos detalhes precisos — o `letter-spacing` negativo dos títulos, o degradê verde só do cabeçalho, o `letter-spacing` maiúsculo dos rótulos — e nunca em ornamento.

**Explicitamente rejeitado:** visual de startup/SaaS (gradientes vibrantes, ilustrações 3D, glassmorphism, cartões flutuantes translúcidos); cinza genérico de sistema operacional sem personalidade; post-it infantil/decorativo (fita adesiva, rabiscos, fontes manuscritas, emojis gigantes).

**Key Characteristics:**
- Dois materiais separados e nunca misturados: **chrome institucional** e **papel de anotação**
- Verde Ofício (`#0B7D3B`) como voz única da ferramenta; pastel reservado ao papel
- Superfícies planas com borda de 1px; profundidade só como resposta a estado
- Bricolage Grotesque nos títulos e números de protocolo; DM Sans no corpo e nos controles
- Piso funcional de 11px — nunca se sacrifica legibilidade por densidade
- Densidade de formulário público: informação compacta, hierarquia inequívoca, zero enfeite

## Colors

Duas famílias, dois papéis: o **Verde Ofício** do chrome institucional e o **Papel de Post-it** das notas. A paleta é o verde/amarelo/azul da marca do INSS, refinados para interface corporativa — não para campanha.

### Primary

- **Verde Ofício** (`#0B7D3B`): a voz da ferramenta. Botão primário, número do protocolo, valor de estatística, marca no cabeçalho, foco de campo, hover de ação secundária. É a cor que diz "isto é NotasPat".
- **Verde Ofício Profundo** (`#0A6F35`): estado hover do primário — o verde que o botão vira ao ser acionado.
- **Verde Ofício Ativo** (`#08592A`): estado pressionado e fim do degradê do cabeçalho. O ponto mais escuro do verde de marca.
- **Verde Ofício Lavado** (`rgba(11, 125, 59, 0.08)`): fundo de destaque suave — hover de botão fantasma, anel de foco, fundo de `drag-over`. Nunca como cor de texto.

### Secondary

- **Azul Expediente** (`#145FA3`): o azul institucional de apoio. Tag "Lembrete", informação secundária, ícones de orientação. Nunca compete com o verde pela ação principal.
- **Azul Expediente Profundo** (`#11528E`): hover do azul.
- **Azul Expediente Lavado** (`rgba(20, 95, 163, 0.08)`): fundo da tag de lembrete.

### Tertiary

- **Amarelo Selo** (`#F2B73B`): o acento de marca, usado com parcimônia — badges, indicadores, detalhes de sinalização. Sua forma legível em texto é o **Amarelo Tinta** (`#C18516`), mais escuro, para rótulo de atenção sobre fundo lavado. O amarelo puro nunca escreve texto.

### Neutral

- **Névoa de Serventia** (`#F5F7FA`): fundo geral da interface — o papel de fundo do formulário, frio e limpo.
- **Cartão Branco** (`#FFFFFF`): superfícies de conteúdo: cartões de nota, modais, campos, painéis.
- **Recesso** (`#EDF0F5`): fundo rebaixado — campos inativos, botões de template, o rodapé do popup.
- **Grafite** (`#22252C`): texto principal. Títulos, corpo de nota no chrome, valores.
- **Grafite Médio** (`#5C6473`): texto secundário — descrições, rótulos de formulário, metadados.
- **Grafite Apagado** (`#656C7B`): texto esmaecido — datas, versão, placeholders, rótulos de apoio. Fica no piso legível (≈4.9:1 sobre Névoa); não é um cinza decorativo.
- **Tinta sobre Acento** (`#FFFFFF` claro / `#0A2416` escuro): a cor do texto que se senta em cima do Verde Ofício. No tema escuro o verde vira claro (`#2EAD5E`), então a tinta inverte — nunca branco sobre verde claro.
- **Linha de Formulário** (`#D4D9E2`): borda padrão de cartão, divisor, thumb de scrollbar.
- **Linha Clara** (`#E2E6ED`): borda de campo e de botão de ação — mais leve que a borda de cartão, para não competir com o conteúdo.

### Feedback (funcional, nunca decorativo)

- **Sucesso**: fundo Lavado Verde Sucesso (`#E3F3EB`), tinta Verde Ofício (`#0B7D3B`), borda (`#A8DCBA`).
- **Erro**: fundo Lavado Erro (`#FDE7E7`), tinta Vermelho Erro (`#B3261E`), borda (`#F5B8B5`).
- **Atenção**: fundo Lavado Atenção (`#FFF4DD`), tinta Amarelo Tinta (`#C18516`), borda (`#F2D590`).

### Papel de Post-it (material separado)

As seis cores de nota não são "cores de status" do chrome — são **papel**. Cada uma tem fundo pastel, dobra um pouco mais escura (o sombreamento da dobra física) e tinta escura legível sobre o pastel.

| Nome | Papel | Dobra | Uso |
|---|---|---|---|
| Amarelo | `#fff8c6` | `#f3e58d` | Cor padrão de toda nota nova |
| Verde | `#c6f8cf` | `#8de5a0` | Papel do usuário |
| Azul | `#c6e5f8` | `#8dc8f3` | Papel do usuário |
| Rosa | `#f8c6d4` | `#f38da8` | Papel do usuário |
| Laranja | `#f8e0c6` | `#f3c48d` | Papel do usuário |
| Roxo | `#e0c6f8` | `#c48df3` | Papel do usuário |

Tinta do papel: Grafite Papel (`#1a1a1a`).

### Tema escuro

O tema escuro remapeia o chrome e **mantém o papel** (o post-it continua pastel, porque papel não muda de cor no escuro). Remapes principais: Névoa → `#181B22`, Cartão → `#1E222A`, Recesso → `#252930`, Grafite → `#E4E6EB`, Grafite Apagado → `#8B93A3`, Linha de Formulário → `#2E3340`, Verde Ofício → `#2EAD5E` (hover → `#28A055`), Azul Expediente → `#4A90D9`. Amarelo Selo permanece `#F2B73B` nos dois temas.

**The Inverted Ink Rule.** No tema escuro o Verde Ofício clareia para `#2EAD5E`, e a tinta que se senta em cima dele precisa inverter: `--accent-on-primary` vira `#0A2416` (nunca branco). Regra prática: se o fundo é verde claro, a tinta é escura; se é verde profundo, a tinta é branca. O degradê do cabeçalho de marca é exceção consciente — ele fica `#0B7D3B → #08592A` nos dois temas exatamente para que o branco nunca perca contraste.

### Named Rules

**The Two Materials Rule.** O chrome institucional e o papel de anotação são materiais diferentes e nunca se misturam. O pastel do post-it não vira cor de botão, de borda ou de fundo de painel; o verde de marca não vira fundo de nota. Quando uma superfície não é papel, ela usa a família neutra + verde de marca.

**The One Voice Rule.** O Verde Ofício é a única cor de ação. Se dois elementos verdes competem pela mesma tela, um deles está errado. O azul informa, o amarelo sinaliza, o verde age.

**The Pastel Is Paper Rule.** As seis cores pastéis existem apenas como corpo de nota adesiva (fundo + dobra). Fora da nota, elas não aparecem.

## Typography

**Display/Title Font:** Bricolage Grotesque (400–700, variável, woff2 local — sem rede)
**Body/UI Font:** DM Sans (400–600, variável, woff2 local — sem rede)

**Character:** Bricolage Grotesque é uma grotesca com desenho ligeiramente irregular — dá personalidade de documento impresso aos títulos e aos números de protocolo, sem virar decoração. DM Sans é neutra, geométrica e altamente legível em corpo pequeno: é a letra do formulário. O par lê como "cabeçalho de repartição + campos de preenchimento". Ambas são empacotadas localmente por privacidade — nenhuma requisição de fonte.

### Hierarchy

- **Display** (Bricolage Grotesque 700, 20px, line-height 1.1, letter-spacing -0.3px): nome do produto no cabeçalho do popup. Também usado em 24px para o valor das estatísticas.
- **Headline** (Bricolage Grotesque 700, 17px, line-height 1.2, letter-spacing -0.2px): títulos de modal e de painel.
- **Title** (Bricolage Grotesque 600, 12px, letter-spacing 0.2px): rótulos de campo de formulário. Variante: **Protocolo** (Bricolage Grotesque 700, 13.5px, letter-spacing -0.2px) — o número do protocolo sempre aparece nesta forma, em Verde Ofício.
- **Body** (DM Sans 400/500, 12.5–13px, line-height 1.5): corpo de nota, texto de cartão, descrições. Máximo ~65ch em painéis largos.
- **Label** (DM Sans 500, 10.5px, uppercase, letter-spacing 0.5px): rótulos de estatística e micro-metadados. É a única escala que usa caixa alta.

Escala de tamanhos observada: 10.5 / 11 / 11.5 / 12 / 12.5 / 13 / 13.5 / 14 / 15 / 17 / 20 / 24. Os pesos se concentram em 500 (controles) e 600 (ênfase); 700 fica reservado a Bricolage.

### Named Rules

**The 11px Floor Rule.** Nenhum texto funcional abaixo de 11px. Rótulos de data, versão e metadado podem ir a 10.5px apenas quando são apoio, nunca quando carregam a informação que o servidor precisa ler. Densidade não se compra com legibilidade.

**The Protocol Number Rule.** Todo número de protocolo é renderizado em Bricolage Grotesque 700, Verde Ofício, com letter-spacing negativo. É o índice do caderno — o olho precisa achá-lo antes de ler qualquer outra coisa na linha.

## Layout

**Modelo espacial:** coluna única e fixa. O popup mede **380px** de largura (mínimo 420px de altura) — uma folha de caderno, não um painel. As telas dedicadas (textos padrão, importação) herdam a mesma coluna e o mesmo ritmo, com largura fluida até ~400px de conteúdo.

**Injeção no portal:** o conteúdo injetado na tabela de tarefas é deliberadamente estreito — a nota em modo compacto tem **max-width 220px** e se anexa sob a linha do protocolo, sem redesenhar a tabela do PAT. O portal dita o layout; a extensão ocupa o espaço que sobra na coluna `Interessado`.

**Ritmo de espaçamento:** base de **4px**. Os passos reais são 4 / 6 / 8 / 10 / 12 / 14 / 18 / 20. Padding de cartão e de modal: 12–14px e 18–20px respectivamente. Padding de botão: `9px 18px` (ações de rodapé) ou `9px 10px` (ações em grade). Gaps de lista: 8–10px. O ritmo é denso — densidade de formulário — mas nunca colado: cada bloco tem respiro de pelo menos 8px.

**Densidade:** alta, por necessidade de ofício. Um popup lista 50 notas por página com cabeçalho de marca, barra de busca, filtros, estatísticas e rodapé sem rolagem horizontal. A resposta é hierarquia tipográfica rigorosa, não redução de conteúdo.

**Papel de fundo:** o fundo Névoa carrega uma textura de pontilhado muito sutil (`rgba(34, 37, 44, 0.035)`) — a granulação do papel de formulário. É o único padrão de fundo do sistema.

## Elevation & Depth

**Superfícies planas por padrão.** Cartões, painéis, listas, campos e seções não têm sombra em repouso — a profundidade é dada por borda de 1px e por diferença de tom (Cartão Branco sobre Névoa). Sombra aparece **apenas como resposta a estado**: hover, foco, arraste, modal aberto. O único relevo *decorativo* do sistema inteiro é a **dobra do post-it**.

Duas exceções carregam sombra em repouso porque são objetos físicos, não chrome: o botão de commit (brilho tingido que marca "isto finaliza") e o papel da nota (sombra deslocada que dá peso ao papel sobre a mesa). Ambas são funcionais.

### Shadow Vocabulary

- **Lift Sutil** (`box-shadow: 0 2px 8px var(--shadow-sm)` / `0 4px 12px`): resposta de hover em cartão e estatística. Nunca em repouso.
- **Lift de Modal** (`box-shadow: 0 20px 60px rgba(34,37,44,0.14), 0 0 0 1px var(--border-color)`): só em diálogo aberto.
- **Brilho de Commit** (`box-shadow: 0 2px 8px rgba(11, 125, 59, 0.25)` → hover `0 4px 12px rgba(11, 125, 59, 0.35)`): exclusivo do botão primário. No botão destrutivo, o mesmo brilho em vermelho (`rgba(179, 38, 30, 0.25)`).
- **Anel de Foco** (`box-shadow: 0 0 0 3px var(--accent-light)`): foco de campo de entrada. Cor de marca lavada, nunca glow colorido.
- **Peso do Papel** (`box-shadow: 2px 2px 6px rgba(34, 37, 44, 0.12)` no portal; `inset 0 1px 0 rgba(255,255,255,0.5), 0 2px 6px` no popup): sombra deslocada da nota adesiva — o papel sobre a mesa. O `inset` simula a luz no topo do papel.
- **Sombra de Toast** (`box-shadow: 0 8px 24px rgba(34,37,44,0.14)`): só em aviso flutuante.

### Named Rules

**The Flat-By-Default Rule.** Em repouso, toda superfície de chrome é plana com borda de 1px. Se uma tela parece "levantada" antes de qualquer interação, ela está usando sombra errado.

**The Functional Shadow Rule.** Sombra só comunica uma dessas três coisas: *isto respondeu* (hover/foco), *isto veio por cima* (modal/toast), ou *isto é papel* (nota adesiva). Sombra decorativa é proibida.

## Shapes

**Linguagem de forma:** retângulos suavemente arredondados — cantos generosos o suficiente para parecer papel manuseado, nunca tão grandes quanto cartões de app de consumo. Escala real: **4px** (micro — dobra do post-it, botões do portal), **6px** (papel da nota), **8px** (chips de tag), **10px** (botões, campos, cartão de estatística — o raio padrão do sistema), **12px** (cartão de nota, toast), **16px** (painel de modal), **50%** (avatares de cor, botões de ícone circular).

**Bordas:** 1px em superfícies de repouso (`#D4D9E2`), 1.5px em campos e botões de ação (`#E2E6ED`) — o campo precisa de um contorno um pouco mais presente para ser encontrado com o olho. Dashed 1.5px exclusivamente para "carregar mais" e `drag-over`: borda tracejada significa *espaço que ainda vai receber algo*.

**A dobra:** o canto inferior direito da nota adesiva é cortado por um triângulo na cor da dobra (12px no portal, 14px no popup) — o canto levantado do papel. É o único ornamento geométrico do sistema e é obrigatório em toda nota, em qualquer tamanho.

### Named Rules

**The One Fold Rule.** A dobra do post-it é o único relevo decorativo permitido no sistema. Não há fita adesiva, rabisco, sombra de papel amassado, textura de grão, ilustração ou emoji gigante. O calor do papel vem da cor pastel e da dobra — nada mais.

**The 10px Default Rule.** Se um componente não tem motivo documentado para outro raio, ele usa 10px. É o raio que dá a sensação de "controle de formulário" que unifica botão, campo e cartão.

## Components

### Buttons

- **Shape:** retângulo suavemente arredondado (10px), sem borda nos variantes sólidos.
- **Primary** (Verde Ofício `#0B7D3B`, texto branco, DM Sans 600 13px, padding `9px 18px`, brilho de commit): a ação que finaliza. Um por rodapé de modal. Hover → Verde Ofício Profundo com `translateY(-1px)`; active volta ao lugar.
- **Secondary** (fundo `#E2E6ED`, texto Grafite, mesma métrica): "Cancelar", ações neutras. Hover escurece o cinza. Nunca compete visualmente com o primário.
- **Danger** (Vermelho Erro `#B3261E`, texto branco, brilho vermelho): confirmação destrutiva. Hover → `#8C1D18`. Um por diálogo.
- **Action** (fundo Cartão Branco, borda 1.5px Linha Clara, texto Grafite, padding `9px 10px`, 12px, ícone SVG inline + rótulo): grade de utilidades (exportar, importar, textos padrão). Hover preenche com Verde Ofício Lavado e troca borda/texto/ícone para Verde Ofício. Active: `scale(0.97)`.
- **Ghost/Dashed** (transparente, borda tracejada 1.5px, texto Grafite Médio): "Carregar mais" — um convite, não uma ação.
- **Ícone** (28–34px, circular ou 4px de raio, ícone SVG inline, opacidade 0.6 em repouso): ações na linha da nota (editar, cor, excluir). Hover eleva opacidade a 1.

Ícones são **sempre SVG inline** com `stroke: currentColor` (largura 2–2.5, `stroke-linecap: round`). Nenhum icon font, nenhum emoji como interface (emoji aparece apenas no texto que o usuário escreve, se ele escrever).

### Chips (Tags)

- **Style:** pill suave (8px de raio), padding `4px 10px`, DM Sans 600 11px, fundo lavado + tinta da família de feedback. Sem borda.
- **Variantes:** Urgente (fundo Erro lavado, tinta Vermelho Erro), Pendência (fundo Atenção lavado, tinta Amarelo Tinta), Lembrete (fundo Azul Expediente lavado, tinta Azul Expediente), Concluído (fundo Sucesso lavado, tinta Verde Ofício).
- **State:** tag aplicada mostra `×` de remoção (opacidade 0.6 → 1 no hover); tag disponível mostra prefixo `+` e é clicável para aplicar.

### Cards / Containers

- **Corner Style:** 12px (cartão de nota), 10px (estatística), 16px (modal).
- **Background:** Cartão Branco sobre Névoa de Serventia.
- **Shadow Strategy:** nenhuma em repouso — ver Elevation. Hover: Lift Sutil + borda que clareia para Verde Ofício Lavado + `translateY(-1px)`.
- **Border:** 1px Linha de Formulário.
- **Internal Padding:** `12px 14px` (nota), `12px` (estatística), `18px 20px` (corpo de modal).

### Inputs / Fields

- **Style:** Cartão Branco, borda 1.5px Linha Clara, raio 10px, padding `10px 12px`, DM Sans 13px.
- **Focus:** borda vira Verde Ofício e ganha Anel de Foco (`0 0 0 3px` verde lavado). Sem glow colorido, sem borda dupla.
- **Disabled/readonly:** fundo Recesso, texto Grafite Apagado.
- **Select:** mesma métrica, `appearance: none`, seta SVG inline no placeholder de Grafite Apagado.
- **Textarea de nota:** o campo de texto do editor é o único que pode receber o papel — em alguns contextos ele mostra fundo pastel da cor escolhida, ligando o editor ao material.

### Navigation

O cabeçalho do popup é a única barra de marca do sistema: degradê de 135° de Verde Ofício para Verde Ofício Ativo (`#0B7D3B` → `#08592A`), texto branco, padding `18px 20px`, com dois círculos de contorno branco a 8–12% de opacidade como ornamentação discreta. Ícone de marca num quadrado de 38px com raio 10px, fundo branco a 15%, leve blur. O título é Display; o subtítulo é 11.5px a 80% de opacidade. À direita, o alternador de tema é um botão de ícone branco. O rodapé (`8px 18px`, fundo Névoa, borda superior 1px) carrega versão e crédito em 11px Grafite Apagado.

### Sticky Note Paper (componente assinatura)

O coração do produto — aparece no portal (compacto, sob a linha do protocolo) e no popup (dentro do cartão de nota).

- **Corpo:** fundo pastel da cor escolhida (`--nota-bg`), tinta Grafite Papel, raio 6px, padding `8px 10px` (portal) ou `10px 12px` (popup), DM Sans 12–12.5px line-height 1.3–1.5.
- **Dobra:** triângulo no canto inferior direito, cor `--nota-dobra` (a dobra da família), 12px (portal) / 14px (popup). Obrigatória.
- **Peso:** sombra deslocada `2px 2px 6px` mais `inset 0 1px 0 rgba(255,255,255,0.5)` — luz no topo do papel.
- **Comportamento:** hover sobe `translateY(-2px)` e aprofunda a sombra. No popup, entrada em cascata (`noteReveal`, 350ms, atraso de 40ms por item até o 6º) — as folhas do caderno virando.
- **Compacto:** no portal, `max-width: 220px`, texto truncado com expansão no hover.

### Toast

- **Style:** pill de 12px de raio, padding `12px 16px`, DM Sans 500 13px, max-width 300px, sombra de toast, ícone SVG inline + texto. Fundo e tinta da família de feedback (sucesso/erro/atenção).
- **Behavior:** entra por slide (400ms), sai em fade após 2.7s. Canto superior direito, pilha vertical com gap 8px.

## Do's and Don'ts

### Do:

- **Do** manter o Verde Ofício (`#0B7D3B`) como a única cor de ação da interface, e o amarelo/azul apenas informando ou sinalizando.
- **Do** renderizar todo número de protocolo em Bricolage Grotesque 700, Verde Ofício, `letter-spacing: -0.2px`.
- **Do** usar o raio de 10px como padrão de botão, campo e cartão, exceto nos casos documentados (6px papel, 8px chip, 12px cartão de nota/toast, 16px modal).
- **Do** aplicar a dobra em toda nota adesiva, em qualquer tamanho e em qualquer superfície — é o que a torna papel.
- **Do** manter superfícies de chrome planas em repouso, com borda de 1px e diferença de tom entre Cartão Branco e Névoa.
- **Do** respeitar o piso de 11px em todo texto funcional, e 10.5px apenas em rótulo de apoio em caixa alta.
- **Do** usar SVG inline com `stroke: currentColor` para todos os ícones, e empacotar fontes localmente (sem requisição de rede).
- **Do** manter o mesmo sistema nos dois builds (Chrome e Firefox) — o DESIGN.md vale para os dois.

### Don't:

- **Don't** usar as seis cores pastéis fora do corpo de uma nota adesiva — nem em botão, nem em borda, nem em fundo de painel.
- **Don't** pintar fundo de nota com verde de marca, nem usar pastel como cor de ação.
- **Don't** aplicar sombra decorativa em superfície em repouso. Se não é resposta a estado, modal/toast, ou papel, não leva sombra.
- **Don't** construir visual de startup/SaaS: gradientes vibrantes em superfícies grandes, ilustrações 3D, glassmorphism, cartões flutuantes translúcidos, blobs.
- **Don't** virar cinza genérico de sistema operacional: painéis sem hierarquia, tipografia do browser, cinza puro sem a temperatura do Grafite.
- **Don't** fazer post-it infantil: fita adesiva, rabiscos, sombra de papel amassado, fonte manuscrita, emoji gigante como ícone, textura de grão.
- **Don't** reduzir texto funcional abaixo de 11px para ganhar espaço. Comprima conteúdo, não legibilidade.
- **Don't** redesenhar a tabela do PAT. A extensão se anexa à linha do protocolo e respeita o layout do portal — inclusive não quebrando o site.
- **Don't** usar emoji como interface. Emoji pode existir no texto que o servidor escreve; a interface se comunica com SVG e tipografia.
