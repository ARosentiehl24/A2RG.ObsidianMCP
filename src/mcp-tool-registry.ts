import {
  appendFileArgsSchema,
  deleteFileArgsSchema,
  getFileArgsSchema,
  getLinkedNotesArgsSchema,
  listFilesArgsSchema,
  searchVaultArgsSchema,
  writeFileArgsSchema,
} from "./tool-schemas.js";

interface TextResult {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
  [key: string]: unknown;
}

type ToolHandler = (args: unknown) => Promise<TextResult>;

export interface McpToolRouter {
  getFile(path: string): Promise<{ content: string; source: "api" | "filesystem" | "obsidian" }>;
  writeFile(path: string, content: string): Promise<{ source: "api" | "filesystem" | "obsidian" }>;
  appendFile(path: string, content: string): Promise<{ source: "api" | "filesystem" | "obsidian" }>;
  deleteFile(path: string): Promise<{ source: "api" | "filesystem" | "obsidian" }>;
  listFiles(directory?: string): Promise<Array<{ path: string; name: string; isDirectory: boolean; size?: number; mtime?: number }>>;
  search(query: string, maxResults?: number): Promise<Array<{ path: string; matches: string[] }>>;
  getGraphNeighbors(path: string, direction?: "incoming" | "outgoing" | "both", depth?: number, maxResults?: number): Promise<Array<{ path: string; depth: number; linkCount: number; direction: "incoming" | "outgoing" }>>;
  getActiveFile(): Promise<{ content: string } | null>;
}

export class McpToolRegistry {
  private readonly tools = [
    {
      name: "get_file",
      description: "Obtiene el contenido Markdown de un archivo de la bóveda de Obsidian.",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string", description: "Ruta relativa del archivo dentro de la bóveda" },
        },
        required: ["path"],
      },
    },
    {
      name: "write_file",
      description: "Crea o sobrescribe un archivo Markdown en la bóveda.",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string", description: "Ruta relativa del archivo dentro de la bóveda" },
          content: { type: "string", description: "Contenido Markdown a escribir" },
        },
        required: ["path", "content"],
      },
    },
    {
      name: "append_file",
      description: "Agrega contenido al final de un archivo Markdown en la bóveda.",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string", description: "Ruta relativa del archivo" },
          content: { type: "string", description: "Texto o sección a adjuntar" },
        },
        required: ["path", "content"],
      },
    },
    {
      name: "delete_file",
      description: "Elimina un archivo Markdown de la bóveda.",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string", description: "Ruta relativa del archivo" },
        },
        required: ["path"],
      },
    },
    {
      name: "search_vault",
      description: "Busca palabras clave o notas dentro de la bóveda.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Término de búsqueda" },
          limit: { type: "number", description: "Límite opcional de resultados" },
        },
        required: ["query"],
      },
    },
    {
      name: "get_linked_notes",
      description: "Obtiene notas enlazadas mediante el grafo interno de Obsidian.",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string", description: "Ruta relativa de la nota origen" },
          direction: {
            type: "string",
            enum: ["incoming", "outgoing", "both"],
            description: "Tipo de enlaces a recorrer",
          },
          depth: { type: "number", description: "Profundidad máxima: 1 a 3" },
          limit: { type: "number", description: "Límite opcional de resultados" },
        },
        required: ["path"],
      },
    },
    {
      name: "list_files",
      description: "Lista archivos y carpetas dentro de un directorio de la bóveda.",
      inputSchema: {
        type: "object",
        properties: {
          directory: { type: "string", description: "Subcarpeta a listar, o vacío para la raíz" },
        },
      },
    },
    {
      name: "get_active_file",
      description: "Obtiene la nota actualmente abierta y activa en Obsidian.",
      inputSchema: { type: "object", properties: {} },
    },
  ];

  private readonly handlers: Record<string, ToolHandler>;

  constructor(private readonly router: McpToolRouter) {
    this.handlers = {
      get_file: async (args) => {
        const { path } = getFileArgsSchema.parse(args);
        const result = await this.router.getFile(path);
        return this.text(result.content);
      },
      write_file: async (args) => {
        const { path, content } = writeFileArgsSchema.parse(args);
        const result = await this.router.writeFile(path, content);
        return this.text(`Archivo guardado exitosamente vía ${result.source}.`);
      },
      append_file: async (args) => {
        const { path, content } = appendFileArgsSchema.parse(args);
        const result = await this.router.appendFile(path, content);
        return this.text(`Contenido agregado exitosamente vía ${result.source}.`);
      },
      delete_file: async (args) => {
        const { path } = deleteFileArgsSchema.parse(args);
        const result = await this.router.deleteFile(path);
        return this.text(`Archivo eliminado exitosamente vía ${result.source}.`);
      },
      search_vault: async (args) => {
        const { query, limit = 20 } = searchVaultArgsSchema.parse(args);
        const matches = await this.router.search(query, limit);
        return this.text(JSON.stringify(matches, null, 2));
      },
      get_linked_notes: async (args) => {
        const {
          path,
          direction = "both",
          depth = 1,
          limit = 20,
        } = getLinkedNotesArgsSchema.parse(args);
        const neighbors = await this.router.getGraphNeighbors(
          path,
          direction,
          depth,
          limit,
        );
        return this.text(JSON.stringify(neighbors, null, 2));
      },
      list_files: async (args) => {
        const { directory = "" } = listFilesArgsSchema.parse(args);
        const files = await this.router.listFiles(directory);
        return this.text(JSON.stringify(files, null, 2));
      },
      get_active_file: async () => {
        const active = await this.router.getActiveFile();
        return this.text(
          active?.content
            ?? "No hay archivo activo disponible o la API de Obsidian no está conectada.",
        );
      },
    };
  }

  listTools(): typeof this.tools {
    return this.tools;
  }

  async callTool(name: string, args: unknown): Promise<TextResult> {
    const handler = this.handlers[name];
    if (!handler) {
      throw new Error(`Herramienta no reconocida: ${name}`);
    }
    return handler(args);
  }

  private text(text: string): TextResult {
    return {
      content: [{ type: "text", text }],
    };
  }
}
