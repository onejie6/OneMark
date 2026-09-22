import MarkdownIt, { type Token } from 'markdown-it'
import taskLists from 'markdown-it-task-lists'
// This small plugin has no published TypeScript declarations.
// @ts-expect-error markdown-it-texmath is a JavaScript plugin
import texmath from 'markdown-it-texmath'
import katex from 'katex'
import createDOMPurify from 'dompurify'
import hljs from 'highlight.js/lib/core'
import javascript from 'highlight.js/lib/languages/javascript'
import typescript from 'highlight.js/lib/languages/typescript'
import python from 'highlight.js/lib/languages/python'
import json from 'highlight.js/lib/languages/json'
import bash from 'highlight.js/lib/languages/bash'
import css from 'highlight.js/lib/languages/css'
import xml from 'highlight.js/lib/languages/xml'
import markdown from 'highlight.js/lib/languages/markdown'
import highlightCss from 'highlight.js/styles/github.css?inline'
import katexCss from 'katex/dist/katex.min.css?inline'

export interface OutlineItem {
  id: string
  text: string
  level: number
  /** Source line, starting at 1. */
  line: number
}

export interface DocumentStats {
  characters: number
  words: number
  lines: number
  readingMinutes: number
}

const languages = { javascript, typescript, python, json, bash, css, xml, markdown }
Object.entries(languages).forEach(([name, language]) => hljs.registerLanguage(name, language))

const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[char]!)

const parser = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
  highlight(code, language) {
    // Never put a user-controlled fence info string into an HTML attribute.
    const safeLanguage = /^[a-z0-9_-]+$/i.test(language) && hljs.getLanguage(language)
      ? language.toLowerCase() : 'plaintext'
    let highlighted = escapeHtml(code)
    if (safeLanguage !== 'plaintext') {
      try { highlighted = hljs.highlight(code, { language: safeLanguage, ignoreIllegals: true }).value }
      catch { /* Incomplete pasted code still renders as plain text. */ }
    }
    return `<pre class="code-block"><code class="hljs language-${safeLanguage}">${highlighted}</code></pre>`
  },
})
  .use(taskLists, { enabled: false, label: true })
  .use(texmath, {
    engine: katex,
    delimiters: 'dollars',
    katexOptions: { throwOnError: false, trust: false, strict: 'ignore', maxExpand: 1000, maxSize: 20 },
  })

function inlineText(tokens: Token[] = []): string {
  return tokens.map((token) => {
    if (token.children) return inlineText(token.children)
    if (token.type === 'softbreak' || token.type === 'hardbreak') return ' '
    if (token.type === 'html_inline') return ''
    return token.content
  }).join('').trim()
}

parser.core.ruler.after('inline', 'document_headings', (state) => {
  const used = new Set<string>()
  const outline: OutlineItem[] = []
  state.tokens.forEach((token, index) => {
    if (token.type !== 'heading_open') return
    const text = inlineText(state.tokens[index + 1]?.children ?? [])
    const slug = text.normalize('NFKC').toLowerCase()
      .replace(/[^\p{Letter}\p{Number}\s_-]/gu, '').trim().replace(/[\s_]+/g, '-') || 'section'
    const base = `md-${slug}`
    let id = base
    let suffix = 2
    while (used.has(id)) id = `${base}-${suffix++}`
    used.add(id)
    token.attrSet('id', id)
    outline.push({ id, text: text || '未命名章节', level: Number(token.tag.slice(1)), line: (token.map?.[0] ?? 0) + 1 })
  })
  state.env.outline = outline
})

const purifier = createDOMPurify(window)
const layoutProperties = new Set([
  'height', 'width', 'min-width', 'min-height', 'top', 'left', 'vertical-align',
  'margin-left', 'margin-right', 'margin-top', 'margin-bottom', 'padding-left', 'padding-right',
  'border-bottom-width', 'border-top-width', 'border-left-width', 'border-right-width',
])

purifier.addHook('uponSanitizeAttribute', (node, data) => {
  const name = data.attrName.toLowerCase()
  if (name === 'href' || name === 'src' || name === 'xlink:href') {
    const value = data.attrValue.trim().replace(/[\u0000-\u0020\u007f]/g, '')
    const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(value)?.[1]?.toLowerCase()
    // Raster data images are useful for portable notes. SVG data and local file URLs are excluded.
    const rasterData = node.nodeName.toLowerCase() === 'img' && name === 'src'
      && /^data:image\/(png|jpeg|gif|webp);base64,[a-z0-9+/=]+$/i.test(value)
    if (scheme && !['http', 'https', 'mailto', 'tel'].includes(scheme) && !rasterData) data.keepAttr = false
  }
  if (name === 'style') {
    // Keep KaTeX's numeric layout without permitting CSS URLs or page-covering positioning.
    data.attrValue = data.attrValue.split(';').filter((declaration) => {
      const [property, value] = declaration.split(':').map((part) => part.trim().toLowerCase())
      return property && value && ((layoutProperties.has(property) && /^-?[\d.]+(?:em|ex|px|%)?$/.test(value))
        || (property === 'position' && value === 'relative')
        || (['color', 'background-color', 'border-color'].includes(property) && /^(?:#[a-f0-9]{3,8}|[a-z]{1,30}|rgba?\([\d\s.,%]+\))$/.test(value)))
    }).join(';')
    if (!data.attrValue) data.keepAttr = false
  }
})
purifier.addHook('afterSanitizeAttributes', (node) => {
  if (node.nodeName.toLowerCase() === 'a') {
    node.setAttribute('rel', 'noopener noreferrer')
    node.removeAttribute('target')
  }
  if (node.nodeName.toLowerCase() === 'input') {
    node.setAttribute('type', 'checkbox')
    node.setAttribute('disabled', '')
  }
})

/** Converts untrusted Markdown into sanitized HTML suitable for the preview. */
export function renderMarkdown(source: string): string {
  return purifier.sanitize(parser.render(source, {}), {
    USE_PROFILES: { html: true, mathMl: true, svg: true },
    ADD_TAGS: ['eq', 'eqn'],
    FORBID_TAGS: ['style', 'script', 'iframe', 'object', 'embed', 'form', 'textarea', 'button', 'select', 'link', 'meta', 'base'],
    FORBID_ATTR: ['srcset', 'formaction', 'action', 'autofocus', 'name'],
    ALLOW_DATA_ATTR: false,
  })
}

export function getOutline(source: string): OutlineItem[] {
  const environment: { outline?: OutlineItem[] } = {}
  parser.parse(source, environment)
  return environment.outline ?? []
}

export function getStats(source: string): DocumentStats {
  const han = source.match(/\p{Script=Han}/gu) ?? []
  const otherWords = source.replace(/\p{Script=Han}/gu, ' ').match(/[\p{Letter}\p{Number}]+(?:['’-][\p{Letter}\p{Number}]+)*/gu) ?? []
  const words = han.length + otherWords.length
  return {
    characters: Array.from(source.replace(/\s/gu, '')).length,
    words,
    lines: source ? source.split(/\r\n|\r|\n/).length : 0,
    readingMinutes: words ? Math.max(1, Math.ceil(words / 300)) : 0,
  }
}

// Vite's explicit inline query makes exported formulas work without a network or sibling assets.
const fontAssets = import.meta.glob<string>('../../node_modules/katex/dist/fonts/*.woff2', {
  query: '?inline', import: 'default', eager: true,
})
const embeddedFonts = Object.entries(fontAssets).map(([path, url]) => {
  const match = /KaTeX_(.+)-([^.]+)\.woff2$/.exec(path)
  if (!match) return ''
  const [, family, variant] = match
  return `@font-face{font-family:KaTeX_${family};font-style:${variant.includes('Italic') ? 'italic' : 'normal'};font-weight:${variant.includes('Bold') ? '700' : '400'};src:url("${url}") format("woff2");font-display:swap;}`
}).join('\n')

const exportCss = `
:root{color-scheme:light}*{box-sizing:border-box}body{margin:0;background:#fff;color:#292d34;font:16px/1.85 -apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif}.markdown-body{max-width:860px;margin:0 auto;padding:64px 48px 96px;overflow-wrap:break-word}h1,h2,h3,h4,h5,h6{line-height:1.4;color:#20252c;scroll-margin-top:24px}h1{font-size:2.25em;margin:0 0 .8em;letter-spacing:-.035em}h2{font-size:1.55em;margin-top:1.8em;border-bottom:1px solid #e8ebef;padding-bottom:.45em}h3{font-size:1.2em;margin-top:1.5em}p,ul,ol,blockquote,pre,table{margin:1.15em 0}a{color:#537866;text-decoration:none;border-bottom:1px solid #aac1b4}img{max-width:100%;height:auto;border-radius:8px}blockquote{margin-left:0;margin-right:0;padding:1px 20px;border-left:3px solid #849e8d;background:#f6f8f5;color:#5e6964}code{font-family:Consolas,"Cascadia Code",monospace;font-size:.88em;background:#f2f3f4;padding:2px 5px;border-radius:4px}pre{padding:20px 24px;background:#f6f7f8;border:1px solid #eceef0;border-radius:9px;overflow:auto;line-height:1.65}pre code.hljs{padding:0;background:transparent;font-size:13px}table{border-collapse:collapse;width:100%;font-size:.94em}th,td{padding:10px 14px;border:1px solid #e3e7e5;text-align:left}th{background:#f4f7f4;font-weight:600}tr:nth-child(even){background:#fafbfa}hr{border:0;border-top:1px solid #e3e7e5;margin:2em 0}li{padding-left:.2em}li+li{margin-top:.3em}.task-list-item{list-style:none}.task-list-item-checkbox{margin:0 .6em 0 -1.3em;accent-color:#63816c}eqn,.katex-display{display:block;overflow-x:auto;overflow-y:hidden;padding:.5em 0}eq{display:inline}.katex{font-size:1.08em}details{padding:12px 16px;border:1px solid #e3e7e5;border-radius:8px}summary{cursor:pointer;font-weight:600}@media(max-width:600px){.markdown-body{padding:32px 22px}h1{font-size:1.8em}pre{padding:16px}}@media print{.markdown-body{max-width:none;padding:0}pre,blockquote,tr{break-inside:avoid}h1,h2,h3{break-after:avoid}a{color:inherit;border:0}}
`

export function createExportHtml(source: string, title: string): string {
  const styles = `${highlightCss}\n${katexCss.replace(/@font-face\s*\{[^}]*\}/g, '')}\n${embeddedFonts}\n${exportCss}`
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https: http: data:; style-src 'unsafe-inline'; font-src data:; base-uri 'none'; form-action 'none'">
<meta name="referrer" content="no-referrer">
<title>${escapeHtml(title)}</title>
<style>${styles.replace(/<\/style/gi, '<\\/style')}</style>
</head>
<body><article class="markdown-body">${renderMarkdown(source)}</article></body>
</html>`
}
