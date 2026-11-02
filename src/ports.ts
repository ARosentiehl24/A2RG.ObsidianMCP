import type { ApiResponse, GraphNeighbor } from "./api.js";
import type { FileItem } from "./vault.js";

export interface RestApiPort {
  getFile(path: string): Promise<ApiResponse<string>>;
  putFile(path: string, content: string): Promise<ApiResponse<void>>;
  appendFile(path: string, content: string): Promise<ApiResponse<void>>;
  deleteFile(path: string): Promise<ApiResponse<void>>;
  listFiles(directory?: string): Promise<ApiResponse<{ path: string; name: string; isDirectory: boolean; size?: number; mtime?: number }[]>>;
  search(query: string, maxResults?: number): Promise<ApiResponse<{ path: string; matches: string[] }[]>>;
  getGraphNeighbors(path: string, direction: "incoming" | "outgoing" | "both", depth: number, maxResults: number): Promise<ApiResponse<GraphNeighbor[]>>;
  getActiveFile(): Promise<ApiResponse<string>>;
}

export interface McpVaultPort {
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  appendFile(path: string, content: string): Promise<void>;
  deleteFile(path: string): Promise<void>;
  listFiles(directory?: string): Promise<FileItem[]>;
  searchFiles(query: string, maxResults?: number): Promise<{ path: string; matches: string[] }[]>;
  fileExists(path: string): Promise<boolean>;
}
