export const DRAFT_KEY = 'onemark.draft.v1';
export type Draft = { content: string; name: string };

export function readDraft(storage: Pick<Storage, 'getItem'>): Draft | null {
  try {
    const value = JSON.parse(storage.getItem(DRAFT_KEY) || 'null');
    return value && typeof value.content === 'string' && typeof value.name === 'string' ? value : null;
  } catch { return null; }
}

export function fileName(path: string): string { return path.split(/[\\/]/).pop() || '未命名.md'; }
export function documentTitle(name: string): string { return name.replace(/\.(md|markdown|txt)$/i, '') || '未命名'; }

export function download(content: string, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
