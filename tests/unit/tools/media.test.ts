import { describe, it, expect, beforeAll } from 'vitest';
import { http, HttpResponse } from 'msw';
import { mockServer } from '../../mocks/handlers.js';
import { GravClient } from '../../../src/client/grav-client.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerMediaTools } from '../../../src/tools/media.js';

describe('Media Tools', () => {
  let client: GravClient;
  let server: McpServer;
  const ensureInit = async () => { await client.initialize(); };

  beforeAll(async () => {
    client = new GravClient({ baseUrl: 'http://test.local/api', apiKey: 'grav_test' });
    server = new McpServer({ name: 'test', version: '0.0.1' });
    registerMediaTools(server, client, ensureInit);
  });

  async function callTool(name: string, args: Record<string, unknown> = {}): Promise<any> {
    const tools = (server as any)._registeredTools as Record<string, any>;
    const tool = tools[name];
    if (!tool) throw new Error(`Tool ${name} not found`);
    return tool.handler(args, {});
  }

  describe('list_page_media', () => {
    it('returns media for a page', async () => {
      const result = await callTool('list_page_media', { route: '/blog/hello-world' });
      expect(result.isError).toBeUndefined();
      const data = JSON.parse(result.content[0].text);
      // Media array comes back from mock — could be array or wrapped
      const items = Array.isArray(data) ? data : [data];
      expect(items.length).toBeGreaterThan(0);
    });
  });

  describe('upload_page_media', () => {
    it('uploads base64 file', async () => {
      const result = await callTool('upload_page_media', {
        route: '/blog/hello-world',
        files: [{
          filename: 'test.jpg',
          content_base64: Buffer.from('fake-image-data').toString('base64'),
          content_type: 'image/jpeg',
        }],
      });
      expect(result.isError).toBeUndefined();
    });
  });

  describe('delete_page_media', () => {
    it('deletes media file', async () => {
      const result = await callTool('delete_page_media', {
        route: '/blog/hello-world',
        filename: 'hero.jpg',
      });
      expect(result.isError).toBeUndefined();
      const data = JSON.parse(result.content[0].text);
      expect(data.success).toBe(true);
    });
  });

  describe('list_site_media', () => {
    it('returns paginated site media', async () => {
      const result = await callTool('list_site_media');
      expect(result.isError).toBeUndefined();
    });
  });

  describe('upload_site_media', () => {
    it('sends the subfolder as the path query parameter', async () => {
      let requestUrl = '';
      mockServer.use(
        http.post('http://test.local/api/v1/media', ({ request }) => {
          requestUrl = request.url;
          return HttpResponse.json({ data: [{ filename: 'photo.jpg', type: 'image' }] });
        }),
      );
      const result = await callTool('upload_site_media', {
        path: 'images/2024',
        files: [{
          filename: 'photo.jpg',
          content_base64: Buffer.from('fake-image-data').toString('base64'),
        }],
      });
      expect(result.isError).toBeUndefined();
      expect(new URL(requestUrl).searchParams.get('path')).toBe('images/2024');
    });
  });

  describe('delete_site_media', () => {
    it('deletes site media file', async () => {
      const result = await callTool('delete_site_media', { path: 'images/old.jpg' });
      expect(result.isError).toBeUndefined();
      const data = JSON.parse(result.content[0].text);
      expect(data.success).toBe(true);
    });
  });

  describe('create_media_folder', () => {
    it('creates folder', async () => {
      const result = await callTool('create_media_folder', { path: 'images/2024' });
      expect(result.isError).toBeUndefined();
      const data = JSON.parse(result.content[0].text);
      expect(data.type).toBe('folder');
    });
  });

  describe('manage_media_folder', () => {
    it('renames folder', async () => {
      const result = await callTool('manage_media_folder', {
        action: 'rename',
        path: 'old-name',
        new_path: 'new-name',
      });
      expect(result.isError).toBeUndefined();
    });

    it('deletes folder', async () => {
      const result = await callTool('manage_media_folder', {
        action: 'delete',
        path: 'old-folder',
      });
      expect(result.isError).toBeUndefined();
    });

    it('returns error when renaming without new_path', async () => {
      const result = await callTool('manage_media_folder', {
        action: 'rename',
        path: 'old-name',
      });
      const data = JSON.parse(result.content[0].text);
      expect(data.error).toContain('new_path is required');
    });
  });
});
