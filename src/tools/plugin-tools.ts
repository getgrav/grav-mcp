import { z } from 'zod';
import type { ZodRawShape } from 'zod';
import type { McpServer, RegisteredTool } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { GravClient } from '../client/grav-client.js';
import { GravApiError } from '../client/error-mapper.js';
import { jsonSchemaToZodObject } from '../client/json-schema.js';
import type {
  McpPluginSummary,
  McpToolAnnotations,
  McpToolDefinition,
  McpToolsResponse,
} from '../types/grav-api.js';
import { addPaginationInfo, handleToolCall, toolResult } from './helpers.js';

/**
 * Tools contributed by Grav plugins.
 *
 * A plugin ships an `mcp.yaml` manifest describing its API routes; the API
 * plugin serves the union of every enabled plugin's manifest at GET /mcp/tools,
 * filtered to what the calling key may see. Each entry becomes one MCP tool
 * here, with no grav-mcp code per plugin.
 *
 * See docs/plugin-tools-spec.md for the contract.
 */

/** `all` loads every plugin's tools, `none` disables them, an array loads only those plugin slugs. */
export type PluginToolsMode = 'all' | 'none' | string[];

export interface PluginToolsOptions {
  mode?: PluginToolsMode;
}

export interface PluginToolsSyncResult {
  added: string[];
  updated: string[];
  removed: string[];
  warnings: string[];
  plugins: McpPluginSummary[];
}

export interface PluginToolsController {
  /** Fetches /mcp/tools and reconciles the registered tools against it. */
  loadPluginTools(): Promise<PluginToolsSyncResult>;
  /** The tools currently registered from plugin manifests. */
  registeredToolNames(): string[];
}

interface RegistryEntry {
  definition: McpToolDefinition;
  tool: RegisteredTool;
}

// Last successfully loaded set, grouped for `discover_plugins` so a model can
// see which plugins offer tools without a second fetch.
let lastLoadedTools: McpToolDefinition[] = [];

export function getPluginToolSummaries(): Array<{ plugin: string; tools: string[] }> {
  const byPlugin = new Map<string, string[]>();
  for (const def of lastLoadedTools) {
    const names = byPlugin.get(def.plugin) ?? [];
    names.push(def.name);
    byPlugin.set(def.plugin, names);
  }
  return [...byPlugin.entries()].map(([plugin, tools]) => ({ plugin, tools }));
}

/** Test seam: forget the last loaded set. */
export function clearPluginToolsCache(): void {
  lastLoadedTools = [];
}

const controllers = new WeakMap<McpServer, PluginToolsController>();

/**
 * Fetches /mcp/tools for a server that has had `registerPluginTools` called on
 * it, registering, updating and removing tools to match the response.
 */
export async function loadPluginTools(server: McpServer): Promise<PluginToolsSyncResult> {
  const controller = controllers.get(server);
  if (!controller) {
    throw new Error('Plugin tools are not registered on this server.');
  }
  return controller.loadPluginTools();
}

export function registerPluginTools(
  server: McpServer,
  client: GravClient,
  ensureInit: () => Promise<void>,
  options: PluginToolsOptions = {},
): PluginToolsController {
  const mode: PluginToolsMode = options.mode ?? 'all';
  const registry = new Map<string, RegistryEntry>();

  async function sync(): Promise<PluginToolsSyncResult> {
    // @api GET /mcp/tools
    const response = await client.get<McpToolsResponse>('/mcp/tools');
    const payload = response.data ?? { tools: [] };
    const warnings = [...(payload.warnings ?? [])];

    const wanted = new Map<string, McpToolDefinition>();
    for (const def of payload.tools ?? []) {
      if (!includesPlugin(mode, def.plugin)) continue;
      wanted.set(def.name, def);
    }

    const added: string[] = [];
    const updated: string[] = [];
    const removed: string[] = [];

    for (const [name, definition] of wanted) {
      const existing = registry.get(name);

      if (!existing) {
        if (isNameTaken(server, name)) {
          warn(warnings, `Skipped plugin tool '${name}' (${definition.plugin}): a tool with that name is already registered.`);
          wanted.delete(name);
          continue;
        }
        try {
          registerOne(server, client, ensureInit, registry, definition);
          added.push(name);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          warn(warnings, `Skipped plugin tool '${name}' (${definition.plugin}): ${message}`);
          wanted.delete(name);
        }
        continue;
      }

      if (fingerprintOf(existing.definition) === fingerprintOf(definition)) continue;

      try {
        const schema = buildInputSchema(definition);
        existing.definition = definition;
        // `update({ paramsSchema })` runs its argument through the SDK's
        // `objectFromShape`, which would drop the root's passthrough/strict, so
        // set the schema directly and update the rest.
        existing.tool.inputSchema = schema;
        existing.tool.update({
          title: definition.title,
          description: composeDescription(definition),
          annotations: toolAnnotations(definition),
        });
        updated.push(name);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        warn(warnings, `Kept the previous version of plugin tool '${name}' (${definition.plugin}): ${message}`);
        wanted.set(name, existing.definition);
      }
    }

    for (const [name, entry] of [...registry]) {
      if (wanted.has(name)) continue;
      entry.tool.remove();
      registry.delete(name);
      removed.push(name);
    }

    lastLoadedTools = [...wanted.values()];

    return {
      added,
      updated,
      removed,
      warnings,
      plugins: (payload.plugins ?? []).filter((p) => includesPlugin(mode, p.slug)),
    };
  }

  // @api GET /mcp/tools
  server.registerTool('refresh_plugin_tools', {
    title: 'Refresh Plugin Tools',
    description:
      'Re-read the tool manifests published by installed Grav plugins and reconcile them with the tools this server offers: newly published tools are added, changed ones are updated, and tools whose plugin was disabled or removed are dropped. Use after installing, enabling or updating a plugin so its tools become callable without restarting. Returns the added, updated and removed tool names plus any manifest warnings. [Requires: api.access]',
    inputSchema: {},
    annotations: { readOnlyHint: false, idempotentHint: true },
  }, async () => handleToolCall(ensureInit, async () => {
    client.checkPermission('api.access');

    if (mode === 'none') {
      return toolResult({
        enabled: false,
        message:
          'Plugin tools are disabled for this server (--plugin-tools none). Restart grav-mcp with --plugin-tools all, or a comma-separated plugin list, to load them.',
      });
    }

    return toolResult(await sync());
  }));

  const controller: PluginToolsController = {
    async loadPluginTools() {
      if (mode === 'none') {
        return { added: [], updated: [], removed: [], warnings: [], plugins: [] };
      }
      return sync();
    },
    registeredToolNames() {
      return [...registry.keys()];
    },
  };

  controllers.set(server, controller);
  return controller;
}

function registerOne(
  server: McpServer,
  client: GravClient,
  ensureInit: () => Promise<void>,
  registry: Map<string, RegistryEntry>,
  definition: McpToolDefinition,
): void {
  const schema = buildInputSchema(definition);
  const entry = { definition } as RegistryEntry;

  entry.tool = server.registerTool(definition.name, {
    title: definition.title,
    description: composeDescription(definition),
    inputSchema: schema,
    annotations: toolAnnotations(definition),
  }, async (args: Record<string, unknown>) => handleToolCall(ensureInit, async () => {
    const def = entry.definition;

    if (def.permission) {
      client.checkPermission(def.permission);
    }

    const values: Record<string, unknown> = { ...(args ?? {}) };
    const path = substitutePath(def, values);
    const { query, body } = splitArguments(def, values);

    const response = await client.request<unknown>(def.method, path, { query, body });
    return toolResult(addPaginationInfo(response.data, response.meta));
  }));

  registry.set(definition.name, entry);
}

/** Substitutes `{param}` placeholders, consuming those arguments. */
function substitutePath(definition: McpToolDefinition, values: Record<string, unknown>): string {
  let path = definition.path;

  for (const param of pathParams(definition)) {
    const value = values[param];
    if (value === undefined || value === null || value === '') {
      throw new GravApiError(
        `The '${param}' argument is required by ${definition.name}: it fills the {${param}} placeholder in ${definition.path}.`,
        400,
        false,
      );
    }
    path = path.split(`{${param}}`).join(encodeURIComponent(String(value)));
    delete values[param];
  }

  return path;
}

/**
 * GET sends every remaining argument as a query parameter. Every other method
 * sends the arguments named in `query` as query parameters and the rest as the
 * JSON body, so a DELETE with no `query` list puts everything in the body.
 * A tool that names a `body` argument sends that argument's object as the whole
 * body instead, so a plugin can take fields it cannot declare (a Flex object's
 * blueprint fields, say). Leaving that argument out sends no body; passing it
 * as anything but an object (a JSON string, typically) is an error rather than
 * a silently empty body. Undefined arguments are dropped.
 */
function splitArguments(
  definition: McpToolDefinition,
  values: Record<string, unknown>,
): {
  query: Record<string, string | number | boolean | undefined>;
  body: Record<string, unknown> | undefined;
} {
  const query: Record<string, string | number | boolean | undefined> = {};
  const body: Record<string, unknown> = {};
  const queryNames = new Set(definition.query ?? []);
  const allQuery = definition.method === 'GET';
  const bodyName = !allQuery && definition.body ? definition.body : undefined;

  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) continue;
    if (allQuery || queryNames.has(key)) {
      query[key] = toQueryValue(value);
    } else if (bodyName === undefined) {
      body[key] = value;
    }
  }

  if (bodyName !== undefined) {
    const designated = values[bodyName];
    if (designated === undefined) return { query, body: undefined };
    if (typeof designated !== 'object' || designated === null || Array.isArray(designated)) {
      throw new GravApiError(
        `The '${bodyName}' argument of ${definition.name} is the request body and must be an object.`,
        400,
        false,
      );
    }
    return { query, body: designated as Record<string, unknown> };
  }

  return { query, body: Object.keys(body).length ? body : undefined };
}

function toQueryValue(value: unknown): string | number | boolean | undefined {
  if (value === null) return undefined;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  return JSON.stringify(value);
}

function pathParams(definition: McpToolDefinition): string[] {
  if (definition.path_params?.length) return definition.path_params;
  return [...definition.path.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
}

function buildInputSchema(definition: McpToolDefinition): z.ZodObject<any> {
  const schema = jsonSchemaToZodObject(definition.input_schema);
  const required: ZodRawShape = {};

  // Path placeholders are always required, whatever the manifest's `required` says.
  for (const param of pathParams(definition)) {
    const entry = schema.shape[param];
    if (entry === undefined) {
      required[param] = z.string().describe(`Fills the {${param}} placeholder in ${definition.path}`);
    } else if (entry instanceof z.ZodOptional) {
      required[param] = entry.unwrap();
    }
  }

  // `extend` keeps the root's passthrough/strict setting.
  return Object.keys(required).length ? schema.extend(required) : schema;
}

/** Matches the core tools' wording, and names the plugin the tool came from. */
function composeDescription(definition: McpToolDefinition): string {
  const parts = [definition.description.trim()];
  if (definition.permission) parts.push(`[Requires: ${definition.permission}]`);
  parts.push(`(plugin: ${definition.plugin})`);
  return parts.join(' ');
}

function toolAnnotations(definition: McpToolDefinition): {
  readOnlyHint: boolean;
  destructiveHint: boolean;
  idempotentHint: boolean;
} {
  const defaults = defaultAnnotations(definition.method);
  const declared = definition.annotations ?? {};
  return {
    readOnlyHint: declared.readOnly ?? defaults.readOnly ?? false,
    destructiveHint: declared.destructive ?? defaults.destructive ?? false,
    idempotentHint: declared.idempotent ?? defaults.idempotent ?? false,
  };
}

/**
 * The API plugin fills these in, but a manifest served by an older build may
 * not, so apply the same defaults here.
 */
function defaultAnnotations(method: string): McpToolAnnotations {
  switch (method) {
    case 'GET':
      return { readOnly: true, destructive: false, idempotent: true };
    case 'DELETE':
      return { readOnly: false, destructive: true, idempotent: true };
    case 'PUT':
    case 'PATCH':
      return { readOnly: false, destructive: false, idempotent: true };
    default:
      return { readOnly: false, destructive: false, idempotent: false };
  }
}

function fingerprintOf(definition: McpToolDefinition): string {
  return JSON.stringify([
    definition.title ?? null,
    definition.description,
    definition.method,
    definition.path,
    definition.permission ?? null,
    definition.annotations ?? null,
    definition.input_schema ?? null,
    definition.path_params ?? null,
    definition.query ?? null,
    definition.body ?? null,
  ]);
}

function includesPlugin(mode: PluginToolsMode, plugin: string): boolean {
  if (mode === 'none') return false;
  if (mode === 'all') return true;
  return mode.includes(plugin);
}

function isNameTaken(server: McpServer, name: string): boolean {
  const registered = (server as unknown as { _registeredTools?: Record<string, unknown> })
    ._registeredTools;
  return registered ? Object.prototype.hasOwnProperty.call(registered, name) : false;
}

function warn(warnings: string[], message: string): void {
  warnings.push(message);
  console.error(`Warning: ${message}`);
}
