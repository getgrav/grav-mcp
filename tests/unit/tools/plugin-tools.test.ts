import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { GravClient } from '../../../src/client/grav-client.js';
import { mockServer } from '../../mocks/handlers.js';
import { limitedUserProfile } from '../../mocks/fixtures/users.js';
import {
  registerPluginTools,
  loadPluginTools,
  getPluginToolSummaries,
  clearPluginToolsCache,
  type PluginToolsMode,
} from '../../../src/tools/plugin-tools.js';
import {
  registerPluginTools as registerPluginDiscoveryTools,
  clearDiscoveryCache,
} from '../../../src/tools/plugins.js';
import {
  mcpToolsResponse,
  changedMcpToolsResponse,
  collidingMcpToolsResponse,
  unsupportedSchemaToolsResponse,
  rootAndBodyToolsResponse,
} from '../../mocks/fixtures/mcp-tools.js';

const BASE = '*/v1';

interface Harness {
  server: McpServer;
  client: GravClient;
  call(name: string, args?: Record<string, unknown>): Promise<any>;
  tool(name: string): any;
  names(): string[];
}

function boot(mode: PluginToolsMode = 'all'): Harness {
  const client = new GravClient({ baseUrl: 'http://test.local/api', apiKey: 'grav_test' });
  const server = new McpServer({ name: 'test', version: '0.0.1' });
  const ensureInit = async () => { await client.initialize(); };

  // Core tools first, so a plugin tool can collide with one of them.
  registerPluginDiscoveryTools(server, client, ensureInit);
  registerPluginTools(server, client, ensureInit, { mode });

  const registered = () => (server as any)._registeredTools as Record<string, any>;

  return {
    server,
    client,
    tool: (name: string) => registered()[name],
    names: () => Object.keys(registered()),
    async call(name: string, args: Record<string, unknown> = {}) {
      const tool = registered()[name];
      if (!tool) throw new Error(`Tool ${name} not found`);
      return tool.handler(args, {});
    },
  };
}

function serveTools(payload: unknown): void {
  mockServer.use(http.get(`${BASE}/mcp/tools`, () => HttpResponse.json({ data: payload })));
}

function dataOf(result: any): any {
  return JSON.parse(result.content[0].text);
}

describe('Plugin-published tools', () => {
  beforeEach(() => {
    clearPluginToolsCache();
    clearDiscoveryCache();
    // The loader warns to stderr; keep the test output readable.
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('loading', () => {
    it('registers one tool per manifest entry, under its own name', async () => {
      const h = boot();
      const result = await loadPluginTools(h.server);

      expect(result.added).toEqual([
        'kahunacart_list_products',
        'kahunacart_get_product',
        'kahunacart_create_product',
        'kahunacart_update_product',
        'kahunacart_replace_product',
        'kahunacart_delete_attribute',
        'seo_audit',
      ]);
      expect(h.tool('kahunacart_list_products')).toBeDefined();
      expect(h.tool('seo_audit')).toBeDefined();
    });

    it('appends the permission and plugin to the description', async () => {
      const h = boot();
      await loadPluginTools(h.server);

      expect(h.tool('kahunacart_list_products').description).toBe(
        'List catalog products with paging, search and status filters. [Requires: kahunacart.products.manage] (plugin: kahunacart)',
      );
    });

    it('omits the permission note for a tool with no permission', async () => {
      const h = boot();
      await loadPluginTools(h.server);

      expect(h.tool('seo_audit').description).toBe(
        'Audit a page for SEO problems. (plugin: seo)',
      );
    });

    it('carries the title through', async () => {
      const h = boot();
      await loadPluginTools(h.server);
      expect(h.tool('kahunacart_list_products').title).toBe('List products');
    });

    it('maps annotations to MCP hints', async () => {
      const h = boot();
      await loadPluginTools(h.server);

      expect(h.tool('kahunacart_list_products').annotations).toMatchObject({
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      });
      expect(h.tool('kahunacart_delete_attribute').annotations).toMatchObject({
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
      });
      expect(h.tool('kahunacart_create_product').annotations).toMatchObject({
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
      });
    });

    it('falls back to per-method annotation defaults when the response omits them', async () => {
      serveTools({
        tools: [
          {
            name: 'demo_purge',
            plugin: 'demo',
            description: 'Purge things.',
            method: 'DELETE',
            path: '/demo/things',
            input_schema: { type: 'object', properties: {} },
          },
        ],
        plugins: [{ slug: 'demo', name: 'Demo', tools: 1 }],
      });

      const h = boot();
      await loadPluginTools(h.server);

      expect(h.tool('demo_purge').annotations).toMatchObject({
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
      });
    });

    it('reports the plugins and warnings the endpoint returned', async () => {
      const h = boot();
      const result = await loadPluginTools(h.server);

      expect(result.plugins).toEqual(mcpToolsResponse.plugins);
      expect(result.warnings).toEqual(mcpToolsResponse.warnings);
    });

    it('loads only the named plugins when the mode is a slug list', async () => {
      const h = boot(['seo']);
      const result = await loadPluginTools(h.server);

      expect(result.added).toEqual(['seo_audit']);
      expect(h.tool('kahunacart_list_products')).toBeUndefined();
      expect(result.plugins.map((p) => p.slug)).toEqual(['seo']);
    });

    it('fetches nothing and registers nothing when the mode is none', async () => {
      let fetched = false;
      mockServer.use(
        http.get(`${BASE}/mcp/tools`, () => {
          fetched = true;
          return HttpResponse.json({ data: mcpToolsResponse });
        }),
      );

      const h = boot('none');
      const result = await loadPluginTools(h.server);

      expect(fetched).toBe(false);
      expect(result.added).toEqual([]);
      expect(h.tool('kahunacart_list_products')).toBeUndefined();
    });

    it('skips a tool whose name collides with an already-registered tool', async () => {
      serveTools(collidingMcpToolsResponse);
      const h = boot();
      const result = await loadPluginTools(h.server);

      expect(result.added).toEqual(['kahunacart_list_products']);
      expect(result.warnings.join(' ')).toMatch(/discover_plugins.*already registered/);
      // The core tool is untouched.
      expect(h.tool('discover_plugins').description).toMatch(/sidebar navigation items/);
    });

    it('skips a tool whose schema leaves the supported subset', async () => {
      serveTools(unsupportedSchemaToolsResponse);
      const h = boot();
      const result = await loadPluginTools(h.server);

      expect(result.added).toEqual(['kahunacart_list_products']);
      expect(h.tool('kahunacart_upload_image')).toBeUndefined();
      expect(result.warnings.join(' ')).toMatch(/kahunacart_upload_image.*'oneOf'/);
    });

    it('leaves core tools intact when the endpoint is missing (older API plugin)', async () => {
      mockServer.use(
        http.get(`${BASE}/mcp/tools`, () =>
          HttpResponse.json({ status: 404, title: 'Not Found', detail: 'Not found' }, { status: 404 }),
        ),
      );

      const h = boot();
      await expect(loadPluginTools(h.server)).rejects.toMatchObject({ status: 404 });

      expect(h.tool('discover_plugins')).toBeDefined();
      expect(h.tool('refresh_plugin_tools')).toBeDefined();
      expect(h.names().some((n) => n.startsWith('kahunacart_'))).toBe(false);
    });

    it('leaves core tools intact when the request fails outright', async () => {
      mockServer.use(http.get(`${BASE}/mcp/tools`, () => HttpResponse.error()));

      const h = boot();
      await expect(loadPluginTools(h.server)).rejects.toThrow();

      expect(h.tool('discover_plugins')).toBeDefined();
      expect(h.names().some((n) => n.startsWith('kahunacart_'))).toBe(false);
    });

    it('throws when the server never registered plugin tools', async () => {
      const bare = new McpServer({ name: 'bare', version: '0.0.1' });
      await expect(loadPluginTools(bare)).rejects.toThrow(/not registered/);
    });
  });

  describe('input schemas', () => {
    it('builds the schema from input_schema', async () => {
      const h = boot();
      await loadPluginTools(h.server);

      const shape = (h.tool('kahunacart_list_products').inputSchema as any).shape;
      expect(Object.keys(shape).sort()).toEqual(['page', 'per_page', 'q', 'status']);
    });

    it('makes path parameters required', async () => {
      const h = boot();
      await loadPluginTools(h.server);

      const schema = h.tool('kahunacart_get_product').inputSchema as any;
      expect(schema.safeParse({ lang: 'en' }).success).toBe(false);
      expect(schema.safeParse({ id: 5 }).success).toBe(true);
    });
  });

  describe('root additionalProperties', () => {
    it('keeps undeclared arguments and sends them when the root allows them', async () => {
      serveTools(rootAndBodyToolsResponse);
      const h = boot();
      await loadPluginTools(h.server);

      const schema = h.tool('widgets_replace_thing').inputSchema as any;
      const parsed = schema.safeParse({ id: '1', color: 'red', dry_run: true });
      expect(parsed.success).toBe(true);
      expect(parsed.data.color).toBe('red');

      const data = dataOf(await h.call('widgets_replace_thing', parsed.data));
      expect(data.path).toBe('/api/v1/things/1');
      expect(data.query).toEqual({ dry_run: 'true' });
      expect(data.body).toEqual({ color: 'red' });
    });

    it('advertises the root as passthrough, so a model knows it may add fields', async () => {
      serveTools(rootAndBodyToolsResponse);
      const h = boot();
      await loadPluginTools(h.server);

      const schema = h.tool('widgets_replace_thing').inputSchema as any;
      expect(schema instanceof z.ZodObject).toBe(true);
      expect(schema._def.unknownKeys).toBe('passthrough');
    });

    it('rejects undeclared arguments when the root forbids them', async () => {
      serveTools(rootAndBodyToolsResponse);
      const h = boot();
      await loadPluginTools(h.server);

      const schema = h.tool('widgets_create_thing').inputSchema as any;
      expect(schema.safeParse({ title: 'A', color: 'red' }).success).toBe(false);
      expect(schema.safeParse({ title: 'A' }).success).toBe(true);
    });

    it('strips undeclared arguments when the root says nothing', async () => {
      const h = boot();
      await loadPluginTools(h.server);

      const schema = h.tool('kahunacart_list_products').inputSchema as any;
      const parsed = schema.safeParse({ q: 'shirt', color: 'red' });
      expect(parsed.success).toBe(true);
      expect(parsed.data).toEqual({ q: 'shirt' });
    });

    it('keeps the root passthrough after a refresh', async () => {
      serveTools(rootAndBodyToolsResponse);
      const h = boot();
      await loadPluginTools(h.server);

      serveTools({
        ...rootAndBodyToolsResponse,
        tools: [
          { ...rootAndBodyToolsResponse.tools[0], description: 'Replace a thing. Now with more fields.' },
          ...rootAndBodyToolsResponse.tools.slice(1),
        ],
      });
      const data = dataOf(await h.call('refresh_plugin_tools'));
      expect(data.updated).toEqual(['widgets_replace_thing']);

      const schema = h.tool('widgets_replace_thing').inputSchema as any;
      expect(schema._def.unknownKeys).toBe('passthrough');
      expect(schema.safeParse({ id: '1', color: 'red' }).data.color).toBe('red');
    });
  });

  describe('body designation', () => {
    it('sends the designated argument as the whole body', async () => {
      serveTools(rootAndBodyToolsResponse);
      const h = boot();
      await loadPluginTools(h.server);

      const data = dataOf(
        await h.call('flex_update_object', {
          type: 'contacts',
          key: 'abc',
          lang: 'en',
          object: { title: 'T', type: 'shadowed' },
        }),
      );
      expect(data.method).toBe('PATCH');
      expect(data.path).toBe('/api/v1/flex-objects/contacts/abc');
      expect(data.query).toEqual({ lang: 'en' });
      expect(data.body).toEqual({ title: 'T', type: 'shadowed' });
    });

    it('sends no body when the designated argument is missing', async () => {
      serveTools(rootAndBodyToolsResponse);
      const h = boot();
      await loadPluginTools(h.server);

      const data = dataOf(await h.call('flex_create_object', { type: 'contacts' }));
      expect(data.method).toBe('POST');
      expect(data.path).toBe('/api/v1/flex-objects/contacts');
      expect(data.body).toBeNull();
    });

    it('rejects a designated body argument that is not an object', async () => {
      serveTools(rootAndBodyToolsResponse);
      const h = boot();
      await loadPluginTools(h.server);

      const result = await h.call('flex_update_object', { type: 'contacts', key: 'abc', object: '{"title":"T"}' });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toMatch(
        /The 'object' argument of flex_update_object is the request body and must be an object\./,
      );
    });
  });

  describe('calling', () => {
    it('sends a GET with every argument as a query parameter', async () => {
      const h = boot();
      await loadPluginTools(h.server);

      const data = dataOf(await h.call('kahunacart_list_products', { q: 'shirt', status: 'draft' }));
      expect(data.data.method).toBe('GET');
      expect(data.data.path).toBe('/api/v1/kahunacart/products');
      expect(data.data.query).toEqual({ q: 'shirt', status: 'draft' });
      expect(data.data.body).toBeNull();
    });

    it('attaches pagination the way core tools do', async () => {
      const h = boot();
      await loadPluginTools(h.server);

      const data = dataOf(await h.call('kahunacart_list_products', {}));
      expect(data.pagination).toEqual({ page: 1, per_page: 20, total: 3, total_pages: 1 });
    });

    it('drops undefined arguments', async () => {
      const h = boot();
      await loadPluginTools(h.server);

      const data = dataOf(
        await h.call('kahunacart_list_products', { q: 'shirt', status: undefined, page: undefined }),
      );
      expect(data.data.query).toEqual({ q: 'shirt' });
    });

    it('substitutes path parameters and URL-encodes them', async () => {
      const h = boot();
      await loadPluginTools(h.server);

      const data = dataOf(await h.call('kahunacart_get_product', { id: 'a b/c', lang: 'fr' }));
      expect(data.path).toBe('/api/v1/kahunacart/products/a%20b%2Fc');
      expect(data.query).toEqual({ lang: 'fr' });
    });

    it('refuses a call that is missing a path parameter', async () => {
      const h = boot();
      await loadPluginTools(h.server);

      const result = await h.call('kahunacart_get_product', { lang: 'fr' });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toMatch(/'id' argument is required/);
    });

    it('sends a POST body, routing query-listed arguments to the query string', async () => {
      const h = boot();
      await loadPluginTools(h.server);

      const data = dataOf(
        await h.call('kahunacart_create_product', { title: 'Shirt', status: 'draft', notify: true }),
      );
      expect(data.method).toBe('POST');
      expect(data.query).toEqual({ notify: 'true' });
      expect(data.body).toEqual({ title: 'Shirt', status: 'draft' });
    });

    it('sends a PATCH body with the path parameter removed', async () => {
      const h = boot();
      await loadPluginTools(h.server);

      const data = dataOf(
        await h.call('kahunacart_update_product', {
          id: 12,
          title: 'New title',
          lang: 'fr',
          attributes: { color: 'red', size: null },
        }),
      );
      expect(data.method).toBe('PATCH');
      expect(data.path).toBe('/api/v1/kahunacart/products/12');
      expect(data.query).toEqual({ lang: 'fr' });
      expect(data.body).toEqual({ title: 'New title', attributes: { color: 'red', size: null } });
    });

    it('sends a PUT body', async () => {
      const h = boot();
      await loadPluginTools(h.server);

      const data = dataOf(await h.call('kahunacart_replace_product', { id: 3, title: 'Replaced' }));
      expect(data.method).toBe('PUT');
      expect(data.path).toBe('/api/v1/kahunacart/products/3');
      expect(data.body).toEqual({ title: 'Replaced' });
    });

    it('sends a DELETE body when the tool lists no query parameters', async () => {
      const h = boot();
      await loadPluginTools(h.server);

      const data = dataOf(await h.call('kahunacart_delete_attribute', { id: 'color', force: true }));
      expect(data.method).toBe('DELETE');
      expect(data.path).toBe('/api/v1/kahunacart/attributes/color');
      expect(data.query).toEqual({});
      expect(data.body).toEqual({ force: true });
    });

    it('checks the tool permission before making the request', async () => {
      mockServer.use(
        http.get(`${BASE}/me`, () =>
          HttpResponse.json({ data: { ...limitedUserProfile, access: { 'api.access': true } } }),
        ),
      );

      const h = boot();
      await loadPluginTools(h.server);

      const result = await h.call('kahunacart_list_products', {});
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toMatch(/kahunacart\.products\.manage/);
    });

    it('reports API errors through the shared error handling', async () => {
      mockServer.use(
        http.get(`${BASE}/kahunacart/products`, () =>
          HttpResponse.json({ status: 422, title: 'Unprocessable', detail: 'Bad status filter' }, { status: 422 }),
        ),
      );

      const h = boot();
      await loadPluginTools(h.server);

      const result = await h.call('kahunacart_list_products', { status: 'nope' });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toMatch(/Bad status filter/);
    });
  });

  describe('refresh_plugin_tools', () => {
    it('is registered as a core tool', () => {
      const h = boot();
      expect(h.tool('refresh_plugin_tools')).toBeDefined();
      expect(h.tool('refresh_plugin_tools').description).toMatch(/\[Requires: api\.access\]/);
    });

    it('adds, updates and removes tools to match the new response', async () => {
      const h = boot();
      await loadPluginTools(h.server);

      serveTools(changedMcpToolsResponse);
      const data = dataOf(await h.call('refresh_plugin_tools'));

      expect(data.added).toEqual(['kahunacart_list_orders']);
      expect(data.updated).toEqual(['kahunacart_list_products']);
      expect(data.removed).toEqual(['kahunacart_delete_attribute']);
      expect(h.tool('kahunacart_list_orders')).toBeDefined();
      expect(h.tool('kahunacart_list_products').description).toMatch(/variants filter/);
      expect(h.tool('kahunacart_delete_attribute')).toBeUndefined();
    });

    it('reports nothing changed when the response is the same', async () => {
      const h = boot();
      await loadPluginTools(h.server);

      const data = dataOf(await h.call('refresh_plugin_tools'));
      expect(data).toMatchObject({ added: [], updated: [], removed: [] });
    });

    it('keeps calls working against the updated definition', async () => {
      const h = boot();
      await loadPluginTools(h.server);

      serveTools({
        ...mcpToolsResponse,
        tools: [{ ...mcpToolsResponse.tools[0], path: '/kahunacart/products/{id}', path_params: ['id'] }],
      });
      await h.call('refresh_plugin_tools');

      const data = dataOf(await h.call('kahunacart_list_products', { id: 9 }));
      expect(data.path).toBe('/api/v1/kahunacart/products/9');
    });

    it('says plugin tools are disabled without fetching when the mode is none', async () => {
      let fetched = false;
      mockServer.use(
        http.get(`${BASE}/mcp/tools`, () => {
          fetched = true;
          return HttpResponse.json({ data: mcpToolsResponse });
        }),
      );

      const h = boot('none');
      const data = dataOf(await h.call('refresh_plugin_tools'));

      expect(fetched).toBe(false);
      expect(data.enabled).toBe(false);
      expect(data.message).toMatch(/--plugin-tools none/);
    });
  });

  describe('discover_plugins', () => {
    it('reports the loaded plugin tools grouped by plugin', async () => {
      const h = boot();
      await loadPluginTools(h.server);

      const data = dataOf(await h.call('discover_plugins'));
      expect(data.mcp_tools).toEqual([
        {
          plugin: 'kahunacart',
          tools: [
            'kahunacart_list_products',
            'kahunacart_get_product',
            'kahunacart_create_product',
            'kahunacart_update_product',
            'kahunacart_replace_product',
            'kahunacart_delete_attribute',
          ],
        },
        { plugin: 'seo', tools: ['seo_audit'] },
      ]);
    });

    it('reports an empty list when no plugin tools were loaded', async () => {
      const h = boot('none');
      await loadPluginTools(h.server);

      const data = dataOf(await h.call('discover_plugins'));
      expect(data.mcp_tools).toEqual([]);
    });

    it('reads the loader\'s last response rather than fetching again', async () => {
      let fetches = 0;
      mockServer.use(
        http.get(`${BASE}/mcp/tools`, () => {
          fetches += 1;
          return HttpResponse.json({ data: mcpToolsResponse });
        }),
      );

      const h = boot();
      await loadPluginTools(h.server);
      await h.call('discover_plugins');
      await h.call('discover_plugins', { refresh: true });

      expect(fetches).toBe(1);
      expect(getPluginToolSummaries().map((g) => g.plugin)).toEqual(['kahunacart', 'seo']);
    });
  });
});
