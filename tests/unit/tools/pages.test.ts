import { describe, it, expect, beforeAll } from 'vitest';
import { GravClient } from '../../../src/client/grav-client.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerPageTools } from '../../../src/tools/pages.js';

describe('Page Tools', () => {
  let client: GravClient;
  let server: McpServer;
  const ensureInit = async () => { await client.initialize(); };

  beforeAll(async () => {
    client = new GravClient({ baseUrl: 'http://test.local/api', apiKey: 'grav_test' });
    server = new McpServer({ name: 'test', version: '0.0.1' });
    registerPageTools(server, client, ensureInit);
  });

  // Helper to call a tool by name
  async function callTool(name: string, args: Record<string, unknown> = {}): Promise<unknown> {
    // Access internal registered tools to call handler directly
    const tools = (server as any)._registeredTools as Record<string, any>;
    const tool = tools[name];
    if (!tool) throw new Error(`Tool ${name} not found`);
    return tool.handler(args, {});
  }

  describe('list_pages', () => {
    it('returns paginated page list', async () => {
      const result = await callTool('list_pages') as any;
      expect(result.isError).toBeUndefined();
      const data = JSON.parse(result.content[0].text);
      expect(data.data).toBeDefined();
      expect(Array.isArray(data.data)).toBe(true);
      expect(data.pagination).toBeDefined();
      expect(data.pagination.total).toBe(3);
    });

    it('passes search parameter', async () => {
      const result = await callTool('list_pages', { search: 'hello' }) as any;
      expect(result.isError).toBeUndefined();
    });

    it('passes filter parameters', async () => {
      const result = await callTool('list_pages', {
        template: 'item',
        published: true,
        sort: 'date',
        order: 'desc',
      }) as any;
      expect(result.isError).toBeUndefined();
    });
  });

  describe('get_page', () => {
    it('returns full page with ETag', async () => {
      const result = await callTool('get_page', { route: '/blog/hello-world' }) as any;
      expect(result.isError).toBeUndefined();
      const data = JSON.parse(result.content[0].text);
      expect(data.title).toBe('Hello World');
      expect(data.content).toContain('Hello World');
      expect(data._etag).toBe('"etag-hello-world"');
    });

    it('returns error for nonexistent page', async () => {
      const result = await callTool('get_page', { route: '/nonexistent' }) as any;
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('not found');
    });

    it('strips leading slashes from route', async () => {
      const result = await callTool('get_page', { route: 'blog/hello-world' }) as any;
      expect(result.isError).toBeUndefined();
    });
  });

  describe('create_page', () => {
    it('creates page with required fields', async () => {
      const result = await callTool('create_page', {
        route: '/blog/new-post',
        title: 'New Post',
      }) as any;
      expect(result.isError).toBeUndefined();
      const data = JSON.parse(result.content[0].text);
      expect(data.title).toBe('New Post');
    });

    it('creates page with all optional fields', async () => {
      const result = await callTool('create_page', {
        route: '/blog/new-post',
        title: 'New Post',
        content: '# Content',
        template: 'item',
        header: { taxonomy: { tag: ['new'] } },
        visible: true,
        order: 5,
      }) as any;
      expect(result.isError).toBeUndefined();
    });
  });

  describe('update_page', () => {
    it('updates page fields', async () => {
      const result = await callTool('update_page', {
        route: '/blog/hello-world',
        title: 'Updated Title',
      }) as any;
      expect(result.isError).toBeUndefined();
      const data = JSON.parse(result.content[0].text);
      expect(data.title).toBe('Updated Title');
      expect(data._etag).toBe('"etag-updated"');
    });

    it('passes ETag for conflict detection', async () => {
      const result = await callTool('update_page', {
        route: '/blog/hello-world',
        title: 'Updated',
        etag: '"etag-hello-world"',
      }) as any;
      expect(result.isError).toBeUndefined();
    });

    it('sends lang as a query parameter, not in the body', async () => {
      const result = await callTool('update_page', {
        route: '/blog/hello-world',
        title: 'Updated',
        lang: 'en',
      }) as any;
      expect(result.isError).toBeUndefined();
      const data = JSON.parse(result.content[0].text);
      expect(data._query_lang).toBe('en');
      expect(data.lang).toBeUndefined();
    });

    it('returns error on stale ETag', async () => {
      const result = await callTool('update_page', {
        route: '/blog/hello-world',
        title: 'Updated',
        etag: '"stale-etag"',
      }) as any;
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('modified');
    });
  });

  describe('delete_page', () => {
    it('deletes page successfully', async () => {
      const result = await callTool('delete_page', { route: '/blog/hello-world' }) as any;
      expect(result.isError).toBeUndefined();
      const data = JSON.parse(result.content[0].text);
      expect(data.success).toBe(true);
    });
  });

  describe('move_page', () => {
    it('moves page to new parent', async () => {
      const result = await callTool('move_page', {
        route: '/blog/hello-world',
        parent: '/news',
      }) as any;
      expect(result.isError).toBeUndefined();
    });
  });

  describe('copy_page', () => {
    it('copies page to new route', async () => {
      const result = await callTool('copy_page', {
        route: '/blog/hello-world',
        destination_route: '/blog/hello-world-copy',
      }) as any;
      expect(result.isError).toBeUndefined();
    });
  });

  describe('batch_pages', () => {
    it('performs batch operation', async () => {
      const result = await callTool('batch_pages', {
        operation: 'publish',
        routes: ['/blog/hello-world', '/about'],
      }) as any;
      expect(result.isError).toBeUndefined();
    });
  });

  describe('reorder_pages', () => {
    it('reorders children', async () => {
      const result = await callTool('reorder_pages', {
        parent_route: '/blog',
        order: ['hello-world', 'second-post'],
      }) as any;
      expect(result.isError).toBeUndefined();
    });
  });

  describe('reorganize_pages', () => {
    it('reorganizes multiple pages atomically', async () => {
      const result = await callTool('reorganize_pages', {
        operations: [
          { route: '/blog/hello-world', parent: '/news', position: 1 },
        ],
      }) as any;
      expect(result.isError).toBeUndefined();
    });
  });
});
