import { contextBridge, ipcRenderer } from 'electron';

const menuActions = new Set(['new', 'open', 'save', 'save-as', 'export-html', 'export-pdf', 'find']);

contextBridge.exposeInMainWorld('desktop', {
  openFile: () => ipcRenderer.invoke('document:open'),
  saveFile: (request: { path?: string; content: string; saveAs?: boolean }) => ipcRenderer.invoke('document:save', request),
  exportFile: (request: { format: 'html' | 'pdf'; html: string; name: string }) => ipcRenderer.invoke('document:export', request),
  confirmDiscard: () => ipcRenderer.invoke('document:confirm-discard'),
  setDirty: (dirty: boolean) => ipcRenderer.send('document:dirty', dirty),
  openExternal: (url: string) => ipcRenderer.invoke('navigation:external', url),
  zoomPage: (direction: -1 | 0 | 1) => ipcRenderer.invoke('view:zoom', direction),
  setFullScreen: (enabled: boolean) => ipcRenderer.invoke('view:fullscreen', enabled),
  getViewState: () => ipcRenderer.invoke('view:get-state'),
  onViewState: (callback: (state: { zoomFactor: number; fullScreen: boolean }) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, state: { zoomFactor: number; fullScreen: boolean }) => callback(state);
    ipcRenderer.on('view:state', listener);
    return () => ipcRenderer.removeListener('view:state', listener);
  },
  onMenuAction: (callback: (action: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, action: string) => {
      if (menuActions.has(action)) callback(action);
    };
    ipcRenderer.on('menu:action', listener);
    return () => ipcRenderer.removeListener('menu:action', listener);
  },
});
