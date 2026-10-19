import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { GravClient } from './client/grav-client.js';
import { registerPageTools } from './tools/pages.js';
import { registerMultilingualTools } from './tools/multilingual.js';
import { registerMediaTools } from './tools/media.js';
import { registerConfigTools } from './tools/config.js';
import { registerUserTools } from './tools/users.js';
import { registerGpmTools } from './tools/gpm.js';
import { registerSystemTools } from './tools/system.js';
import { registerWebhookTools } from './tools/webhooks.js';
import { registerBlueprintTools } from './tools/blueprints.js';
// Plugin discovery (sidebar, widgets, panels) and plugin-published tools both
// register "plugin" tools, so the discovery module is aliased here.
import { registerPluginTools as registerPluginDiscoveryTools } from './tools/plugins.js';
import { registerPluginTools, type PluginToolsMode } from './tools/plugin-tools.js';
import { registerResources } from './resources/index.js';
import { registerPrompts } from './prompts/index.js';

export interface ServerConfig {
  url: string;
  apiKey: string;
  environment?: string;
  /** Which plugin-published tools to load: 'all' (default), 'none', or a list of plugin slugs. */
  pluginTools?: PluginToolsMode;
  /** Which core tool groups to load: 'all' (default), 'none', or a list of group names. */
  coreTools?: CoreToolsMode;
}

type ToolGroupRegistrar = (server: McpServer, client: GravClient, ensureInit: () => Promise<void>) => void;

/** The core tool groups, by the name `--core-tools` takes. */
export const CORE_TOOL_GROUPS: Record<string, ToolGroupRegistrar> = {
  pages: registerPageTools,
  multilingual: registerMultilingualTools,
  media: registerMediaTools,
  config: registerConfigTools,
  users: registerUserTools,
  gpm: registerGpmTools,
  system: registerSystemTools,
  webhooks: registerWebhookTools,
  blueprints: registerBlueprintTools,
  plugins: registerPluginDiscoveryTools,
};

export type CoreToolsMode = 'all' | 'none' | string[];

export function createServer(config: ServerConfig): McpServer {
  const client = new GravClient({
    baseUrl: config.url,
    apiKey: config.apiKey,
    environment: config.environment,
  });

  const server = new McpServer(
    {
      name: 'grav-mcp',
      version: '0.1.0',
    },
    {
      capabilities: {
        tools: {},
        resources: {},
        prompts: {},
      },
    },
  );

  // Initialize client (fetch permissions) on first connection
  let initialized = false;
  const ensureInitialized = async (): Promise<void> => {
    if (!initialized) {
      try {
        await client.initialize();
        initialized = true;
      } catch (error) {
        // Log but don't block — tools will get permission errors at call time
        console.error('Warning: Failed to fetch user permissions:', error);
        initialized = true;
      }
    }
  };

  // Register the core tool groups asked for (all of them by default)
  const coreTools = config.coreTools ?? 'all';
  for (const [group, register] of Object.entries(CORE_TOOL_GROUPS)) {
    if (coreTools === 'all' || (coreTools !== 'none' && coreTools.includes(group))) {
      register(server, client, ensureInitialized);
    }
  }

  // Tools published by plugins via mcp.yaml. This only registers the core
  // refresh_plugin_tools tool; the plugin tools themselves arrive when
  // loadPluginTools(server) runs, before the transport connects.
  registerPluginTools(server, client, ensureInitialized, { mode: config.pluginTools ?? 'all' });

  // Register resources and prompts
  registerResources(server, client, ensureInitialized);
  registerPrompts(server);

  return server;
}
