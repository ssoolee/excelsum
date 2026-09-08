export type FileStatus = "processing" | "ok" | "mismatch" | "empty" | "error";

export interface FileEntry {
  id: string;
  fileName: string;
  status: FileStatus;
  message?: string;
  rowCount?: number;
}
