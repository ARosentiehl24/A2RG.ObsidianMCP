import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { loadConfig } from "./config.js";
import { ApiClient } from "./api.js";
import { VaultManager } from "./vault.js";
import { HybridRouter } from "./router.js";

const config = loadConfig();
const api = new ApiClient(config.apiUrl, config.apiKey, config.requestTimeoutMs);
const vault = new VaultManager(config.vaultPath);
const router = new HybridRouter(api, vault, config.preferRestApi);

const server = new Server(
  {
    name: "a2rg-obsidian-mcp",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "get_file",
        description: "Obtiene el contenido Markdown de un archivo de la bóveda de Obsidian.",
        inputSchema: {
          type: "object",
          properties: {
            path: {
              type: "string",
              description: "Ruta relativa del archivo dentro de la bóveda (ej. '00 - Inicio.md')",
            },
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
            path: {
              type: "string",
              description: "Ruta relativa del archivo dentro de la bóveda",
            },
            content: {
              type: "string",
              description: "Contenido Markdown a escribir",
            },
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
            path: {
              type: "string",
              description: "Ruta relativa del archivo",
            },
            content: {
              type: "string",
              description: "Texto o sección a adjuntar",
            },
          },
          required: ["path", "content"],
        },
      },
      {
        name: "search_vault",
        description: "Busca palabras clave o notas dentro de la bóveda.",
        inputSchema: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "Término de búsqueda",
            },
            limit: {
              type: "number",
              description: "Límite opcional de resultados",
            },
          },
          required: ["query"],
        },
      },
      {
        name: "list_files",
        description: "Lista archivos y carpetas dentro de un directorio de la bóveda.",
        inputSchema: {
          type: "object",
          properties: {
            directory: {
              type: "string",
              description: "Subcarpeta a listar, o vacío para la raíz",
            },
          },
        },
      },
      {
        name: "get_active_file",
        description: "Obtiene la nota actualmente abierta y activa en Obsidian si la aplicación está en ejecución.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "get_file": {
        const filePath = String(args?.path);
        const result = await router.getFile(filePath);
        return {
          content: [
            {
              type: "text",
              text: result.content,
            },
          ],
        };
      }

      case "write_file": {
        const filePath = String(args?.path);
        const content = String(args?.content);
        const result = await router.writeFile(filePath, content);
        return {
          content: [
            {
              type: "text",
              text: `Archivo guardado exitosamente vía ${result.source}.`,
            },
          ],
        };
      }

      case "append_file": {
        const filePath = String(args?.path);
        const content = String(args?.content);
        const result = await router.appendFile(filePath, content);
        return {
          content: [
            {
              type: "text",
              text: `Contenido agregado exitosamente vía ${result.source}.`,
            },
          ],
        };
      }

      case "search_vault": {
        const query = String(args?.query);
        const limit = args?.limit ? Number(args.limit) : 20;
        const matches = await router.search(query, limit);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(matches, null, 2),
            },
          ],
        };
      }

      case "list_files": {
        const dir = args?.directory ? String(args.directory) : "";
        const files = await router.listFiles(dir);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(files, null, 2),
            },
          ],
        };
      }

      case "get_active_file": {
        const active = await router.getActiveFile();
        if (!active) {
          return {
            content: [
              {
                type: "text",
                text: "No hay archivo activo disponible o la API de Obsidian no está conectada.",
              },
            ],
          };
        }
        return {
          content: [
            {
              type: "text",
              text: active.content,
            },
          ],
        };
      }

      default:
        throw new Error(`Herramienta no reconocida: ${name}`);
    }
  } catch (error: any) {
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: `Error ejecutando ${name}: ${error?.message || String(error)}`,
        },
      ],
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("A2RG Obsidian MCP running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
