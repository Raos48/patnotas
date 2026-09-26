/**
 * Verificação dos ícones de interface do content.js.
 *
 * Roda em Node: `node test/icon-render.check.js`
 *
 * Cobre o bug de regressão de 2026-09-26: os ícones SVG foram passados para
 * `createActionButton`, que os gravava em `textContent` (o ralo correto para
 * emoji e para texto do usuário). O resultado era o markup escapado aparecendo
 * na tela — "&lt;svg width=..." em vez do ícone.
 *
 * Extrai svgIcone/createActionButton do content.js REAL e roda contra um DOM
 * mínimo, então o teste quebra se alguém voltar a enfiar HTML num ralo de texto.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

// ---------- DOM mínimo ----------
function makeEl(tag) {
  const el = {
    tagName: String(tag).toUpperCase(),
    nodeType: 1,
    className: '',
    title: '',
    children: [],
    _text: null,
    _html: null,
    attrs: {},
    listeners: {},
    setAttribute(k, v) { this.attrs[k] = String(v); },
    getAttribute(k) { return this.attrs[k]; },
    addEventListener(t, fn) { (this.listeners[t] = this.listeners[t] || []).push(fn); },
    appendChild(n) { this.children.push(n); return n; },
  };
  Object.defineProperty(el, 'textContent', {
    get() { return this._text; },
    set(v) { this._text = String(v); this._html = null; this.children = []; },
  });
  Object.defineProperty(el, 'innerHTML', {
    get() { return this._html; },
    set(v) {
      this._html = String(v);
      this._text = null;
      // simulamos o parser: um nó filho "svg" se o markup parecer svg
      this.children = /<svg/i.test(this._html) ? [{ tagName: 'SVG', nodeType: 1, parsed: true, html: this._html }] : [];
    },
  });
  Object.defineProperty(el, 'firstElementChild', {
    get() { return this.children.find(c => c.nodeType === 1) || null; },
  });
  return el;
}

const document = {
  _made: [],
  createElement(tag) { const e = makeEl(tag); this._made.push(e); return e; },
};

// ---------- Extrair as funções reais do content.js ----------
const alvo = path.join(__dirname, '..', 'inss-notas-extensao', 'content', 'content.js');
const src = fs.readFileSync(alvo, 'utf8');

function extrair(nome, ehFuncaoDeclarada) {
  const re = new RegExp('function\\s+' + nome + '\\s*\\([\\s\\S]*?\\n\\}', 'm');
  const m = src.match(re);
  assert.ok(m, `não achei a função ${nome} em content.js`);
  return m[0];
}

const UI_ICONS = {
  note: '<svg data-ic="note"></svg>',
  edit: '<svg data-ic="edit"></svg>',
  trash: '<svg data-ic="trash"></svg>',
};

const codigo = extrair('svgIcone') + '\n' + extrair('createActionButton') + '\n';
const ctx = { document, UI_ICONS, console };
// eslint-disable-next-line no-new-func
const fn = new Function('document', 'UI_ICONS', 'console', codigo + '; return { svgIcone, createActionButton };');
const { svgIcone, createActionButton } = fn(document, UI_ICONS, console);

// ---------- Testes ----------
let falhas = 0;
function check(nome, cond, detalhe) {
  if (cond) console.log('   OK  ' + nome);
  else { console.log('   FALHA ' + nome + (detalhe ? ' — ' + detalhe : '')); falhas++; }
}

console.log('\nÍcones de interface (content.js)\n');

// 1. svgIcone devolve um NÓ, não string
const no = svgIcone('edit');
check('svgIcone devolve um nó DOM', no && no.nodeType === 1, `veio ${typeof no}`);
check('svgIcone lê do catálogo UI_ICONS', no && /<svg/.test(no.html || ''), no && no.html);

// 2. O BUG: ícone no botão não pode virar texto escapado
const btnIcone = createActionButton(svgIcone('trash'), 'Excluir nota', () => {});
const temSvgComoFilho = btnIcone.children.some(c => c.nodeType === 1);
const textoEscapado = btnIcone._text != null && /<svg/i.test(btnIcone._text);
check('ícone entra como NÓ filho do botão', temSvgComoFilho, 'filhos: ' + JSON.stringify(btnIcone.children.map(c => c.tagName)));
check('ícone NÃO aparece como texto escapado', !textoEscapado, 'textContent = ' + btnIcone._text);
check('botão tem aria-label', btnIcone.attrs['aria-label'] === 'Excluir nota', btnIcone.attrs['aria-label']);

// 3. Rótulo textual continua indo para textContent (caminho seguro)
const btnTexto = createActionButton('Salvar', 'Salvar nota', () => {});
check('rótulo de texto vai para textContent', btnTexto._text === 'Salvar');
check('rótulo de texto não gera filho de markup', btnTexto.children.length === 0);

// 4. XSS: dado do usuário jamais passa por innerHTML
const injecao = '<img src=x onerror=alert(1)>';
const btnXss = createActionButton(injecao, 'titulo', () => {});
check('texto malicioso vai para textContent (escapado)', btnXss._text === injecao);
check('texto malicioso NÃO é parseado como HTML', btnXss.children.length === 0);

// 5. Chave de ícone desconhecida não explode nem vaza
const noRuim = svgIcone('naoExiste');
check('chave desconhecida devolve vazio', noRuim == null, String(noRuim));
const btnVazio = createActionButton(svgIcone('naoExiste'), 'x', () => {});
check('botão sem ícone continua criando', btnVazio && btnVazio.className === 'inss-nota-btn');

// 6. Nenhum call site passa string de UI_ICONS para createActionButton
const chamadas = src.match(/createActionButton\([^)]*/g) || [];
const comString = chamadas.filter(c => /createActionButton\(\s*UI_ICONS\./.test(c) || /createActionButton\(\s*['"`]/.test(c));
check('nenhum call site passa UI_ICONS.* como string', comString.length === 0, JSON.stringify(comString));

// 7. Nenhum innerHTML recebe UI_ICONS diretamente fora de svgIcone
const innerHTMLUIcons = (src.match(/[A-Za-z_$][\w$]*\.innerHTML\s*=[^\n]*UI_ICONS[^\n]*/g) || []);
const foraDeSvgIcone = innerHTMLUIcons.filter(l => !/alvo\.innerHTML/.test(l));
check('innerHTML só recebe UI_ICONS dentro de svgIcone', foraDeSvgIcone.length === 0, JSON.stringify(foraDeSvgIcone));

console.log('');
if (falhas) {
  console.log(falhas + ' falha(s)');
  process.exit(1);
}
console.log('7/7 — ícones renderizam como nó, texto continua escapado');
