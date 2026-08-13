// Muss mit lib/storage/storage.service.ts (validateUploadFile) übereinstimmen.
// Keine server-only-Imports, damit die Datei auch in Client-Komponenten
// importierbar bleibt.
export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

export const allowedUploadExtensions = [
  "pdf",
  "png",
  "jpg",
  "jpeg",
  "webp",
  "heic",
  "doc",
  "docx",
  "xls",
  "xlsx",
  "ppt",
  "pptx",
  "txt",
  "csv",
  "zip",
] as const;

export const uploadAcceptAttribute = allowedUploadExtensions
  .map((extension) => `.${extension}`)
  .join(",");

export function isAllowedUploadFile(file: File) {
  const extension = file.name.split(".").pop()?.toLowerCase();

  return Boolean(extension) && (allowedUploadExtensions as readonly string[]).includes(extension!);
}
