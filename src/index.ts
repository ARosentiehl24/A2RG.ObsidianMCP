import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CfWorkerJsonSchemaValidator } from "@modelcontextprotocol/sdk/validation/cfworker";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { ApiClient } from "./api.js";
import { loadConfig } from "./config.js";
import { McpToolRegistry } from "./mcp-tool-registry.js";
import { HybridRouter } from "./router.js";
import { VaultManager } from "./vault.js";

const config = loadConfig();
const api = new ApiClient(
  config.apiUrl,
  config.apiKey,
  config.requestTimeoutMs,
  config.tlsCaCertPath,
);
const vault = new VaultManager(config.vaultPath, config.configDirPath);
const router = new HybridRouter(api, vault, config.preferRestApi);
const toolRegistry = new McpToolRegistry(router);

const server = new McpServer(
  {
    name: "@a2rg/obsidian-mcp",
    version: "1.0.6",
  },
  {
    capabilities: {
      tools: {},
    },
    jsonSchemaValidator: new CfWorkerJsonSchemaValidator(),
  },
);

server.server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: toolRegistry.listTools(),
}));

server.server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    return await toolRegistry.callTool(
      request.params.name,
      request.params.arguments,
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: `Error ejecutando ${request.params.name}: ${message}`,
        },
      ],
    };
  }
});

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("A2RG Obsidian MCP running on stdio");
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Fatal error: ${message}`);
  process.exit(1);
});
