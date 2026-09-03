import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Local file storage for uploaded scans.
 *
 * Scans stay on the machine running the app — never a cloud bucket. That is
 * the data-sovereignty position in docs/03_Security_Access.md, not an
 * incidental choice.
 */

export function uploadDir(): string {
  return process.env.UPLOAD_DIR ?? "./uploads";
}

const EXTENSION_BY_TYPE: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "application/pdf": ".pdf",
  "image/svg+xml": ".svg",
};

export const CONTENT_TYPE_BY_EXTENSION: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".pdf": "application/pdf",
  ".svg": "image/svg+xml",
};

export function extensionFor(mimeType: string, filename: string): string {
  const known = EXTENSION_BY_TYPE[mimeType];
  if (known) return known;
  const fromName = path.extname(filename).toLowerCase();
  return CONTENT_TYPE_BY_EXTENSION[fromName] ? fromName : ".bin";
}

/**
 * Writes an uploaded file and returns its stored path.
 *
 * The stored name is derived from the document id, never from user input, so a
 * crafted filename cannot escape the upload directory or collide with another
 * record's scan. The original filename is kept on the Document row for display.
 */
export async function saveUpload(
  documentId: string,
  bytes: ArrayBuffer,
  mimeType: string,
  originalName: string,
): Promise<string> {
  const dir = path.join(uploadDir(), "documents");
  await mkdir(dir, { recursive: true });

  const filename = `${documentId}${extensionFor(mimeType, originalName)}`;
  await writeFile(path.join(dir, filename), Buffer.from(bytes));

  return path.posix.join(
    uploadDir().replace(/^\.\//, ""),
    "documents",
    filename,
  );
}

/**
 * Resolves a stored filePath to an absolute path, refusing anything that
 * escapes the upload directory. Defence in depth: filePath comes from our own
 * database, but a traversal bug there must not become arbitrary file read.
 */
export function resolveStoredPath(filePath: string): string | null {
  const root = path.resolve(uploadDir());
  const resolved = path.resolve(filePath);

  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    return null;
  }
  return resolved;
}
