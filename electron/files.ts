import { randomUUID } from 'node:crypto';
import { open, rename, unlink } from 'node:fs/promises';
import path from 'node:path';

export const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;
export const MAX_EXPORT_BYTES = 40 * 1024 * 1024;

export function assertText(value: unknown, limit = MAX_DOCUMENT_BYTES): asserts value is string {
  if (typeof value !== 'string' || Buffer.byteLength(value, 'utf8') > limit) {
    throw new Error(`文件内容无效或超过 ${Math.round(limit / 1024 / 1024)} MB。`);
  }
}

export function safeFilename(name: unknown, extension: 'html' | 'pdf'): string {
  const clean = (typeof name === 'string' ? name : '未命名')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
    .replace(/\.(md|markdown|mdown|txt|html|pdf)$/i, '')
    .replace(/[. ]+$/g, '')
    .trim()
    .slice(0, 100);
  const base = clean && !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(clean)
    ? clean
    : '未命名';
  return `${base}.${extension}`;
}

export function isAllowedExternalUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 4096 || /[\u0000-\u001f]/.test(value)) return false;
  try {
    const url = new URL(value);
    return ['https:', 'http:', 'mailto:'].includes(url.protocol) && !url.username && !url.password;
  } catch {
    return false;
  }
}

/** Write next to the destination, flush it, and replace only after a successful write. */
export async function atomicWrite(filePath: string, contents: string | Uint8Array): Promise<void> {
  const temporary = path.join(path.dirname(filePath), `.${path.basename(filePath)}.${randomUUID()}.tmp`);
  let handle;
  try {
    handle = await open(temporary, 'wx', 0o600);
    await handle.writeFile(contents);
    await handle.sync();
    await handle.close();
    handle = undefined;
    await rename(temporary, filePath);
  } finally {
    await handle?.close().catch(() => undefined);
    await unlink(temporary).catch(() => undefined);
  }
}
