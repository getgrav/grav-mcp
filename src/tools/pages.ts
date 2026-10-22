import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { GravClient } from '../client/grav-client.js';
import type { Page, PageSummary } from '../types/grav-api.js';
import { handleToolCall, toolResult, buildQuery, addPaginationInfo } from './helpers.js';

export function registerPageTools(
  server: McpServer,
  client: GravClient,
  ensureInit: () => Promise<void>,
): void {
  // @api GET /pages
  server.registerTool('list_pages', {
    title: 'List Pages',
    description:
      'List and search CMS pages with filtering by template, published status, visibility, parent route, and full-text search. Supports sorting and pagination. Returns page summaries. [Requires: api.pages.read]',
    inputSchema: {
      search: z.string().optional().describe('Full-text search query'),
      template: z.string().optional().describe('Filter by page template (e.g. "blog", "item")'),
      published: z.boolean().optional().describe('Filter by published status'),
      visible: z.boolean().optional().describe('Filter by visibility'),
      routable: z.boolean().optional().describe('Filter by routable status'),
      parent: z.string().optional().describe('Filter by parent route (e.g. "/blog")'),
      children_of: z.string().optional().describe('Get direct children of this route'),
      root: z.boolean().optional().describe('Only return root-level pages'),
      sort: z.enum(['date', 'title', 'slug', 'modified', 'order', 'default']).optional().describe('Sort field'),
      order: z.enum(['asc', 'desc']).optional().describe('Sort order'),
      page: z.number().int().min(1).optional().describe('Page number (default: 1)'),
      per_page: z.number().int().min(1).max(100).optional().describe('Items per page (default: 50)'),
      lang: z.string().optional().describe('Language code for multilingual sites'),
      translations: z.boolean().optional().describe('Include translation info'),
    },
    annotations: { readOnlyHint: true },
  }, async (args) => handleToolCall(ensureInit, async () => {
    client.checkPermission('api.pages.read');
    const query = buildQuery({
      search: args.search,
      template: args.template,
      published: args.published !== undefined ? String(args.published) : undefined,
      visible: args.visible !== undefined ? String(args.visible) : undefined,
      routable: args.routable !== undefined ? String(args.routable) : undefined,
      parent: args.parent,
      children_of: args.children_of,
      root: args.root !== undefined ? String(args.root) : undefined,
      sort: args.sort,
      order: args.order,
      page: args.page ?? 1,
      per_page: args.per_page ?? 50,
      lang: args.lang,
      translations: args.translations !== undefined ? String(args.translations) : undefined,
    });
    const response = await client.get<PageSummary[]>('/pages', query);
    return toolResult(addPaginationInfo(response.data, response.meta));
  }));

  // @api GET /pages/{route}
  server.registerTool('get_page', {
    title: 'Get Page',
    description:
      'Get full details of a single page including content (markdown or rendered HTML), header/frontmatter fields, media files, and taxonomy. Options to include children and translation info. [Requires: api.pages.read]',
    inputSchema: {
      route: z.string().describe('Page route (e.g. "/blog/my-post")'),
      render: z.boolean().optional().describe('Return rendered HTML instead of raw markdown'),
      children: z.boolean().optional().describe('Include child pages'),
      children_depth: z.number().int().min(1).max(10).optional().describe('Depth for child pages (default: 1)'),
      lang: z.string().optional().describe('Language code'),
      translations: z.boolean().optional().describe('Include translation info'),
    },
    annotations: { readOnlyHint: true },
  }, async (args) => handleToolCall(ensureInit, async () => {
    client.checkPermission('api.pages.read');
    const route = args.route.replace(/^\/+/, '');
    const query = buildQuery({
      render: args.render !== undefined ? String(args.render) : undefined,
      children: args.children !== undefined ? String(args.children) : undefined,
      children_depth: args.children_depth,
      lang: args.lang,
      translations: args.translations !== undefined ? String(args.translations) : undefined,
    });
    const response = await client.get<Page>(`/pages/${route}`, query);
    const result: Record<string, unknown> = { ...response.data };
    if (response.etag) result._etag = response.etag;
    return toolResult(result);
  }));

  // @api POST /pages
  server.registerTool('create_page', {
    title: 'Create Page',
    description:
      'Create a new page at the specified route. Requires title and route at minimum. You can set template, content (markdown), header/frontmatter fields, visibility, and ordering. [Requires: api.pages.write]',
    inputSchema: {
      route: z.string().describe('Page route (e.g. "/blog/new-post")'),
      title: z.string().describe('Page title'),
      content: z.string().optional().describe('Page content in markdown'),
      template: z.string().optional().describe('Page template (default: "default")'),
      header: z.record(z.unknown()).optional().describe('Frontmatter/header fields as key-value pairs'),
      visible: z.boolean().optional().describe('Make page visible in navigation'),
      order: z.number().int().optional().describe('Numeric ordering value'),
      lang: z.string().optional().describe('Language for the page'),
    },
    annotations: { readOnlyHint: false },
  }, async (args) => handleToolCall(ensureInit, async () => {
    client.checkPermission('api.pages.write');
    const body: Record<string, unknown> = {
      route: args.route,
      title: args.title,
    };
    if (args.content !== undefined) body.content = args.content;
    if (args.template !== undefined) body.template = args.template;
    if (args.header !== undefined) body.header = args.header;
    if (args.visible !== undefined) body.visible = args.visible;
    if (args.order !== undefined) body.order = args.order;
    if (args.lang !== undefined) body.lang = args.lang;

    const response = await client.post<Page>('/pages', body);
    return toolResult(response.data);
  }));

  // @api PATCH /pages/{route}
  server.registerTool('update_page', {
    title: 'Update Page',
    description:
      'Update an existing page. Only the fields you provide will be changed — header fields are deep-merged. Pass etag (from get_page) for conflict detection; if omitted, overwrites without checking. [Requires: api.pages.write]',
    inputSchema: {
      route: z.string().describe('Page route to update'),
      title: z.string().optional().describe('New page title'),
      content: z.string().optional().describe('New content in markdown'),
      template: z.string().optional().describe('Change page template'),
      header: z.record(z.unknown()).optional().describe('Header fields to merge (deep-merged with existing)'),
      published: z.boolean().optional().describe('Set published status'),
      visible: z.boolean().optional().describe('Set visibility'),
      lang: z.string().optional().describe('Language to update'),
      etag: z.string().optional().describe('ETag from get_page for optimistic concurrency'),
    },
    annotations: { readOnlyHint: false },
  }, async (args) => handleToolCall(ensureInit, async () => {
    client.checkPermission('api.pages.write');
    const route = args.route.replace(/^\/+/, '');
    const body: Record<string, unknown> = {};
    if (args.title !== undefined) body.title = args.title;
    if (args.content !== undefined) body.content = args.content;
    if (args.template !== undefined) body.template = args.template;
    if (args.header !== undefined) body.header = args.header;
    if (args.published !== undefined) body.published = args.published;
    if (args.visible !== undefined) body.visible = args.visible;

    // The API reads the language to update from the query string, not the body
    const response = await client.patch<Page>(`/pages/${route}`, body, {
      etag: args.etag,
      query: buildQuery({ lang: args.lang }),
    });
    const result: Record<string, unknown> = { ...response.data };
    if (response.etag) result._etag = response.etag;
    return toolResult(result);
  }));

  // @api DELETE /pages/{route}
  server.registerTool('delete_page', {
    title: 'Delete Page',
    description:
      'Delete a page. By default deletes the page and all children. Set lang to delete only a specific language translation. [Requires: api.pages.write]',
    inputSchema: {
      route: z.string().describe('Page route to delete'),
      lang: z.string().optional().describe('Delete only this language translation'),
    },
    annotations: { readOnlyHint: false, destructiveHint: true },
  }, async (args) => handleToolCall(ensureInit, async () => {
    client.checkPermission('api.pages.write');
    const route = args.route.replace(/^\/+/, '');
    const query = buildQuery({ lang: args.lang });
    await client.delete(`/pages/${route}`, query);
    return toolResult({ success: true, message: `Page "${args.route}" deleted.` });
  }));

  // @api POST /pages/{route}/move
  server.registerTool('move_page', {
    title: 'Move Page',
    description:
      'Move a page to a new parent location and/or rename its slug. The page and all its children will move together. [Requires: api.pages.write]',
    inputSchema: {
      route: z.string().describe('Current page route'),
      parent: z.string().describe('New parent route (e.g. "/blog")'),
      slug: z.string().optional().describe('New slug (if renaming)'),
      order: z.number().int().optional().describe('Position among siblings'),
    },
    annotations: { readOnlyHint: false },
  }, async (args) => handleToolCall(ensureInit, async () => {
    client.checkPermission('api.pages.write');
    const route = args.route.replace(/^\/+/, '');
    const body: Record<string, unknown> = { parent: args.parent };
    if (args.slug !== undefined) body.slug = args.slug;
    if (args.order !== undefined) body.order = args.order;

    const response = await client.post<Page>(`/pages/${route}/move`, body);
    return toolResult(response.data);
  }));

  // @api POST /pages/{route}/copy
  server.registerTool('copy_page', {
    title: 'Copy Page',
    description:
      'Duplicate a page (with all its media files) to a new route. [Requires: api.pages.write]',
    inputSchema: {
      route: z.string().describe('Source page route'),
      destination_route: z.string().describe('Destination route for the copy'),
    },
    annotations: { readOnlyHint: false },
  }, async (args) => handleToolCall(ensureInit, async () => {
    client.checkPermission('api.pages.write');
    const route = args.route.replace(/^\/+/, '');
    const response = await client.post<Page>(`/pages/${route}/copy`, {
      route: args.destination_route,
    });
    return toolResult(response.data);
  }));

  // @api POST /pages/batch
  server.registerTool('batch_pages', {
    title: 'Batch Page Operations',
    description:
      'Perform bulk operations on multiple pages at once. Operations: publish, unpublish, delete, copy. Maximum 50 pages per batch. [Requires: api.pages.write]',
    inputSchema: {
      operation: z.enum(['publish', 'unpublish', 'delete', 'copy']).describe('Operation to perform'),
      routes: z.array(z.string()).min(1).max(50).describe('Array of page routes to operate on'),
    },
    annotations: { readOnlyHint: false, destructiveHint: true },
  }, async (args) => handleToolCall(ensureInit, async () => {
    client.checkPermission('api.pages.write');
    const response = await client.post<unknown>('/pages/batch', {
      operation: args.operation,
      routes: args.routes,
    });
    return toolResult(response.data);
  }));

  // @api POST /pages/{route}/reorder
  server.registerTool('reorder_pages', {
    title: 'Reorder Pages',
    description:
      'Reorder the child pages under a parent by specifying the slugs in the desired sequence. [Requires: api.pages.write]',
    inputSchema: {
      parent_route: z.string().describe('Parent page route whose children to reorder'),
      order: z.array(z.string()).min(1).describe('Array of child slugs in desired order'),
    },
    annotations: { readOnlyHint: false },
  }, async (args) => handleToolCall(ensureInit, async () => {
    client.checkPermission('api.pages.write');
    const route = args.parent_route.replace(/^\/+/, '');
    const response = await client.post<unknown>(`/pages/${route}/reorder`, {
      order: args.order,
    });
    return toolResult(response.data);
  }));

  // @api POST /pages/reorganize
  server.registerTool('reorganize_pages', {
    title: 'Reorganize Pages',
    description:
      'Atomically move and reorder multiple pages in a single operation. Each operation specifies a page route, optional new parent, and optional position. All moves are validated before applying. [Requires: api.pages.write]',
    inputSchema: {
      operations: z.array(z.object({
        route: z.string().describe('Page route to move'),
        parent: z.string().optional().describe('New parent route'),
        position: z.number().int().optional().describe('Position among siblings'),
      })).min(1).max(50).describe('Array of move operations'),
    },
    annotations: { readOnlyHint: false },
  }, async (args) => handleToolCall(ensureInit, async () => {
    client.checkPermission('api.pages.write');
    const response = await client.post<unknown>('/pages/reorganize', {
      operations: args.operations,
    });
    return toolResult(response.data);
  }));
}
