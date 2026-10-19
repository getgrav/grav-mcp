#!/usr/bin/env node

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CORE_TOOL_GROUPS, createServer, type CoreToolsMode } from './server.js';
import { GravApiError } from './client/error-mapper.js';
import { loadPluginTools, type PluginToolsMode } from './tools/plugin-tools.js';

interface CliConfig {
  url: string;
  apiKey: string;
  environment?: string;
  transport: 'stdio' | 'http';
  port: number;
  pluginTools: PluginToolsMode;
  coreTools: CoreToolsMode;
}

// Startup must not hang on an unreachable site: past this, the server starts
// with core tools only and refresh_plugin_tools can pick the rest up later.
const PLUGIN_TOOLS_TIMEOUT_MS = 5000;

function parseArgs(): CliConfig {
  const args = process.argv.slice(2);
  const parsed: Record<string, string> = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--url' && args[i + 1]) {
      parsed.url = args[++i];
    } else if (arg === '--key' && args[i + 1]) {
      parsed.key = args[++i];
    } else if (arg === '--environment' && args[i + 1]) {
      parsed.environment = args[++i];
    } else if (arg === '--transport' && args[i + 1]) {
      parsed.transport = args[++i];
    } else if (arg === '--port' && args[i + 1]) {
      parsed.port = args[++i];
    } else if (arg === '--plugin-tools' && args[i + 1]) {
      parsed.pluginTools = args[++i];
    } else if (arg === '--core-tools' && args[i + 1]) {
      parsed.coreTools = args[++i];
    } else if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    } else if (arg === '--version' || arg === '-v') {
      console.log('grav-mcp 0.1.0');
      process.exit(0);
    }
  }

  const url = parsed.url || process.env.GRAV_API_URL;
  const apiKey = parsed.key || process.env.GRAV_API_KEY;
  const environment = parsed.environment || process.env.GRAV_ENVIRONMENT;
  const transport = (parsed.transport || 'stdio') as 'stdio' | 'http';
  const port = parseInt(parsed.port || '3100', 10);
  const pluginTools = parsePluginTools(
    parsed.pluginTools || process.env.GRAV_MCP_PLUGIN_TOOLS || 'all',
  );
  const coreTools = parseCoreTools(
    parsed.coreTools || process.env.GRAV_MCP_CORE_TOOLS || 'all',
  );

  if (!url) {
    console.error('Error: GRAV_API_URL is required. Set via --url or GRAV_API_URL environment variable.');
    process.exit(1);
  }

  if (!apiKey) {
    console.error('Error: GRAV_API_KEY is required. Set via --key or GRAV_API_KEY environment variable.');
    process.exit(1);
  }

  if (transport !== 'stdio' && transport !== 'http') {
    console.error(`Error: Invalid transport "${transport}". Must be "stdio" or "http".`);
    process.exit(1);
  }

  return { url, apiKey, environment, transport, port, pluginTools, coreTools };
}

function parsePluginTools(value: string): PluginToolsMode {
  const trimmed = value.trim();
  if (trimmed === '' || trimmed === 'all') return 'all';
  if (trimmed === 'none') return 'none';

  const slugs = trimmed.split(',').map((s) => s.trim()).filter(Boolean);
  if (!slugs.length) {
    console.error(
      `Error: Invalid --plugin-tools value "${value}". Use "all", "none", or a comma-separated list of plugin slugs.`,
    );
    process.exit(1);
  }
  return slugs;
}

function parseCoreTools(value: string): CoreToolsMode {
  const trimmed = value.trim();
  if (trimmed === '' || trimmed === 'all') return 'all';
  if (trimmed === 'none') return 'none';

  const groups = trimmed.split(',').map((s) => s.trim()).filter(Boolean);
  const unknown = groups.filter((g) => !(g in CORE_TOOL_GROUPS));
  if (!groups.length || unknown.length) {
    console.error(
      `Error: Invalid --core-tools value "${value}". Use "all", "none", or a comma-separated list of: ${Object.keys(CORE_TOOL_GROUPS).join(', ')}.`,
    );
    process.exit(1);
  }
  return groups;
}

function printUsage(): void {
  console.log(`
grav-mcp — MCP server for Grav CMS

Usage:
  grav-mcp [options]

Options:
  --url <url>           Grav API base URL (or GRAV_API_URL env var)
  --key <key>           API key (or GRAV_API_KEY env var)
  --environment <env>   Grav environment override (or GRAV_ENVIRONMENT env var)
  --transport <type>    Transport: stdio (default) or http
  --port <port>         HTTP port (default: 3100, only with --transport http)
  --plugin-tools <mode> Tools published by plugins: all (default), none, or a
                        comma-separated list of plugin slugs
                        (or GRAV_MCP_PLUGIN_TOOLS env var)
  --core-tools <mode>   Core tool groups: all (default), none, or a
                        comma-separated list of pages, multilingual, media,
                        config, users, gpm, system, webhooks, blueprints,
                        plugins (or GRAV_MCP_CORE_TOOLS env var)
  -h, --help            Show this help
  -v, --version         Show version

Examples:
  # stdio transport (for Claude Code, Cursor, VS Code)
  GRAV_API_URL=https://mysite.com/api GRAV_API_KEY=grav_abc123 grav-mcp

  # HTTP transport (for remote/hosted deployment)
  grav-mcp --url https://mysite.com/api --key grav_abc123 --transport http --port 3100

  # Only load the tools published by one plugin
  grav-mcp --url https://mysite.com/api --key grav_abc123 --plugin-tools kahunacart
`);
}

/**
 * Loads the tools published by plugins before the transport connects, so the
 * first tools/list a client sees already includes them. Any failure is a
 * warning, never fatal: the server then offers core tools only, and
 * refresh_plugin_tools can load the rest once the site is reachable.
 */
async function loadPluginToolsAtStartup(server: ReturnType<typeof createServer>): Promise<void> {
  let timer: NodeJS.Timeout | undefined;

  try {
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(
        () => reject(new Error(`timed out after ${PLUGIN_TOOLS_TIMEOUT_MS}ms`)),
        PLUGIN_TOOLS_TIMEOUT_MS,
      );
    });
    await Promise.race([loadPluginTools(server), timeout]);
  } catch (error) {
    console.error(`Warning: Failed to load plugin tools: ${describePluginToolsFailure(error)}`);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function describePluginToolsFailure(error: unknown): string {
  if (error instanceof GravApiError) {
    if (error.status === 404) {
      return 'this site\'s API plugin has no /mcp/tools endpoint, so it predates plugin tool manifests. Update the API plugin to load them.';
    }
    if (error.status === 401 || error.status === 403) {
      return `${error.message} Plugin tools need the 'api.access' permission.`;
    }
    return error.message;
  }
  return error instanceof Error ? error.message : String(error);
}

async function main(): Promise<void> {
  const config = parseArgs();
  const server = createServer({
    url: config.url,
    apiKey: config.apiKey,
    environment: config.environment,
    pluginTools: config.pluginTools,
    coreTools: config.coreTools,
  });

  if (config.pluginTools !== 'none') {
    await loadPluginToolsAtStartup(server);
  }

  if (config.transport === 'stdio') {
    const transport = new StdioServerTransport();
    await server.connect(transport);
  } else {
    // HTTP transport — dynamic import to avoid loading when not needed
    const { StreamableHTTPServerTransport } = await import(
      '@modelcontextprotocol/sdk/server/streamableHttp.js'
    );
    const http = await import('node:http');

    const httpServer = http.createServer(async (req, res) => {
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
      await server.connect(transport);
      await transport.handleRequest(req, res);
    });

    httpServer.listen(config.port, () => {
      console.error(`grav-mcp HTTP server listening on port ${config.port}`);
    });
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
