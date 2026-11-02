export interface VaultFileItem {
  path: string;
  name: string;
  isDirectory: boolean;
  size?: number;
  mtime?: number;
}

export interface VaultSearchMatch {
  path: string;
  matches: string[];
  backlinks?: number;
}

export interface VaultGraphNeighbor {
  path: string;
  depth: number;
  linkCount: number;
  direction: "incoming" | "outgoing";
}

export interface VaultPort {
  readFile(relativePath: string): Promise<string | null>;
  writeFile(relativePath: string, content: string): Promise<boolean>;
  appendFile(relativePath: string, content: string): Promise<boolean>;
  deleteFile(relativePath: string): Promise<boolean>;
  listFiles(directory?: string): Promise<VaultFileItem[]>;
  searchFiles(query: string, maxResults?: number): Promise<VaultSearchMatch[]>;
  getGraphNeighbors(
    relativePath: string,
    direction?: "incoming" | "outgoing" | "both",
    depth?: number,
    maxResults?: number,
  ): Promise<VaultGraphNeighbor[]>;
  getActiveFile(): Promise<string | null>;
}

export type VaultOperationErrorCode =
  | "invalid_path"
  | "hidden_path"
  | "absolute_path"
  | "unsupported_extension"
  | "directory_not_found"
  | "folder_exists"
  | "cannot_create_folder";

export class VaultOperationError extends Error {
  constructor(
    readonly code: VaultOperationErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export function normalizeRelativePath(input: string, allowRoot = false): string {
  const rawInput = input.trim();
  if (
    rawInput.startsWith("/") ||
    rawInput.startsWith("\\\\") ||
    /^[A-Za-z]:[\\/]/.test(rawInput)
  ) {
    throw new VaultOperationError(
      "absolute_path",
      "Absolute vault paths are not allowed",
    );
  }

  const replaced = input.replace(/\\/g, "/").replace(/^\/+/, "").trim();

  if (allowRoot && replaced === "") {
    return "";
  }

  if (
    replaced === "" ||
    replaced.startsWith("/") ||
    /^[A-Za-z]:\//.test(replaced)
  ) {
    throw new VaultOperationError("invalid_path", "Invalid vault path");
  }

  const segments = replaced.split("/");
  if (segments.some((segment) => segment === "." || segment === ".." || segment === "")) {
    throw new VaultOperationError("invalid_path", "Invalid vault path");
  }

  if (segments.some((segment) => segment.startsWith("."))) {
    throw new VaultOperationError(
      "hidden_path",
      "Hidden vault paths are not allowed",
    );
  }

  if (segments.some((segment) => segment.includes("\0"))) {
    throw new VaultOperationError("invalid_path", "Invalid vault path");
  }

  return segments.join("/");
}

export function normalizeNoteRelativePath(input: string): string {
  const relativePath = normalizeRelativePath(input);
  if (!/\.(md|txt)$/i.test(relativePath)) {
    throw new VaultOperationError(
      "unsupported_extension",
      "Only Markdown and text files are allowed",
    );
  }
  return relativePath;
}
