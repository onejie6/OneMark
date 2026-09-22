import { app, BrowserWindow, dialog, ipcMain, Menu, shell, type IpcMainEvent, type IpcMainInvokeEvent, type MenuItemConstructorOptions } from 'electron';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { assertText, atomicWrite, isAllowedExternalUrl, MAX_DOCUMENT_BYTES, MAX_EXPORT_BYTES, safeFilename } from './files';

let mainWindow: BrowserWindow | null = null;
let dirty = false;
let closeDialogOpen = false;
const authorizedPaths = new Set<string>();
const rendererFile = path.join(__dirname, '../dist/index.html');
const developmentUrl = !app.isPackaged ? process.env.ELECTRON_RENDERER_URL : undefined;
const rendererUrl = developmentUrl || pathToFileURL(rendererFile).href;

function isRendererUrl(candidate: string): boolean {
  try {
    const actual = new URL(candidate);
    const expected = new URL(rendererUrl);
    return actual.protocol === expected.protocol && actual.host === expected.host && actual.pathname === expected.pathname;
  } catch {
    return false;
  }
}

function assertTrusted(event: IpcMainInvokeEvent | IpcMainEvent): void {
  if (!mainWindow || event.sender !== mainWindow.webContents || event.senderFrame !== event.sender.mainFrame || !isRendererUrl(event.senderFrame.url)) {
    throw new Error('拒绝来自未知页面的操作。');
  }
}

function windowOrThrow(): BrowserWindow {
  if (!mainWindow || mainWindow.isDestroyed()) throw new Error('窗口已关闭。');
  return mainWindow;
}

function sendMenuAction(action: string): void {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('menu:action', action);
}

function getViewState(): { zoomFactor: number; fullScreen: boolean } {
  const window = windowOrThrow();
  return { zoomFactor: window.webContents.getZoomFactor(), fullScreen: window.isFullScreen() };
}

function sendViewState(fullScreen?: boolean): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    const state = getViewState();
    if (fullScreen !== undefined) state.fullScreen = fullScreen;
    mainWindow.webContents.send('view:state', state);
  }
}

function zoomPage(direction: -1 | 0 | 1): number {
  const contents = windowOrThrow().webContents;
  const factor = direction === 0 ? 1 : Math.min(2, Math.max(0.5, Math.round((contents.getZoomFactor() + direction * 0.1) * 10) / 10));
  contents.setZoomFactor(factor);
  sendViewState();
  return factor;
}

async function confirmDiscard(): Promise<boolean> {
  if (!dirty) return true;
  const { response } = await dialog.showMessageBox(windowOrThrow(), {
    type: 'warning',
    title: '有尚未保存的修改',
    message: '要放弃尚未保存的修改吗？',
    detail: '选择“继续编辑”，可返回文档并按 Ctrl+S 保存。',
    buttons: ['继续编辑', '放弃更改'],
    defaultId: 0,
    cancelId: 0,
    noLink: true,
  });
  return response === 1;
}

async function confirmClose(): Promise<boolean> {
  if (!dirty) return true;
  const { response } = await dialog.showMessageBox(windowOrThrow(), {
    type: 'question',
    title: '退出 OneMark',
    message: '文档还没有保存到文件，要退出吗？',
    detail: '未保存的内容会保留为本机草稿，下次启动时恢复。也可以继续编辑，按 Ctrl+S 保存正式文件。',
    buttons: ['继续编辑', '退出并保留草稿'],
    defaultId: 0,
    cancelId: 0,
    noLink: true,
  });
  return response === 1;
}

function installMenu(): void {
  const template: MenuItemConstructorOptions[] = [
    ...(process.platform === 'darwin' ? [{ role: 'appMenu' as const }] : []),
    {
      label: '文件',
      submenu: [
        { label: '新建文档', accelerator: 'CmdOrCtrl+N', click: () => sendMenuAction('new') },
        { label: '打开…', accelerator: 'CmdOrCtrl+O', click: () => sendMenuAction('open') },
        { type: 'separator' },
        { label: '保存', accelerator: 'CmdOrCtrl+S', click: () => sendMenuAction('save') },
        { label: '另存为…', accelerator: 'CmdOrCtrl+Shift+S', click: () => sendMenuAction('save-as') },
        { type: 'separator' },
        { label: '导出 HTML…', click: () => sendMenuAction('export-html') },
        { label: '导出 PDF…', click: () => sendMenuAction('export-pdf') },
        { type: 'separator' },
        { role: process.platform === 'darwin' ? 'close' : 'quit', label: '退出' },
      ],
    },
    {
      label: '编辑',
      submenu: [
        { role: 'undo', label: '撤销' }, { role: 'redo', label: '重做' },
        { type: 'separator' },
        { role: 'cut', label: '剪切' }, { role: 'copy', label: '复制' }, { role: 'paste', label: '粘贴' }, { role: 'selectAll', label: '全选' },
        { type: 'separator' },
        { label: '查找', accelerator: 'CmdOrCtrl+F', click: () => sendMenuAction('find') },
      ],
    },
    {
      label: '视图',
      submenu: [
        { label: '实际大小', accelerator: 'CmdOrCtrl+0', click: () => { zoomPage(0); } },
        { label: '放大', accelerator: 'CmdOrCtrl+=', click: () => { zoomPage(1); } },
        { label: '缩小', accelerator: 'CmdOrCtrl+-', click: () => { zoomPage(-1); } },
        { type: 'separator' }, { role: 'togglefullscreen', label: '全屏' },
        ...(!app.isPackaged ? [{ role: 'toggleDevTools' as const, label: '开发者工具' }] : []),
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function registerHandlers(): void {
  ipcMain.handle('view:zoom', (event, direction: unknown) => {
    assertTrusted(event);
    if (direction !== -1 && direction !== 0 && direction !== 1) throw new Error('缩放参数无效。');
    return zoomPage(direction);
  });
  ipcMain.handle('view:fullscreen', (event, enabled: unknown) => {
    assertTrusted(event);
    if (typeof enabled !== 'boolean') throw new Error('全屏参数无效。');
    const window = windowOrThrow();
    window.setFullScreen(enabled);
    return window.isFullScreen();
  });
  ipcMain.handle('view:get-state', event => {
    assertTrusted(event);
    return getViewState();
  });

  ipcMain.handle('document:open', async (event) => {
    assertTrusted(event);
    const result = await dialog.showOpenDialog(windowOrThrow(), {
      title: '打开 Markdown 文档',
      properties: ['openFile'],
      filters: [{ name: 'Markdown / 文本', extensions: ['md', 'markdown', 'mdown', 'txt'] }, { name: '所有文件', extensions: ['*'] }],
    });
    if (result.canceled || !result.filePaths[0]) return null;
    const filePath = result.filePaths[0];
    if ((await stat(filePath)).size > MAX_DOCUMENT_BYTES) throw new Error('文件超过 20 MB，请选择较小的文档。');
    const content = (await readFile(filePath, 'utf8')).replace(/^\uFEFF/, '');
    assertText(content);
    authorizedPaths.add(path.resolve(filePath));
    return { path: filePath, content };
  });

  ipcMain.handle('document:save', async (event, request: unknown) => {
    assertTrusted(event);
    if (!request || typeof request !== 'object') throw new Error('保存参数无效。');
    const { content, path: requestedPath, saveAs } = request as Record<string, unknown>;
    assertText(content);
    if (requestedPath !== undefined && typeof requestedPath !== 'string') throw new Error('文件路径无效。');
    let filePath = typeof requestedPath === 'string' ? path.resolve(requestedPath) : undefined;
    if (!filePath || saveAs === true || !authorizedPaths.has(filePath)) {
      const result = await dialog.showSaveDialog(windowOrThrow(), {
        title: '保存 Markdown 文档',
        defaultPath: filePath || '未命名.md',
        filters: [{ name: 'Markdown 文档', extensions: ['md'] }, { name: '纯文本', extensions: ['txt'] }],
      });
      if (result.canceled || !result.filePath) return null;
      filePath = path.resolve(result.filePath);
    }
    await atomicWrite(filePath, content);
    authorizedPaths.add(filePath);
    return { path: filePath };
  });

  ipcMain.handle('document:export', async (event, request: unknown) => {
    assertTrusted(event);
    if (!request || typeof request !== 'object') throw new Error('导出参数无效。');
    const { format, html, name } = request as Record<string, unknown>;
    if (format !== 'html' && format !== 'pdf') throw new Error('不支持此导出格式。');
    assertText(html, MAX_EXPORT_BYTES);
    const result = await dialog.showSaveDialog(windowOrThrow(), {
      title: `导出 ${format.toUpperCase()}`,
      defaultPath: safeFilename(name, format),
      filters: [{ name: format.toUpperCase(), extensions: [format] }],
    });
    if (result.canceled || !result.filePath) return null;
    if (format === 'html') {
      await atomicWrite(result.filePath, html);
    } else {
      const printWindow = new BrowserWindow({
        show: false,
        webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true, javascript: false, partition: `pdf-${Date.now()}` },
      });
      printWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      printWindow.webContents.on('will-navigate', event => event.preventDefault());
      printWindow.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
      // PDF printing is offline: documents cannot contact remote hosts or read local files.
      printWindow.webContents.session.webRequest.onBeforeRequest((details, callback) => {
        callback({ cancel: !details.url.startsWith('data:') && !details.url.startsWith('about:') });
      });
      try {
        await printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
        const pdf = await printWindow.webContents.printToPDF({ printBackground: true, pageSize: 'A4', preferCSSPageSize: true, margins: { top: 0.5, bottom: 0.5, left: 0.5, right: 0.5 } });
        await atomicWrite(result.filePath, pdf);
      } finally {
        printWindow.destroy();
      }
    }
    return result.filePath;
  });

  ipcMain.handle('document:confirm-discard', async event => {
    assertTrusted(event);
    return confirmDiscard();
  });
  ipcMain.on('document:dirty', (event, value: unknown) => {
    try {
      assertTrusted(event);
      if (typeof value === 'boolean') {
        dirty = value;
        mainWindow?.setDocumentEdited(value);
      }
    } catch {
      // Drop untrusted asynchronous messages without crashing the main process.
    }
  });
  ipcMain.handle('navigation:external', async (event, url: unknown) => {
    assertTrusted(event);
    if (!isAllowedExternalUrl(url)) throw new Error('只能打开 HTTP、HTTPS 或邮件链接。');
    await shell.openExternal(url);
  });
}

async function createWindow(): Promise<void> {
  dirty = false;
  mainWindow = new BrowserWindow({
    title: 'OneMark · Markdown',
    width: 1400,
    height: 920,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#f6f7f9',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedExternalUrl(url)) void shell.openExternal(url).catch(() => undefined);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!isRendererUrl(url)) event.preventDefault();
  });
  mainWindow.webContents.on('will-attach-webview', event => event.preventDefault());
  // Keep keyboard, wheel and menu zoom on the same bounded scale.
  mainWindow.webContents.setZoomMode('isolated');
  mainWindow.webContents.setZoomFactor(1);
  void mainWindow.webContents.setVisualZoomLevelLimits(1, 1);
  mainWindow.webContents.on('zoom-changed', (event, direction) => {
    event.preventDefault();
    zoomPage(direction === 'in' ? 1 : -1);
  });
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown' || input.alt) return;
    if ((input.control || input.meta) && ['0', '=', '+', '-'].includes(input.key)) {
      // Consume the key before Chromium's built-in zoom and the menu accelerator.
      event.preventDefault();
      zoomPage(input.key === '0' ? 0 : input.key === '-' ? -1 : 1);
    } else if (input.key === 'F11' && !input.control && !input.meta && !input.shift) {
      event.preventDefault();
      const window = windowOrThrow();
      window.setFullScreen(!window.isFullScreen());
    }
  });
  mainWindow.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  mainWindow.on('enter-full-screen', () => sendViewState(true));
  mainWindow.on('leave-full-screen', () => sendViewState(false));
  mainWindow.on('ready-to-show', () => mainWindow?.show());
  mainWindow.on('close', event => {
    if (!dirty) return;
    event.preventDefault();
    if (closeDialogOpen) return;
    closeDialogOpen = true;
    void confirmClose().then(shouldClose => {
      if (shouldClose) {
        dirty = false;
        mainWindow?.close();
      }
    }).catch(() => undefined).finally(() => { closeDialogOpen = false; });
  });
  mainWindow.on('closed', () => { mainWindow = null; });
  await mainWindow.loadURL(rendererUrl);
}

void app.whenReady().then(async () => {
  registerHandlers();
  installMenu();
  await createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow();
  });
}).catch(error => {
  dialog.showErrorBox('启动失败', error instanceof Error ? error.message : String(error));
  app.quit();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
