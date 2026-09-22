/// <reference types="vite/client" />

type MenuAction = 'new' | 'open' | 'save' | 'save-as' | 'export-html' | 'export-pdf' | 'find';
interface ViewState { zoomFactor: number; fullScreen: boolean }
interface DesktopAPI {
  openFile(): Promise<{ path: string; content: string } | null>;
  saveFile(options: { path?: string; content: string; saveAs?: boolean }): Promise<{ path: string } | null>;
  exportFile(options: { format: 'html' | 'pdf'; html: string; name: string }): Promise<string | null>;
  confirmDiscard(): Promise<boolean>;
  setDirty(dirty: boolean): void;
  onMenuAction(callback: (action: MenuAction) => void): () => void;
  openExternal(url: string): Promise<void>;
  zoomPage(direction: -1 | 0 | 1): Promise<number>;
  setFullScreen(enabled: boolean): Promise<boolean>;
  getViewState(): Promise<ViewState>;
  onViewState(callback: (state: ViewState) => void): () => void;
}
interface Window { desktop?: DesktopAPI }
