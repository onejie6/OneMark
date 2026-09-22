import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import CodeMirror, { type ReactCodeMirrorRef } from '@uiw/react-codemirror';
import { markdown } from '@codemirror/lang-markdown';
import { languages } from '@codemirror/language-data';
import { EditorView, keymap, type ViewUpdate } from '@codemirror/view';
import { insertTab } from '@codemirror/commands';
import { openSearchPanel, search } from '@codemirror/search';
import { Bold, Italic, Heading2, Link, Code2, Quote, List, ListChecks, Table2, FilePlus2, FolderOpen, Save, ChevronDown, ChevronRight, PanelLeftClose, PanelLeftOpen, Columns2, FileText, Eye, Moon, Sun, Download, Check, ChevronsLeftRight, Search, BookOpen, X, Keyboard, ArrowUpRight, Plus, AlignLeft, CircleHelp, Undo2, Redo2, Maximize, Minimize, ScanEye } from 'lucide-react';
import { undo, redo } from '@codemirror/commands';
import { createExportHtml, getOutline, getStats, renderMarkdown } from './lib/markdown';
import { DRAFT_KEY, documentTitle, download, fileName, readDraft } from './lib/session';
import { SAMPLE_MARKDOWN } from './sample';

type Mode = 'split' | 'edit' | 'read';
type Notice = { text: string; error?: boolean };
const SHORTCUTS = [['Ctrl / ⌘ + N', '新建文档'], ['Ctrl / ⌘ + O', '打开 Markdown'], ['Ctrl / ⌘ + S', '保存文档'], ['Ctrl / ⌘ + Shift + S', '另存为'], ['Ctrl / ⌘ + F', '查找与替换'], ['Ctrl / ⌘ + B', '加粗'], ['Ctrl / ⌘ + I', '斜体'], ['Ctrl / ⌘ + Shift + V', '切换阅读模式'], ['Ctrl + 滚轮 / + / −', '缩放页面'], ['Ctrl / ⌘ + 0', '恢复 100%'], ['Ctrl / ⌘ + Shift + F', '沉浸阅读'], ['F11', '窗口全屏'], ['Esc', '退出沉浸 / 全屏']];
const EDITOR_SETUP = { foldGutter: false, highlightActiveLine: true, autocompletion: false };

function safeSetting(key: string, fallback: string) { try { return localStorage.getItem(key) || fallback; } catch { return fallback; } }

export default function App() {
  const [initial] = useState(() => readDraft(localStorage));
  const [source, setSource] = useState(initial?.content ?? SAMPLE_MARKDOWN);
  const [savedContent, setSavedContent] = useState<string | null>(initial ? null : SAMPLE_MARKDOWN);
  const [name, setName] = useState(initial?.name ?? '使用说明.md');
  const [path, setPath] = useState<string>();
  const [documentVersion, setDocumentVersion] = useState(0);
  const [mode, setMode] = useState<Mode>('split');
  const [sidebar, setSidebar] = useState(true);
  const [immersive, setImmersive] = useState(false);
  const [fullScreen, setFullScreen] = useState(false);
  const [zoomFactor, setZoomFactor] = useState(1);
  const previousMode = useRef<Mode>('split');
  const [dark, setDark] = useState(() => safeSetting('onemark.theme', 'light') === 'dark');
  const [sync, setSync] = useState(true);
  const [split, setSplit] = useState(50);
  const [exportMenu, setExportMenu] = useState(false);
  const [help, setHelp] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(initial ? { text: '已恢复上次的未保存草稿，请保存到文件。' } : null);
  const [cursor, setCursor] = useState({ line: 1, column: 1 });
  const [activeHeading, setActiveHeading] = useState('');
  const editor = useRef<ReactCodeMirrorRef>(null);
  const preview = useRef<HTMLDivElement>(null);
  const workspace = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const exportBox = useRef<HTMLDivElement>(null);
  const scrollLock = useRef(false);
  const busyRef = useRef(false);
  const dirty = source !== savedContent;
  const deferredSource = useDeferredValue(source);
  const html = useMemo(() => renderMarkdown(deferredSource), [deferredSource]);
  const outline = useMemo(() => getOutline(deferredSource), [deferredSource]);
  const stats = useMemo(() => getStats(source), [source]);
  const title = documentTitle(name);
  const notify = useCallback((text: string, error = false) => setNotice({ text, error }), []);

  const zoomPage = useCallback((direction: -1 | 0 | 1) => {
    if (window.desktop) {
      void window.desktop.zoomPage(direction).then(setZoomFactor).catch(error => notify(String(error), true));
    } else {
      setZoomFactor(current => direction === 0 ? 1 : Math.max(0.5, Math.min(2, Math.round((current + direction * 0.1) * 10) / 10)));
    }
  }, [notify]);
  const changeFullScreen = useCallback((enabled: boolean) => {
    if (window.desktop) {
      void window.desktop.setFullScreen(enabled).then(setFullScreen).catch(error => notify(String(error), true));
    } else {
      const operation = enabled ? document.documentElement.requestFullscreen() : document.fullscreenElement ? document.exitFullscreen() : Promise.resolve();
      void operation.catch(() => notify('浏览器未允许全屏，可使用 F11。', true));
    }
  }, [notify]);
  const enterImmersive = () => {
    previousMode.current = mode;
    setMode('read'); setImmersive(true); setHelp(false); setExportMenu(false);
    requestAnimationFrame(() => document.querySelector<HTMLButtonElement>('[aria-label="退出沉浸阅读"]')?.focus());
  };
  const exitImmersive = () => {
    setImmersive(false); setMode(previousMode.current);
    if (fullScreen) changeFullScreen(false);
  };
  const viewActions = useRef({ immersive, fullScreen, enterImmersive, exitImmersive, changeFullScreen });
  viewActions.current = { immersive, fullScreen, enterImmersive, exitImmersive, changeFullScreen };
  useEffect(() => {
    const wheel = (event: WheelEvent) => {
      if (!(event.ctrlKey || event.metaKey) || !event.deltaY) return;
      event.preventDefault();
      zoomPage(event.deltaY < 0 ? 1 : -1);
    };
    window.addEventListener('wheel', wheel, { passive: false, capture: true });
    return () => window.removeEventListener('wheel', wheel, { capture: true });
  }, [zoomPage]);
  useEffect(() => {
    if (window.desktop) {
      const update = (state: { zoomFactor: number; fullScreen: boolean }) => { setZoomFactor(state.zoomFactor); setFullScreen(state.fullScreen); };
      void window.desktop.getViewState().then(update).catch(() => undefined);
      return window.desktop.onViewState(update);
    }
    const update = () => setFullScreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', update);
    return () => document.removeEventListener('fullscreenchange', update);
  }, []);
  useEffect(() => {
    if (window.desktop) return;
    document.documentElement.style.zoom = String(zoomFactor);
    document.documentElement.style.setProperty('--browser-zoom', String(zoomFactor));
    return () => { document.documentElement.style.zoom = ''; document.documentElement.style.removeProperty('--browser-zoom'); };
  }, [zoomFactor]);

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    try { localStorage.setItem('onemark.theme', dark ? 'dark' : 'light'); } catch { /* optional setting */ }
  }, [dark]);
  useEffect(() => {
    document.title = `${dirty ? '● ' : ''}${name} — OneMark`;
    window.desktop?.setDirty(dirty);
  }, [dirty, name]);
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        if (dirty) localStorage.setItem(DRAFT_KEY, JSON.stringify({ content: source, name }));
        else localStorage.removeItem(DRAFT_KEY);
      } catch { notify('草稿缓存空间不足，请及时保存文件。', true); }
    }, 400);
    return () => clearTimeout(timer);
  }, [source, name, dirty, notify]);
  useEffect(() => {
    const persist = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ content: source, name })); } catch { /* native dirty prompt still protects document */ }
      if (!window.desktop) { event.preventDefault(); event.returnValue = ''; }
    };
    window.addEventListener('beforeunload', persist);
    return () => window.removeEventListener('beforeunload', persist);
  }, [source, name, dirty]);
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(null), 4500); return () => clearTimeout(timer); }, [notice]);
  useEffect(() => {
    if (!exportMenu) return;
    const close = (e: PointerEvent) => { if (!exportBox.current?.contains(e.target as Node)) setExportMenu(false); };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [exportMenu]);

  const run = async (action: () => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true);
    try { await action(); } catch (error) { notify(error instanceof Error ? error.message : '操作失败，请重试。', true); }
    finally { busyRef.current = false; setBusy(false); }
  };
  const canReplace = async () => !dirty || (window.desktop ? await window.desktop.confirmDiscard() : window.confirm('当前文档尚未保存，确定放弃修改吗？'));
  const replaceDocument = (content: string, nextName: string, nextPath?: string) => {
    setImmersive(false);
    setSource(content); setSavedContent(content); setName(nextName); setPath(nextPath); setActiveHeading('');
    setDocumentVersion(value => value + 1); setCursor({ line: 1, column: 1 });
    preview.current?.scrollTo(0, 0);
    editor.current?.view?.dispatch({ selection: { anchor: 0 }, scrollIntoView: true });
  };
  const newFile = () => run(async () => {
    if (await canReplace()) { replaceDocument('', '未命名.md'); setMode('split'); requestAnimationFrame(() => editor.current?.view?.focus()); }
  });
  const openFile = () => run(async () => {
    if (!await canReplace()) return;
    if (window.desktop) {
      const file = await window.desktop.openFile();
      if (file) { replaceDocument(file.content, fileName(file.path), file.path); notify('文档已打开'); }
    } else fileInput.current?.click();
  });
  const readFile = (file: File, checkDirty = true) => run(async () => {
    if (!/\.(md|markdown|txt)$/i.test(file.name)) throw new Error('请打开 .md、.markdown 或 .txt 文件。');
    if (file.size > 10 * 1024 * 1024) throw new Error('文件超过 10 MB，请选择较小的文档。');
    if (checkDirty && !await canReplace()) return;
    replaceDocument(await file.text(), file.name);
    notify('文档已导入，保存时可选择文件位置');
  });
  const saveFile = (saveAs = false) => run(async () => {
    const snapshot = source;
    if (window.desktop) {
      const result = await window.desktop.saveFile({ path, content: snapshot, saveAs });
      if (!result) return;
      setPath(result.path); setName(fileName(result.path));
    } else download(snapshot, name, 'text/markdown;charset=utf-8');
    setSavedContent(snapshot); notify('Markdown 已保存');
  });
  const exportFile = (format: 'html' | 'pdf') => run(async () => {
    setExportMenu(false);
    if (window.desktop) {
      const result = await window.desktop.exportFile({ format, html: createExportHtml(source, title), name: title });
      if (result) notify(`${format.toUpperCase()} 已导出`);
    } else if (format === 'html') { download(createExportHtml(source, title), `${title}.html`, 'text/html;charset=utf-8'); notify('HTML 已导出'); }
    else { window.print(); }
  });
  const format = useCallback((before: string, after = '', placeholder = '文字', block = false) => {
    if (busyRef.current) return;
    const view = editor.current?.view;
    if (!view) return;
    const selection = view.state.selection.main;
    const text = view.state.sliceDoc(selection.from, selection.to) || placeholder;
    const prefix = block && selection.from > 0 && view.state.doc.lineAt(selection.from).from !== selection.from ? '\n' : '';
    view.dispatch({ changes: { from: selection.from, to: selection.to, insert: prefix + before + text + after }, selection: { anchor: selection.from + prefix.length + before.length, head: selection.from + prefix.length + before.length + text.length } });
    view.focus();
  }, []);
  const find = () => { setImmersive(false); if (mode === 'read') setMode('split'); requestAnimationFrame(() => { const view = editor.current?.view; if (view) openSearchPanel(view); }); };
  const actions = useRef({ newFile, openFile, saveFile, exportFile, find });
  actions.current = { newFile, openFile, saveFile, exportFile, find };
  useEffect(() => window.desktop?.onMenuAction(action => {
    const current = actions.current;
    if (action === 'new') void current.newFile();
    if (action === 'open') void current.openFile();
    if (action === 'save' || action === 'save-as') void current.saveFile(action === 'save-as');
    if (action === 'export-html' || action === 'export-pdf') void current.exportFile(action === 'export-html' ? 'html' : 'pdf');
    if (action === 'find') current.find();
  }), []);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const view = viewActions.current;
      if (event.key === 'Escape') {
        setHelp(false); setExportMenu(false);
        if (view.immersive) view.exitImmersive();
        else if (view.fullScreen) view.changeFullScreen(false);
      }
      if (event.key === 'F11' && !window.desktop) { event.preventDefault(); view.changeFullScreen(!view.fullScreen); }
      if (!(event.ctrlKey || event.metaKey)) return;
      const key = event.key.toLowerCase();
      if (key === 'f' && event.shiftKey) { event.preventDefault(); view.immersive ? view.exitImmersive() : view.enterImmersive(); return; }
      if (key === 'b' || key === 'i') { event.preventDefault(); format(key === 'b' ? '**' : '*', key === 'b' ? '**' : '*'); }
      if (key === 'v' && event.shiftKey) { event.preventDefault(); setImmersive(false); setMode(value => value === 'read' ? 'split' : 'read'); }
      if (!window.desktop) {
        if (['0', '=', '+', '-'].includes(key)) { event.preventDefault(); zoomPage(key === '0' ? 0 : key === '-' ? -1 : 1); }
        if (key === 's') { event.preventDefault(); void actions.current.saveFile(event.shiftKey); }
        if (key === 'o') { event.preventDefault(); void actions.current.openFile(); }
        if (key === 'n') { event.preventDefault(); void actions.current.newFile(); }
        if (key === 'f') { event.preventDefault(); actions.current.find(); }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [format, zoomPage]);

  const syncScroll = useCallback((from: HTMLElement, to: HTMLElement | null) => {
    if (!sync || !to || scrollLock.current || mode !== 'split') return;
    const distance = from.scrollHeight - from.clientHeight;
    if (distance <= 0) return;
    scrollLock.current = true;
    to.scrollTop = from.scrollTop / distance * (to.scrollHeight - to.clientHeight);
    requestAnimationFrame(() => { scrollLock.current = false; });
  }, [sync, mode]);
  const updateCursor = useCallback((update: ViewUpdate) => {
    if (!update.selectionSet && !update.docChanged) return;
    const line = update.state.doc.lineAt(update.state.selection.main.head);
    setCursor({ line: line.number, column: update.state.selection.main.head - line.from + 1 });
  }, []);
  const extensions = useMemo(() => [
    markdown({ codeLanguages: languages }),
    search({ top: true }),
    EditorView.lineWrapping,
    keymap.of([{ key: 'Tab', run: insertTab }]),
    EditorView.domEventHandlers({ scroll: (_event, view) => { syncScroll(view.scrollDOM, preview.current); } }),
    EditorView.theme({ '&': { fontSize: '14px', height: '100%', backgroundColor: 'transparent' }, '.cm-scroller': { fontFamily: '"Cascadia Code", "Consolas", monospace', lineHeight: '1.85', overflow: 'auto' }, '.cm-content': { padding: '26px 0 180px', caretColor: '#555555' }, '.cm-line': { padding: '0 26px 0 12px' }, '.cm-gutters': { backgroundColor: 'transparent', border: 'none', color: '#adafa9', fontSize: '11px' }, '.cm-lineNumbers .cm-gutterElement': { padding: '0 12px 0 18px', minWidth: '42px' }, '.cm-activeLine': { backgroundColor: dark ? '#ffffff05' : '#55555505' }, '.cm-activeLineGutter': { backgroundColor: 'transparent', color: '#707070' }, '&.cm-focused': { outline: 'none' } }, { dark }),
  ], [syncScroll, dark]);
  const goToHeading = (item: (typeof outline)[number]) => {
    setActiveHeading(item.id);
    scrollLock.current = true;
    preview.current?.querySelector(`[id="${CSS.escape(item.id)}"]`)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    const view = editor.current?.view;
    if (view && item.line <= view.state.doc.lines) { const position = view.state.doc.line(item.line).from; view.dispatch({ selection: { anchor: position }, effects: EditorView.scrollIntoView(position, { y: 'start' }) }); }
    setTimeout(() => { scrollLock.current = false; }, 500);
  };

  return <div className={`app ${sidebar ? '' : 'sidebar-hidden'} ${immersive ? 'immersive' : ''}`}>
    <input ref={fileInput} type="file" accept=".md,.markdown,.txt" hidden onChange={event => { const file = event.target.files?.[0]; if (file) void readFile(file, false); event.target.value = ''; }} />
    {sidebar && <aside className="sidebar">
      <a className="brand" href="#" onClick={e => e.preventDefault()} aria-label="OneMark"><span className="brand-icon"><BookOpen size={21} strokeWidth={1.7} /></span><strong>OneMark<span>Markdown</span></strong></a>
      <button className="new-document" onClick={newFile} disabled={busy}><Plus size={16} /> 新建文档 <kbd>Ctrl N</kbd></button>
      <div className="sidebar-label">文档 <span>LOCAL</span></div>
      <button className="document-item selected" title={path || name} onClick={() => { if (mode === 'read') setMode('split'); editor.current?.view?.focus(); }}><FileText size={17} /><span>{name}</span>{dirty && <i className="dirty-dot" />}</button>
      <button className="document-item open-item" onClick={openFile} disabled={busy}><FolderOpen size={17} /><span>打开本地文件</span><ArrowUpRight size={13} /></button>
      <div className="sidebar-rule" />
      <div className="sidebar-label outline-label">文档大纲 <span>{outline.length.toString().padStart(2, '0')}</span></div>
      <nav className="outline" aria-label="文档大纲">{outline.length ? outline.map(item => <button key={item.id} className={`${activeHeading === item.id ? 'active' : ''} level-${item.level}`} style={{ paddingLeft: 13 + (item.level - 1) * 12 }} title={item.text} onClick={() => goToHeading(item)}><span className="outline-marker" />{item.text}</button>) : <p className="empty-outline">使用 # 添加标题<br />目录会显示在这里</p>}</nav>
      <div className="sidebar-bottom"><div className="local-status"><span /> 文件保存在本机</div><button onClick={() => setHelp(true)}><CircleHelp size={15} /> 使用说明 <ArrowUpRight size={13} /></button></div>
    </aside>}
    <main className="main">
      <header className="topbar">
        <div className="breadcrumb"><button className="icon-button" title={sidebar ? '收起侧栏' : '展开侧栏'} aria-label={sidebar ? '收起侧栏' : '展开侧栏'} onClick={() => setSidebar(!sidebar)}>{sidebar ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}</button><span className="breadcrumb-space">文档</span><ChevronRight size={13} /><span className="current-filename">{name}</span><span className={`save-state ${dirty ? 'unsaved' : ''}`}>{dirty ? '未保存' : '已就绪'}</span></div>
        <div className="header-actions">{zoomFactor !== 1 && <button className="icon-button zoom-reset" aria-label="恢复默认缩放" title="恢复 100%（Ctrl+0）" onClick={() => zoomPage(0)}>{Math.round(zoomFactor * 100)}%</button>}<button className="icon-button theme-button" title={dark ? '浅色主题' : '深色主题'} aria-label={dark ? '浅色主题' : '深色主题'} onClick={() => setDark(!dark)}>{dark ? <Sun size={17} /> : <Moon size={17} />}</button><div ref={exportBox} className="export-wrap"><button className="secondary-button" onClick={() => setExportMenu(!exportMenu)} aria-expanded={exportMenu} disabled={busy}><Download size={15} /> 导出 <ChevronDown size={12} /></button>{exportMenu && <div className="dropdown" role="menu"><button role="menuitem" onClick={() => exportFile('html')}><Code2 size={16} /><span>HTML 网页<small>完整排版 · 离线可读</small></span></button><button role="menuitem" onClick={() => exportFile('pdf')}><FileText size={16} /><span>PDF 文档<small>适合分享与打印</small></span></button><button role="menuitem" onClick={() => { setExportMenu(false); void saveFile(true); }}><Save size={16} /><span>Markdown 源文件<small>另存一份 .md 文档</small></span></button></div>}</div><button className="primary-button" onClick={() => saveFile()} disabled={busy}><Save size={15} /> {busy ? '处理中…' : '保存'}</button></div>
      </header>
      <section className="document-header"><div><div className="eyebrow"><span /> MARKDOWN</div><h1>{title}<span className="title-dot">.</span></h1><p>编辑 Markdown，实时查看预览。</p></div><div className="mode-switch" aria-label="视图模式"><button className={mode === 'edit' ? 'active' : ''} aria-pressed={mode === 'edit'} onClick={() => setMode('edit')}><Code2 size={15} /> 编辑</button><button className={mode === 'split' ? 'active' : ''} aria-pressed={mode === 'split'} onClick={() => setMode('split')}><Columns2 size={15} /> 双栏</button><button className={mode === 'read' ? 'active' : ''} aria-pressed={mode === 'read'} onClick={() => setMode('read')}><Eye size={15} /> 阅读</button><button aria-label="沉浸阅读" title="隐藏工具栏，沉浸阅读（Ctrl+Shift+F）" onClick={enterImmersive}><ScanEye size={16} /></button></div></section>
      <div className="workspace-shell" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); const file = e.dataTransfer.files[0]; if (file) void readFile(file); }}>
        <div className="formatbar"><div className="format-tools"><button title="撤销" aria-label="撤销" disabled={mode === 'read' || busy} onClick={() => { const view = editor.current?.view; if (view) undo(view); }}><Undo2 size={16} /></button><button title="重做" aria-label="重做" disabled={mode === 'read' || busy} onClick={() => { const view = editor.current?.view; if (view) redo(view); }}><Redo2 size={16} /></button><span className="tool-divider" />{[
          { icon: Heading2, label: '二级标题', before: '## ', block: true }, { icon: Bold, label: '加粗', before: '**', after: '**' }, { icon: Italic, label: '斜体', before: '*', after: '*' }, { icon: Quote, label: '引用', before: '> ', block: true },
          { icon: Link, label: '插入链接', before: '[', after: '](https://example.com)', placeholder: '链接文字' }, { icon: Code2, label: '代码块', before: '```typescript\n', after: '\n```', placeholder: 'const hello = "world";', block: true },
          { icon: List, label: '无序列表', before: '- ', block: true }, { icon: ListChecks, label: '待办事项', before: '- [ ] ', placeholder: '待办事项', block: true }, { icon: Table2, label: '插入表格', before: '', placeholder: '| 标题 | 内容 |\n| --- | --- |\n| 示例 | 文字 |', block: true },
        ].map(tool => <button key={tool.label} title={tool.label} aria-label={tool.label} disabled={mode === 'read' || busy} onClick={() => format(tool.before, tool.after, tool.placeholder, tool.block)}><tool.icon size={16} /></button>)}</div><div className="format-right"><button className={`sync-button ${sync ? 'enabled' : ''}`} onClick={() => setSync(!sync)} aria-pressed={sync} title="按滚动比例同步双栏"><ChevronsLeftRight size={15} /><span>同步滚动</span></button><span className="tool-divider" /><button className="icon-button" title="查找与替换" aria-label="查找与替换" onClick={find}><Search size={16} /></button></div></div>
        <div ref={workspace} className={`workspace mode-${mode}`} style={{ '--split': `${split}%` } as React.CSSProperties}>
          <section className="editor-pane"><div className="pane-label"><span><Code2 size={13} /> MARKDOWN</span><span className="pane-meta">.md</span></div><CodeMirror key={documentVersion} ref={editor} value={source} height="100%" theme={dark ? 'dark' : 'light'} extensions={extensions} onChange={setSource} readOnly={busy} placeholder="输入或粘贴 Markdown…" basicSetup={EDITOR_SETUP} onUpdate={updateCursor} aria-label="Markdown 编辑器" /></section>
          <div className="splitter" role="separator" aria-label="调整双栏宽度" aria-orientation="vertical" aria-valuemin={28} aria-valuemax={72} aria-valuenow={split} tabIndex={0} onKeyDown={e => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); setSplit(value => Math.min(72, Math.max(28, value + (e.key === 'ArrowLeft' ? -2 : 2)))); } }} onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); }} onPointerMove={e => { if (!e.currentTarget.hasPointerCapture(e.pointerId) || !workspace.current) return; const bounds = workspace.current.getBoundingClientRect(); setSplit(Math.min(72, Math.max(28, (e.clientX - bounds.left) / bounds.width * 100))); }} onPointerUp={e => e.currentTarget.releasePointerCapture(e.pointerId)}><span /></div>
          <section className="preview-pane"><div className="pane-label"><span><Eye size={13} /> 预览</span><span className="live-label"><i /> 实时呈现</span></div><div ref={preview} className="preview-scroll" onScroll={event => syncScroll(event.currentTarget, editor.current?.view?.scrollDOM ?? null)} onClick={event => { const anchor = (event.target as HTMLElement).closest('a'); if (!anchor) return; const href = anchor.getAttribute('href'); if (!href) return; event.preventDefault(); if (href.startsWith('#')) { try { const id = decodeURIComponent(href.slice(1)); preview.current?.querySelector(`[id="${CSS.escape(id)}"]`)?.scrollIntoView({ behavior: 'smooth' }); } catch { /* malformed fragment */ } } else if (/^https?:\/\//i.test(href) || /^mailto:/i.test(href)) { if (window.desktop) void window.desktop.openExternal(href).catch(error => notify(String(error), true)); else window.open(href, '_blank', 'noopener,noreferrer'); } else notify('暂不支持打开相对路径链接，请使用完整网址。'); }}><article className="markdown-body" data-testid="preview" dangerouslySetInnerHTML={{ __html: html }} />{!source.trim() && <div className="empty-preview"><span><FilePlus2 size={28} strokeWidth={1.3} /></span><h2>空白文档</h2><p>在左侧输入内容后，这里会显示预览。</p><small>支持 Markdown、表格、代码和数学公式</small></div>}</div></section>
        </div>
      </div>
      <footer className="statusbar"><div><span className="status-dot" />{dirty ? '草稿自动恢复已开启' : '本地写作'}<span className="status-divider" /><span>{stats.characters.toLocaleString()} 字符</span><span>{stats.words.toLocaleString()} 字</span><span className="read-time">约 {stats.readingMinutes} 分钟阅读</span></div><div><button className="zoom-reset" title="恢复 100%（Ctrl+0）" aria-label="恢复默认缩放" onClick={() => zoomPage(0)}>{Math.round(zoomFactor * 100)}%</button><span className="cursor-position">行 {cursor.line}，列 {cursor.column}</span><span className="status-divider" /><span>UTF-8</span><button title="快捷键" aria-label="快捷键" onClick={() => setHelp(true)}><Keyboard size={16} /></button></div></footer>
    </main>
    {immersive && <div className="reading-controls" aria-label="阅读工具">
      <button aria-label="恢复默认缩放" title="恢复 100%（Ctrl+0）" onClick={() => zoomPage(0)}>{Math.round(zoomFactor * 100)}%</button>
      <button aria-label={fullScreen ? '退出全屏' : '全屏显示'} title={fullScreen ? '退出全屏（F11）' : '全屏显示（F11）'} onClick={() => changeFullScreen(!fullScreen)}>{fullScreen ? <Minimize size={16} /> : <Maximize size={16} />}</button>
      <button aria-label="退出沉浸阅读" title="显示工具栏（Esc）" onClick={exitImmersive}><X size={16} /><span>退出</span></button>
    </div>}
    {notice && <div className={`toast ${notice.error ? 'error' : ''}`} role={notice.error ? 'alert' : 'status'}>{notice.error ? <CircleHelp size={17} /> : <Check size={17} />}<span>{notice.text}</span><button onClick={() => setNotice(null)} aria-label="关闭提示"><X size={14} /></button></div>}
    {help && <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget) setHelp(false); }}><section className="help-modal" role="dialog" aria-modal="true" aria-label="使用说明"><button className="modal-close icon-button" autoFocus onClick={() => setHelp(false)} aria-label="关闭指南"><X size={19} /></button><div className="modal-symbol"><AlignLeft size={25} /></div><h2>使用说明</h2><p>在左侧编辑，右侧查看预览。支持拖入 Markdown 文件。</p><div className="shortcut-list">{SHORTCUTS.map(([key, label]) => <div key={key}><span>{label}</span><kbd>{key}</kbd></div>)}</div><p className="help-note">支持标题、表格、任务列表、代码高亮和 LaTeX 公式。草稿保存在本机，正式文件使用「保存」写入磁盘。</p><button className="primary-button" onClick={() => setHelp(false)}>知道了 <ChevronRight size={15} /></button></section></div>}
  </div>;
}




