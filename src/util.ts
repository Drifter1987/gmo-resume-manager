export function splitLines(text: string | null | undefined): string[] {
  return String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export function splitList(text: string | null | undefined): string[] {
  return String(text || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export function dateRange(item: { start?: string; end?: string; current?: boolean }): string {
  const start = String(item.start || '').trim();
  const end = item.current ? 'Present' : String(item.end || '').trim();
  if (start && end) return start + ' — ' + end;
  return start || end;
}

export function slugify(text: string | null | undefined): string {
  const slug = String(text || 'resume')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'resume';
}

/** Replace characters the PDF base-14 fonts and strict XML readers dislike. */
export function ascii(value: string | null | undefined): string {
  return String(value == null ? '' : value)
    .replace(/[\u2018\u2019\u201B]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/\u00B7/g, '|')
    .replace(/\u00A0/g, ' ')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
}

export function escXml(value: string | null | undefined): string {
  return String(value == null ? '' : value).replace(/[&<>"']/g, (ch) => {
    switch (ch) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      default: return '&apos;';
    }
  });
}

export function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

export function fromBase64(value: string): string {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

export type SaveResult = 'downloaded' | 'opened' | 'cancelled';

interface WritableFile {
  write(data: Blob): Promise<void>;
  close(): Promise<void>;
}

interface FilePickerHandle {
  createWritable(): Promise<WritableFile>;
}

/**
 * Get a file out of the app.
 * Desktop browsers get a real save dialog (or a download link inside a hidden frame).
 * iOS cannot download blob files, so the caller shows an in-app sheet with a preview
 * and an explicit Open/Save link — predictable, and never replaces the page by itself.
 */
export async function saveBlob(blob: Blob, filename: string): Promise<SaveResult> {
  const dot = filename.lastIndexOf('.');
  const extension = dot === -1 ? '.txt' : filename.slice(dot);
  const type = blob.type || 'application/octet-stream';

  const picker = (window as unknown as { showSaveFilePicker?: (options: unknown) => Promise<FilePickerHandle> })
    .showSaveFilePicker;

  if (typeof picker === 'function') {
    try {
      const handle = await picker({
        suggestedName: filename,
        types: [{ description: 'Export', accept: { [type]: [extension] } }]
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return 'downloaded';
    } catch (error) {
      if ((error as DOMException)?.name === 'AbortError') return 'cancelled';
    }
  }

  const ua = navigator.userAgent || '';
  const isIos = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && 'ontouchend' in document);
  if (isIos) return 'opened';

  const url = URL.createObjectURL(blob);
  const frame = document.createElement('iframe');
  frame.style.display = 'none';
  frame.setAttribute('aria-hidden', 'true');
  document.body.appendChild(frame);

  const doc = frame.contentDocument;
  if (!doc || !doc.body) {
    frame.remove();
    return 'opened';
  }

  const link = doc.createElement('a');
  link.href = url;
  link.download = filename;
  doc.body.appendChild(link);
  link.click();

  setTimeout(() => {
    URL.revokeObjectURL(url);
    if (frame.parentNode) frame.parentNode.removeChild(frame);
  }, 60000);

  return 'downloaded';
}
