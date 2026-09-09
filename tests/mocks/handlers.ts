import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import * as pageFixtures from './fixtures/pages.js';
import * as userFixtures from './fixtures/users.js';
import * as configFixtures from './fixtures/config.js';
import * as systemFixtures from './fixtures/system.js';
import * as gpmFixtures from './fixtures/gpm.js';
import * as webhookFixtures from './fixtures/webhooks.js';
import * as blueprintFixtures from './fixtures/blueprints.js';
import * as pluginFixtures from './fixtures/plugins.js';
import { mcpToolsResponse } from './fixtures/mcp-tools.js';

const BASE = '*/v1';

function jsonResponse(data: unknown, meta?: unknown, headers?: Record<string, string>) {
  const body: Record<string, unknown> = { data };
  if (meta) body.meta = meta;
  return HttpResponse.json(body, { headers });
}

function paginatedResponse(data: unknown[], pagination: unknown) {
  return jsonResponse(data, { pagination });
}

function errorResponse(status: number, title: string, detail?: string) {
  return HttpResponse.json({ status, title, detail }, { status });
}

export const handlers = [
  // Auth / Profile
  http.get(`${BASE}/me`, () => jsonResponse(userFixtures.userProfile)),

  // Pages
  http.get(`${BASE}/pages`, () =>
    paginatedResponse(pageFixtures.pageList, pageFixtures.pagination),
  ),
  http.get(`${BASE}/pages/:route+`, ({ params }) => {
    const routeParts = params.route as string[];
    const route = routeParts.join('/');

    // Handle sub-routes: /pages/{route}/languages, /pages/{route}/media, /pages/{route}/compare
    const lastPart = routeParts[routeParts.length - 1];
    if (lastPart === 'languages') {
      return jsonResponse({ translated: ['en'], untranslated: ['fr', 'de'] });
    }
    if (lastPart === 'compare') {
      return jsonResponse({
        source: { title: 'Hello World', content: '# Hello' },
        target: { title: 'Bonjour le Monde', content: '# Bonjour' },
      });
    }
    if (lastPart === 'media') {
      return jsonResponse(pageFixtures.singlePage.media);
    }

    if (route === 'blog/hello-world') {
      return jsonResponse(pageFixtures.singlePage, undefined, { ETag: '"etag-hello-world"' });
    }
    if (route === 'nonexistent') {
      return errorResponse(404, 'Not Found', 'Page not found');
    }
    return jsonResponse(pageFixtures.singlePage, undefined, { ETag: `"etag-${route}"` });
  }),
  http.post(`${BASE}/pages`, async ({ request }) => {
    const body = await request.json() as Record<string, unknown>;
    return HttpResponse.json(
      { data: { ...pageFixtures.createdPage, ...body } },
      { status: 201 },
    );
  }),
  http.patch(`${BASE}/pages/:route+`, async ({ request }) => {
    const ifMatch = request.headers.get('If-Match');
    if (ifMatch === '"stale-etag"') {
      return errorResponse(409, 'Conflict', 'Resource was modified');
    }
    const body = await request.json() as Record<string, unknown>;
    return jsonResponse(
      { ...pageFixtures.singlePage, ...body },
      undefined,
      { ETag: '"etag-updated"' },
    );
  }),
  http.delete(`${BASE}/pages/:route+`, () => new HttpResponse(null, { status: 204 })),
  http.post(`${BASE}/pages/:route+/move`, async ({ request }) => {
    const body = await request.json() as Record<string, unknown>;
    return jsonResponse({ ...pageFixtures.singlePage, route: body.parent + '/' + pageFixtures.singlePage.slug });
  }),
  http.post(`${BASE}/pages/:route+/copy`, () => jsonResponse(pageFixtures.createdPage)),
  http.post(`${BASE}/pages/batch`, () => jsonResponse({ results: [{ route: '/blog', status: 'ok' }] })),
  http.post(`${BASE}/pages/:route+/reorder`, () => jsonResponse({ success: true })),
  http.post(`${BASE}/pages/reorganize`, () => jsonResponse({ affected: 3 })),

  // Multilingual
  http.get(`${BASE}/languages`, () =>
    jsonResponse([
      { code: 'en', name: 'English', default: true },
      { code: 'fr', name: 'French' },
      { code: 'de', name: 'German' },
    ]),
  ),
  http.get(`${BASE}/pages/:route+/languages`, () =>
    jsonResponse({ translated: ['en'], untranslated: ['fr', 'de'] }),
  ),
  http.post(`${BASE}/pages/:route+/translate`, () =>
    jsonResponse({ ...pageFixtures.singlePage, title: 'Bonjour le Monde' }),
  ),
  http.get(`${BASE}/pages/:route+/compare`, () =>
    jsonResponse({
      source: { title: 'Hello World', content: '# Hello' },
      target: { title: 'Bonjour le Monde', content: '# Bonjour' },
    }),
  ),

  // Media
  http.get(`${BASE}/pages/:route+/media`, () => jsonResponse(pageFixtures.singlePage.media)),
  http.post(`${BASE}/pages/:route+/media`, () => jsonResponse(pageFixtures.singlePage.media)),
  http.delete(`${BASE}/pages/:route+/media/:filename`, () => new HttpResponse(null, { status: 204 })),
  http.get(`${BASE}/media`, () =>
    paginatedResponse(
      [{ filename: 'logo.png', type: 'image', size: 5000 }],
      { page: 1, per_page: 50, total: 1, total_pages: 1 },
    ),
  ),
  http.post(`${BASE}/media`, () => jsonResponse([{ filename: 'upload.jpg', type: 'image' }])),
  http.delete(`${BASE}/media/:path+`, () => new HttpResponse(null, { status: 204 })),
  http.post(`${BASE}/media/folders`, () => jsonResponse({ name: 'new-folder', path: 'new-folder', type: 'folder' })),
  http.post(`${BASE}/media/folders/rename`, () => jsonResponse({ name: 'renamed', path: 'renamed', type: 'folder' })),
  http.delete(`${BASE}/media/folders/:path+`, () => new HttpResponse(null, { status: 204 })),

  // Config
  http.get(`${BASE}/config`, () => jsonResponse(configFixtures.configScopes)),
  http.get(`${BASE}/config/system`, () =>
    jsonResponse(configFixtures.systemConfig, undefined, { ETag: '"etag-system"' }),
  ),
  http.get(`${BASE}/config/plugins/:name`, () =>
    jsonResponse(configFixtures.pluginConfig, undefined, { ETag: '"etag-plugin"' }),
  ),
  http.get(`${BASE}/config/:scope+`, () =>
    jsonResponse({}, undefined, { ETag: '"etag-config"' }),
  ),
  http.patch(`${BASE}/config/:scope+`, async ({ request }) => {
    const body = await request.json() as Record<string, unknown>;
    return jsonResponse(body, undefined, { ETag: '"etag-config-updated"' });
  }),

  // Users
  http.get(`${BASE}/users`, () =>
    paginatedResponse(userFixtures.userList, { page: 1, per_page: 50, total: 2, total_pages: 1 }),
  ),
  http.get(`${BASE}/users/:username`, ({ params }) => {
    const user = userFixtures.userList.find((u) => u.username === params.username);
    if (!user) return errorResponse(404, 'Not Found', 'User not found');
    return jsonResponse(user, undefined, { ETag: `"etag-user-${params.username}"` });
  }),
  http.post(`${BASE}/users`, async ({ request }) => {
    const body = await request.json() as Record<string, unknown>;
    return HttpResponse.json(
      { data: { ...body, state: 'enabled', groups: [] } },
      { status: 201 },
    );
  }),
  http.patch(`${BASE}/users/:username`, async ({ request }) => {
    const body = await request.json() as Record<string, unknown>;
    return jsonResponse({ username: 'admin', ...body });
  }),
  http.delete(`${BASE}/users/:username`, () => new HttpResponse(null, { status: 204 })),
  http.get(`${BASE}/users/:username/api-keys`, () => jsonResponse(userFixtures.apiKeys)),
  http.post(`${BASE}/users/:username/api-keys`, () =>
    HttpResponse.json({ data: userFixtures.createdApiKey }, { status: 201 }),
  ),
  http.delete(`${BASE}/users/:username/api-keys/:keyId`, () =>
    new HttpResponse(null, { status: 204 }),
  ),

  // GPM
  http.get(`${BASE}/gpm/plugins`, () => jsonResponse(gpmFixtures.plugins)),
  http.get(`${BASE}/gpm/themes`, () => jsonResponse([])),
  http.get(`${BASE}/gpm/plugins/:slug`, () => jsonResponse(gpmFixtures.pluginDetail)),
  http.get(`${BASE}/gpm/plugins/:slug/readme`, () => jsonResponse('# Email Plugin\n\nSend emails.')),
  http.get(`${BASE}/gpm/plugins/:slug/changelog`, () => jsonResponse('## 4.0.3\n- Bug fix')),
  http.get(`${BASE}/gpm/search`, () => jsonResponse(gpmFixtures.searchResults)),
  http.get(`${BASE}/gpm/updates`, () => jsonResponse(gpmFixtures.updates)),
  http.post(`${BASE}/gpm/install`, () => jsonResponse({ success: true, message: 'Package installed' })),
  http.post(`${BASE}/gpm/remove`, () => jsonResponse({ success: true, message: 'Package removed' })),

  // System
  http.get(`${BASE}/system/info`, () => jsonResponse(systemFixtures.systemInfo)),
  http.delete(`${BASE}/cache`, () => new HttpResponse(null, { status: 204 })),
  http.get(`${BASE}/system/logs`, () =>
    paginatedResponse(systemFixtures.logEntries, { page: 1, per_page: 50, total: 3, total_pages: 1 }),
  ),
  http.post(`${BASE}/system/backup`, () =>
    HttpResponse.json({ data: systemFixtures.backups[0] }, { status: 201 }),
  ),
  http.get(`${BASE}/system/backups`, () => jsonResponse(systemFixtures.backups)),
  http.get(`${BASE}/scheduler/jobs`, () => jsonResponse(systemFixtures.schedulerJobs)),
  http.get(`${BASE}/scheduler/status`, () => jsonResponse({ installed: true, command: '* * * * *' })),
  http.get(`${BASE}/scheduler/history`, () => jsonResponse([])),
  http.post(`${BASE}/scheduler/run`, () => jsonResponse({ jobs_run: 1 })),
  http.get(`${BASE}/dashboard/stats`, () => jsonResponse(systemFixtures.dashboardStats)),
  http.get(`${BASE}/dashboard/notifications`, () => jsonResponse(systemFixtures.notifications)),
  http.post(`${BASE}/dashboard/notifications/:id/hide`, () => new HttpResponse(null, { status: 204 })),
  http.get(`${BASE}/reports`, () => jsonResponse([{ name: 'Security', status: 'ok', items: [] }])),

  // Webhooks
  http.get(`${BASE}/webhooks`, () => jsonResponse(webhookFixtures.webhookList)),
  http.post(`${BASE}/webhooks`, () =>
    HttpResponse.json({ data: webhookFixtures.createdWebhook }, { status: 201 }),
  ),
  http.patch(`${BASE}/webhooks/:id`, async ({ request }) => {
    const body = await request.json() as Record<string, unknown>;
    return jsonResponse({ ...webhookFixtures.webhookList[0], ...body });
  }),
  http.delete(`${BASE}/webhooks/:id`, () => new HttpResponse(null, { status: 204 })),
  http.get(`${BASE}/webhooks/:id/deliveries`, () =>
    paginatedResponse(webhookFixtures.deliveries, { page: 1, per_page: 50, total: 2, total_pages: 1 }),
  ),
  http.post(`${BASE}/webhooks/:id/test`, () =>
    jsonResponse({ status_code: 200, success: true }),
  ),

  // Blueprints
  http.get(`${BASE}/blueprints/pages`, () => jsonResponse(blueprintFixtures.pageTemplates)),
  http.get(`${BASE}/blueprints/pages/:template`, () => jsonResponse(blueprintFixtures.defaultBlueprint)),
  http.get(`${BASE}/blueprints/plugins/:plugin`, () => jsonResponse(blueprintFixtures.defaultBlueprint)),
  http.get(`${BASE}/blueprints/themes/:theme`, () => jsonResponse(blueprintFixtures.defaultBlueprint)),
  http.get(`${BASE}/blueprints/users`, () => jsonResponse(blueprintFixtures.defaultBlueprint)),
  http.get(`${BASE}/blueprints/users/permissions`, () => jsonResponse(blueprintFixtures.permissions)),
  http.get(`${BASE}/blueprints/config/:scope`, () => jsonResponse(blueprintFixtures.defaultBlueprint)),
  http.get(`${BASE}/taxonomy`, () => jsonResponse(blueprintFixtures.taxonomy)),

  // Plugin discovery
  http.get(`${BASE}/sidebar/items`, () => jsonResponse(pluginFixtures.sidebarItems)),
  http.get(`${BASE}/floating-widgets`, () => jsonResponse(pluginFixtures.floatingWidgets)),
  http.get(`${BASE}/context-panels`, () => jsonResponse(pluginFixtures.contextPanels)),
  http.get(`${BASE}/settings/panels`, () => jsonResponse(pluginFixtures.settingsPanels)),
  http.get(`${BASE}/gpm/plugins/:slug/page`, ({ params }) => {
    if (params.slug === 'license-manager') {
      return jsonResponse(pluginFixtures.pluginPageDef);
    }
    return errorResponse(404, 'Not Found');
  }),
  http.post(`${BASE}/menubar/actions/:plugin/:action`, () =>
    jsonResponse({ success: true }),
  ),

  // --- Additions for beta.2 → beta.15 ---

  // Multilingual: adopt language (beta.7)
  http.post(`${BASE}/pages/:route+/adopt-language`, async ({ request, params }) => {
    const body = await request.json() as { language?: string };
    if (!body?.language) return errorResponse(400, 'Bad Request', 'language is required');
    const route = (params.route as string[]).join('/');
    return jsonResponse({
      route: '/' + route,
      language: body.language,
      filename: `default.${body.language}.md`,
    });
  }),

  // Environments (beta.12)
  http.get(`${BASE}/system/environments`, () =>
    jsonResponse({
      detected: 'localhost',
      environments: [
        { name: 'localhost', label: 'Localhost', exists: true, hasOverrides: true },
        { name: 'production', label: 'Production', exists: true, hasOverrides: false },
      ],
    }),
  ),
  http.post(`${BASE}/system/environments`, async ({ request }) => {
    // Mirrors SystemController::createEnvironment(): only `name` is read and the
    // response is a single entry whose label is always the name.
    const body = await request.json() as { name?: string };
    if (!body?.name) return errorResponse(400, 'Bad Request', 'name is required');
    return HttpResponse.json(
      { data: { name: body.name, label: body.name, exists: true, hasOverrides: false } },
      { status: 201 },
    );
  }),

  // Dashboard widgets (beta.13)
  http.get(`${BASE}/dashboard/widgets`, () =>
    jsonResponse([
      {
        id: 'core.recent-pages',
        label: 'Recent Pages',
        icon: 'clock',
        size: 'md',
        defaultSize: 'md',
        sizes: ['sm', 'md', 'lg'],
        visible: true,
        order: 10,
      },
      {
        id: 'core.system',
        label: 'System Info',
        icon: 'info',
        size: 'sm',
        defaultSize: 'sm',
        sizes: ['xs', 'sm', 'md'],
        visible: true,
        order: 20,
      },
    ]),
  ),
  http.patch(`${BASE}/dashboard/layout`, async ({ request }) => {
    const body = await request.json() as { widgets?: unknown[] };
    return jsonResponse(body?.widgets ?? []);
  }),
  http.patch(`${BASE}/dashboard/site-layout`, async ({ request }) => {
    const body = await request.json() as { widgets?: unknown[] };
    return jsonResponse(body?.widgets ?? []);
  }),

  // Password policy (beta.13) — no auth required
  http.get(`${BASE}/auth/password-policy`, () =>
    jsonResponse({
      regex: '(?=.*\\d)(?=.*[a-z])(?=.*[A-Z]).{8,}',
      min_length: 8,
      rules: [
        { id: 'digit', label: 'At least one digit' },
        { id: 'lowercase', label: 'At least one lowercase letter' },
        { id: 'uppercase', label: 'At least one uppercase letter' },
        { id: 'length', label: 'Minimum 8 characters' },
      ],
    }),
  ),

  // Blueprint upload (beta.13)
  http.post(`${BASE}/blueprint-upload`, () =>
    HttpResponse.json(
      {
        data: [
          { name: 'logo.png', path: 'user/themes/quark2/images/logo/logo.png' },
        ],
      },
      { status: 201 },
    ),
  ),
  http.delete(`${BASE}/blueprint-upload`, async ({ request }) => {
    const body = await request.json().catch(() => null) as { path?: string } | null;
    if (!body?.path) return errorResponse(400, 'Bad Request', 'path is required');
    return new HttpResponse(null, { status: 204 });
  }),

  // GPM update / update-all / upgrade (beta.6, dep validation in beta.14)
  http.post(`${BASE}/gpm/update`, async ({ request }) => {
    const body = await request.json() as { package?: string };
    if (!body?.package) return errorResponse(400, 'Bad Request', 'package is required');
    return jsonResponse({
      slug: body.package,
      type: 'plugin',
      version: '1.2.3',
      dependencies: [],
    });
  }),
  http.post(`${BASE}/gpm/update-all`, () =>
    jsonResponse({
      updated: [{ slug: 'email', type: 'plugin', version: '4.0.4' }],
      failed: [],
      skipped: [],
      cascaded_dependencies: [],
    }),
  ),
  http.post(`${BASE}/gpm/upgrade`, () =>
    jsonResponse({
      success: true,
      version_before: '2.0.0',
      version_after: '2.0.1',
    }),
  ),

  // --- Plugin tool manifests (docs/plugin-tools-spec.md) ---

  http.get(`${BASE}/mcp/tools`, () => jsonResponse(mcpToolsResponse)),

  // Routes a plugin manifest points at. They echo what the request carried so
  // tests can assert path substitution and the query/body split.
  http.get(`${BASE}/kahunacart/products`, async ({ request }) =>
    jsonResponse(await echoRequest(request), {
      pagination: { page: 1, per_page: 20, total: 3, total_pages: 1 },
    }),
  ),
  http.post(`${BASE}/kahunacart/products`, async ({ request }) =>
    jsonResponse(await echoRequest(request)),
  ),
  http.get(`${BASE}/kahunacart/products/:id`, async ({ request }) =>
    jsonResponse(await echoRequest(request)),
  ),
  http.patch(`${BASE}/kahunacart/products/:id`, async ({ request }) =>
    jsonResponse(await echoRequest(request)),
  ),
  http.put(`${BASE}/kahunacart/products/:id`, async ({ request }) =>
    jsonResponse(await echoRequest(request)),
  ),
  http.delete(`${BASE}/kahunacart/attributes/:id`, async ({ request }) =>
    jsonResponse(await echoRequest(request)),
  ),
  http.put(`${BASE}/things/:id`, async ({ request }) => jsonResponse(await echoRequest(request))),
  http.post(`${BASE}/things`, async ({ request }) => jsonResponse(await echoRequest(request))),
  http.patch(`${BASE}/flex-objects/:type/:key`, async ({ request }) =>
    jsonResponse(await echoRequest(request)),
  ),
  http.post(`${BASE}/flex-objects/:type`, async ({ request }) =>
    jsonResponse(await echoRequest(request)),
  ),
];

async function echoRequest(request: Request) {
  const url = new URL(request.url);
  let body: unknown = null;
  if (request.method !== 'GET') {
    body = await request.json().catch(() => null);
  }
  return {
    method: request.method,
    path: url.pathname,
    query: Object.fromEntries(url.searchParams.entries()),
    body,
  };
}

export const mockServer = setupServer(...handlers);
