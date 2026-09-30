import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { GravClient } from '../client/grav-client.js';
import type { MediaItem } from '../types/grav-api.js';
import { handleToolCall, toolResult, buildQuery, addPaginationInfo } from './helpers.js';

export function registerMediaTools(
  server: McpServer,
  client: GravClient,
  ensureInit: () => Promise<void>,
): void {
  // @api GET /pages/{route}/media
  server.registerTool('list_page_media', {
    title: 'List Page Media',
    description:
      'List all media files attached to a specific page including filename, type, size, dimensions, and thumbnail URLs. [Requires: api.media.read]',
    inputSchema: {
      route: z.string().describe('Page route (e.g. "/blog/my-post")'),
    },
    annotations: { readOnlyHint: true },
  }, async (args) => handleToolCall(ensureInit, async () => {
    client.checkPermission('api.media.read');
    const route = args.route.replace(/^\/+/, '');
    const response = await client.get<MediaItem[]>(`/pages/${route}/media`);
    return toolResult(response.data);
  }));

  // @api POST /pages/{route}/media
  server.registerTool('upload_page_media', {
    title: 'Upload Page Media',
    description:
      'Upload media files to a page. Each file needs a filename and base64-encoded content. Supports images, videos, documents, and other file types. [Requires: api.media.write]',
    inputSchema: {
      route: z.string().describe('Page route to upload media to'),
      files: z.array(z.object({
        filename: z.string().describe('Filename with extension (e.g. "photo.jpg")'),
        content_base64: z.string().describe('Base64-encoded file content'),
        content_type: z.string().optional().describe('MIME type (auto-detected from extension if omitted)'),
      })).min(1).describe('Array of files to upload'),
    },
    annotations: { readOnlyHint: false },
  }, async (args) => handleToolCall(ensureInit, async () => {
    client.checkPermission('api.media.write');
    const route = args.route.replace(/^\/+/, '');
    const files = args.files.map((f) => ({
      filename: f.filename,
      content: Buffer.from(f.content_base64, 'base64'),
      contentType: f.content_type || guessMimeType(f.filename),
    }));
    const response = await client.uploadFile<MediaItem[]>(`/pages/${route}/media`, files);
    return toolResult(response.data);
  }));

  // @api DELETE /pages/{route}/media/{filename}
  server.registerTool('delete_page_media', {
    title: 'Delete Page Media',
    description:
      'Delete a specific media file from a page. [Requires: api.media.write]',
    inputSchema: {
      route: z.string().describe('Page route'),
      filename: z.string().describe('Filename to delete (e.g. "photo.jpg")'),
    },
    annotations: { readOnlyHint: false, destructiveHint: true },
  }, async (args) => handleToolCall(ensureInit, async () => {
    client.checkPermission('api.media.write');
    const route = args.route.replace(/^\/+/, '');
    await client.delete(`/pages/${route}/media/${args.filename}`);
    return toolResult({ success: true, message: `Deleted "${args.filename}" from "${args.route}".` });
  }));

  // @api GET /media
  server.registerTool('list_site_media', {
    title: 'List Site Media',
    description:
      'Browse site-level media files with folder navigation, search, and type filtering. [Requires: api.media.read]',
    inputSchema: {
      path: z.string().optional().describe('Subfolder path to browse (e.g. "images/2024")'),
      search: z.string().optional().describe('Search files by name'),
      type: z.enum(['image', 'video', 'audio', 'document']).optional().describe('Filter by file type'),
      page: z.number().int().min(1).optional().describe('Page number'),
      per_page: z.number().int().min(1).max(100).optional().describe('Items per page'),
    },
    annotations: { readOnlyHint: true },
  }, async (args) => handleToolCall(ensureInit, async () => {
    client.checkPermission('api.media.read');
    const query = buildQuery({
      path: args.path,
      search: args.search,
      type: args.type,
      page: args.page ?? 1,
      per_page: args.per_page ?? 50,
    });
    const response = await client.get<unknown>('/media', query);
    return toolResult(addPaginationInfo(response.data, response.meta));
  }));

  // @api POST /media
  server.registerTool('upload_site_media', {
    title: 'Upload Site Media',
    description:
      'Upload files to the site-level media folder. Optionally specify a subfolder path. [Requires: api.media.write]',
    inputSchema: {
      files: z.array(z.object({
        filename: z.string().describe('Filename with extension'),
        content_base64: z.string().describe('Base64-encoded file content'),
        content_type: z.string().optional().describe('MIME type'),
      })).min(1).describe('Array of files to upload'),
      path: z.string().optional().describe('Subfolder to upload to'),
    },
    annotations: { readOnlyHint: false },
  }, async (args) => handleToolCall(ensureInit, async () => {
    client.checkPermission('api.media.write');
    const files = args.files.map((f) => ({
      filename: f.filename,
      content: Buffer.from(f.content_base64, 'base64'),
      contentType: f.content_type || guessMimeType(f.filename),
    }));
    const query = buildQuery({ path: args.path });
    const response = await client.uploadFile<unknown>('/media', files, { query });
    return toolResult(response.data);
  }));

  // @api DELETE /media/{filename}
  server.registerTool('delete_site_media', {
    title: 'Delete Site Media',
    description:
      'Delete a file from site-level media. Provide the full relative path including filename. [Requires: api.media.write]',
    inputSchema: {
      path: z.string().describe('Relative path to file (e.g. "images/photo.jpg")'),
    },
    annotations: { readOnlyHint: false, destructiveHint: true },
  }, async (args) => handleToolCall(ensureInit, async () => {
    client.checkPermission('api.media.write');
    await client.delete(`/media/${args.path}`);
    return toolResult({ success: true, message: `Deleted "${args.path}".` });
  }));

  // @api POST /media/folders
  server.registerTool('create_media_folder', {
    title: 'Create Media Folder',
    description:
      'Create a new subfolder in the site media directory. [Requires: api.media.write]',
    inputSchema: {
      path: z.string().describe('Folder path to create (e.g. "images/2024")'),
    },
    annotations: { readOnlyHint: false },
  }, async (args) => handleToolCall(ensureInit, async () => {
    client.checkPermission('api.media.write');
    const response = await client.post<unknown>('/media/folders', { path: args.path });
    return toolResult(response.data);
  }));

  // @api POST /media/folders/rename
  // @api DELETE /media/folders/{path}
  server.registerTool('manage_media_folder', {
    title: 'Manage Media Folder',
    description:
      'Rename or delete a media folder. For rename, provide both the current path and the new path. [Requires: api.media.write]',
    inputSchema: {
      action: z.enum(['rename', 'delete']).describe('Action to perform'),
      path: z.string().describe('Current folder path'),
      new_path: z.string().optional().describe('New folder path (required for rename)'),
    },
    annotations: { readOnlyHint: false, destructiveHint: true },
  }, async (args) => handleToolCall(ensureInit, async () => {
    client.checkPermission('api.media.write');
    if (args.action === 'rename') {
      if (!args.new_path) {
        return toolResult({ error: 'new_path is required for rename action' });
      }
      const response = await client.post<unknown>('/media/folders/rename', {
        path: args.path,
        new_path: args.new_path,
      });
      return toolResult(response.data);
    } else {
      await client.delete(`/media/folders/${args.path}`);
      return toolResult({ success: true, message: `Folder "${args.path}" deleted.` });
    }
  }));
}

function guessMimeType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase();
  const mimeMap: Record<string, string> = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif',
    webp: 'image/webp', svg: 'image/svg+xml', ico: 'image/x-icon',
    mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime',
    mp3: 'audio/mpeg', ogg: 'audio/ogg', wav: 'audio/wav',
    pdf: 'application/pdf', zip: 'application/zip',
    doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    json: 'application/json', xml: 'application/xml',
    txt: 'text/plain', md: 'text/markdown', csv: 'text/csv',
    html: 'text/html', css: 'text/css', js: 'application/javascript',
  };
  return mimeMap[ext || ''] || 'application/octet-stream';
}
