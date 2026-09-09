# grav-mcp

MCP server for [Grav CMS](https://getgrav.org) — AI-native content management via the Grav REST API.

Exposes 71 semantic tools across 11 domains, 5 resources, and 6 workflow prompts, plus any tools your installed plugins publish. Supports all Grav API capabilities including pages, media, configuration, users, packages, system management, webhooks, blueprints, environment overrides, dashboard widgets, and dynamic plugin discovery.

## Prerequisites

- [Grav CMS](https://getgrav.org) with the [API plugin](https://github.com/getgrav/grav-plugin-api) installed and enabled
- An API key generated via `bin/plugin api keys:generate --user=admin --name="MCP"`
- Node.js 18+

## Quick Start

### Claude Code

Add to your Claude Code MCP config:

```json
{
  "mcpServers": {
    "grav": {
      "command": "npx",
      "args": ["-y", "grav-mcp"],
      "env": {
        "GRAV_API_URL": "https://mysite.com/api",
        "GRAV_API_KEY": "grav_your_api_key_here"
      }
    }
  }
}
```

### Running The MCP Server

```bash
# Via environment variables (recommended)
GRAV_API_URL=https://mysite.com/api GRAV_API_KEY=grav_abc123 npx grav-mcp

# Via CLI arguments
npx grav-mcp --url https://mysite.com/api --key grav_abc123

# HTTP transport (for remote deployment)
npx grav-mcp --url https://mysite.com/api --key grav_abc123 --transport http --port 3100
```

## Configuration

| Variable | CLI Flag | Required | Description |
|---|---|---|---|
| `GRAV_API_URL` | `--url` | Yes | Base URL of the Grav API |
| `GRAV_API_KEY` | `--key` | Yes | API key (starts with `grav_`) |
| `GRAV_ENVIRONMENT` | `--environment` | No | Multi-environment override |
| `GRAV_MCP_PLUGIN_TOOLS` | `--plugin-tools` | No | Which plugin-published tools to load: `all` (default), `none`, or a comma-separated list of plugin slugs |

## Tools Reference

### Pages (10 tools)

| Tool | Type | Description |
|---|---|---|
| `list_pages` | Read | List/search pages with filtering, sorting, pagination |
| `get_page` | Read | Get full page: content, header, media, taxonomy |
| `create_page` | Write | Create page with title, content, template, header |
| `update_page` | Write | Update page fields (deep-merged header, ETag support) |
| `delete_page` | Write | Delete page (optional: specific language only) |
| `move_page` | Write | Move page to new parent/rename slug |
| `copy_page` | Write | Duplicate page with media |
| `batch_pages` | Write | Bulk publish/unpublish/delete/copy (max 50) |
| `reorder_pages` | Write | Reorder children by slug sequence |
| `reorganize_pages` | Write | Atomic multi-page move + reorder |

### Multilingual (5 tools)

| Tool | Type | Description |
|---|---|---|
| `list_languages` | Read | Configured site languages |
| `get_page_translations` | Read | Which translations exist/missing (incl. `has_default_file`, `explicit_language_files`) |
| `create_translation` | Write | Create language variant of a page |
| `adopt_page_language` | Write | Rename an untyped page file (`default.md`) to `default.{lang}.md` in place |
| `compare_translations` | Read | Side-by-side diff of two versions |

### Media (8 tools)

| Tool | Type | Description |
|---|---|---|
| `list_page_media` | Read | Media files attached to a page |
| `upload_page_media` | Write | Upload files (base64) to a page |
| `delete_page_media` | Write | Delete media file from a page |
| `list_site_media` | Read | Browse site media with folders/search |
| `upload_site_media` | Write | Upload to site media folder |
| `delete_site_media` | Write | Delete site media file |
| `create_media_folder` | Write | Create media subfolder |
| `manage_media_folder` | Write | Rename or delete folder |

### Configuration (3 tools)

| Tool | Type | Description |
|---|---|---|
| `list_config_scopes` | Read | Available config sections |
| `get_config` | Read | Read config by scope (with ETag) |
| `update_config` | Write | Update config (differential save vs defaults, ETag, optional `environment` for `user/env/<name>/` overrides) |

### Users (6 tools)

| Tool | Type | Description |
|---|---|---|
| `list_users` | Read | List users with search |
| `get_user` | Read | User details with permissions |
| `create_user` | Write | Create user account |
| `update_user` | Write | Update profile/permissions |
| `delete_user` | Write | Delete user |
| `manage_api_keys` | Write | List/create/revoke API keys |

### Package Manager (9 tools)

| Tool | Type | Description |
|---|---|---|
| `list_packages` | Read | Installed plugins/themes (with `is_symlink`, `description_html`) |
| `get_package_info` | Read | Plugin/theme details + readme |
| `search_packages` | Read | Search GPM repository |
| `check_updates` | Read | Available updates (incl. Grav core when symlink-safe) |
| `install_package` | Write | Install plugin/theme (auto-resolves blueprint dependencies) |
| `update_package` | Write | Update a single package (auto-detects plugin vs theme) |
| `update_all_packages` | Write | Bulk-update with dep validation; returns updated/failed/skipped/cascaded buckets |
| `upgrade_grav` | Write | Self-upgrade Grav core (refuses on symlink installs) |
| `remove_package` | Write | Remove plugin/theme |

### System (10 tools)

| Tool | Type | Description |
|---|---|---|
| `get_system_info` | Read | Grav/PHP versions, disk, environment |
| `clear_cache` | Write | Clear cache (all/standard/images/assets/tmp) |
| `get_logs` | Read | System logs with level filter |
| `create_backup` | Write | Create full backup |
| `list_backups` | Read | Available backups |
| `get_scheduler` | Read | Scheduler jobs/status/history |
| `run_scheduler` | Write | Run the jobs that have missed their scheduled time |
| `list_environments` | Read | Detected env + configurable `user/env/*` overrides |
| `create_environment` | Write | Create a new `user/env/<name>/config/` folder |
| `get_password_policy` | Read | Public password policy (regex, min_length, rules) |

### Webhooks (4 tools)

| Tool | Type | Description |
|---|---|---|
| `list_webhooks` | Read | Configured webhooks |
| `manage_webhook` | Write | Create/update/delete webhook |
| `get_webhook_deliveries` | Read | Webhook delivery log |
| `test_webhook` | Write | Send test payload |

### Blueprints & Schema (6 tools)

| Tool | Type | Description |
|---|---|---|
| `list_page_templates` | Read | Available page types |
| `get_blueprint` | Read | Field schema for page/plugin/theme/config |
| `get_permissions` | Read | Permission actions hierarchy |
| `get_taxonomy` | Read | Taxonomy types and values |
| `upload_blueprint_file` | Write | Upload a file into a blueprint `destination` (theme/plugin/account scopes) |
| `delete_blueprint_file` | Write | Delete a previously-uploaded blueprint file by logical path (idempotent) |

### Dashboard & Reports (7 tools)

| Tool | Type | Description |
|---|---|---|
| `get_dashboard_stats` | Read | Site overview statistics |
| `get_notifications` | Read | System notifications (v2 schema: type, icon, title, markdown, action, dependencies) |
| `dismiss_notification` | Write | Dismiss a notification |
| `get_dashboard_widgets` | Read | Resolved widget list (visibility, size, order, allowed sizes) |
| `update_dashboard_layout` | Write | Save the current user's widget layout |
| `update_site_dashboard_layout` | Write | Save the site-wide default layout (super-admin only) |
| `run_reports` | Read | Diagnostic reports |

### Plugin Discovery (3 tools)

| Tool | Type | Description |
|---|---|---|
| `discover_plugins` | Read | Plugin-provided features (sidebar, widgets, panels, pages, published tools) |
| `plugin_action` | Write | Execute plugin menubar action |
| `refresh_plugin_tools` | Write | Re-read plugin tool manifests and add/update/remove their tools |

### Plugin Tools

Any Grav plugin can publish its own tools, and grav-mcp picks them up with no code written here and no restart of your editor. The first plugin to do so is [KahunaCart](https://kahunacart.com), whose 92 tools let an assistant run a store: products, attributes, categories, coupons, sales, orders, refunds, customers, reports and payment providers. Its Licenses and Subscriptions add-ons publish their own tools alongside.

#### How it works

1. A plugin ships an `mcp.yaml` manifest at its root describing its API routes as tools: a name, a description written for a model, the method and path, the permission the route enforces, read-only and destructive hints, and a JSON Schema for the arguments. Plugins that build tools from runtime data answer the `onApiMcpTools` event instead.
2. The API plugin (1.0.22 or later) serves the union of every enabled plugin's manifest at `GET /mcp/tools`, filtered to the tools your API key's permissions allow.
3. At startup grav-mcp fetches that list and registers one MCP tool per entry, named `<plugin>_<name>` so plugin tools never shadow the core ones. Each description ends with `[Requires: <permission>] (plugin: <slug>)`.
4. When the assistant calls a tool, grav-mcp checks the permission the same way it does for core tools, fills the `{id}`-style path parameters from the arguments, sends the rest as the query string on `GET` or as the JSON body otherwise (a manifest can name arguments that travel as query parameters on a write), and returns the response `data`. A manifest can also mark one argument as the whole request body (manifest version 2, which needs API plugin 1.0.28 or later), so a plugin whose fields come from site data rather than the manifest, such as a Flex directory's blueprint, still gets a tool that takes them. Errors come back with the API's own detail, so a `409` from a plugin says why (an attribute still in use, a slug already taken) rather than being mistaken for an ETag conflict.

#### Example: a KahunaCart store

Generate a key for a user who holds the `kahunacart.*` permissions you want the assistant to have, then point grav-mcp at the store as usual:

```json
{
  "mcpServers": {
    "shop": {
      "command": "npx",
      "args": ["-y", "grav-mcp"],
      "env": {
        "GRAV_API_URL": "https://shop.example.com/api",
        "GRAV_API_KEY": "grav_your_store_key"
      }
    }
  }
}
```

Ask the assistant to run `discover_plugins`; `mcp_tools` lists `kahunacart` with every tool that key can see. From there, requests like these map straight onto tools:

| Ask | Tools used |
|---|---|
| "Which products are low on stock?" | `kahunacart_report_low_stock` |
| "Add a Material attribute with cotton and linen, then set the Reef Runner tee to cotton" | `kahunacart_create_attribute`, `kahunacart_list_products`, `kahunacart_update_product` |
| "Refund order 482 in full" | `kahunacart_get_order`, `kahunacart_refund_order` |
| "Create a 20% sale on the Apparel category until the end of the month" | `kahunacart_list_categories`, `kahunacart_create_sale` |
| "Sync the catalog to Stripe" | `kahunacart_sync_provider` |

Refunds, cancellations, deletions and revocations carry `destructiveHint`, so a client that confirms destructive tools will ask first. Read tools carry `readOnlyHint`. A store with `demo.readonly` on refuses every write with a 403.

A key that lacks a permission simply does not receive the tools behind it: the list an assistant sees is the list it can use. Give a reporting assistant a key with `kahunacart.reports` and `kahunacart.orders.view` and it gets the reports and order lookups and nothing else.

#### Keeping the list current

Install or enable a plugin while the server is running and `refresh_plugin_tools` picks up the change: it re-reads the manifests, adds new tools, updates changed ones, drops tools whose plugin went away, and reports `{added, updated, removed, warnings, plugins}`. MCP clients are told the tool list changed. `discover_plugins` reports the loaded tools grouped by plugin under `mcp_tools`.

If the site is unreachable, the key lacks `api.access`, or the API plugin is old enough that it has no `/mcp/tools` endpoint, grav-mcp prints a warning to stderr and starts with core tools only.

Use `--plugin-tools none` (or `GRAV_MCP_PLUGIN_TOOLS=none`) to turn plugin tools off, or `--plugin-tools kahunacart,kahunacart-licenses` to load only certain plugins.

#### Publishing tools from your own plugin

Drop an `mcp.yaml` next to your `blueprints.yaml`:

```yaml
version: 1
prefix: myshop            # optional; defaults to the plugin slug
tools:
  - name: list_widgets
    title: List widgets
    description: >
      List widgets with paging and a search term. Returns id, title and status per widget.
    method: GET
    path: /myshop/widgets
    permission: myshop.widgets.view
    input:
      type: object
      properties:
        q: { type: string, description: "Search title or slug" }
        page: { type: integer, minimum: 1, default: 1 }

  - name: delete_widget
    description: Delete a widget by id. Answers 409 while orders reference it.
    method: DELETE
    path: /myshop/widgets/{id}
    permission: myshop.widgets.manage
    input:
      type: object
      required: [id]
      properties:
        id: { type: integer }
```

Names must match `^[a-z][a-z0-9_]*$`; `GET` tools default to read-only and `DELETE` tools to destructive; a `{param}` in the path must be a property in `input` and is required. The full field table, the JSON Schema subset the loader accepts, the `onApiMcpTools` event and what `/mcp/tools` returns are in the [API plugin README](https://github.com/getgrav/grav-plugin-api#mcp-tool-manifests). A manifest entry the API plugin rejects is reported under `warnings` in the `/mcp/tools` response and by `refresh_plugin_tools`, naming the entry and the rule it broke.

## Resources

| URI | Description |
|---|---|
| `grav://system/info` | System information |
| `grav://user/permissions` | Current user's permissions |
| `grav://languages` | Configured languages |
| `grav://templates` | Available page templates |
| `grav://taxonomy` | Taxonomy types and values |

## Prompts

| Prompt | Description |
|---|---|
| `create_blog_post` | Guided blog post creation workflow |
| `translate_page` | Page translation workflow |
| `site_health_check` | Comprehensive site health audit |
| `content_audit` | Content quality and metadata audit |
| `plugin_setup` | Search, install, configure a plugin |
| `bulk_update` | Bulk frontmatter updates across pages |

## Security

- API key is read from environment variables only — never logged, stored, or included in responses
- Permission pre-flight checks prevent unauthorized requests before they hit the server
- ETags provide optimistic concurrency control for write operations
- Input validation via Zod schemas on all tool parameters
- Rate limit tracking from API response headers

## Permissions

Each tool requires specific API permissions. The server checks permissions before making requests. Available permissions:

```
api.access
├── api.pages.{read,write}
├── api.media.{read,write}
├── api.config.{read,write}
├── api.users.{read,write}
├── api.system.{read,write,backup}
├── api.gpm.{read,write}
├── api.scheduler.{read,write}
├── api.reports.read
└── api.webhooks.{read,write}
```

`api.system.backup` is a dedicated grant for creating, listing, downloading and deleting backups. Backup archives contain account password hashes and config secrets, so it is deliberately not implied by `api.system.read` or `api.system.write`.

Users with the `access.api.super` flag (returned as `super_admin: true` from `/me`) bypass all checks. The legacy `admin.super` from admin-classic is **not** honored — Grav 2.0 cleanly separates admin-classic and API/Admin-Next authority.

## Development

```bash
git clone https://github.com/getgrav/grav-mcp.git
cd grav-mcp
npm install
npm run typecheck    # Type checking
npm test             # Run unit tests
npm run test:watch   # Watch mode
npm run build        # Compile to dist/
```

### Testing with MCP Inspector

```bash
npx @modelcontextprotocol/inspector npx tsx src/index.ts
```

## Maintenance

The Grav API plugin moves frequently. Two scripts keep this MCP in sync:

```bash
# What changed in the API plugin since I last reviewed?
npm run changelog:since
# After reviewing, mark a version as the new baseline:
npm run changelog:since -- --bump 1.0.0-beta.16

# Are there any API endpoints with no MCP tool, or any tools whose
# annotated endpoint no longer exists in the router?
npm run audit:api
```

`audit:api` parses the `// @api METHOD /path` annotations above each
`registerTool` call and compares them against `addRoute(...)` entries in the
plugin's `ApiRouter.php`. Any endpoint that should not be exposed (auth flows,
2FA setup, internal admin-next bundles, etc.) lives in `.audit-ignore`. The
script exits non-zero on drift so it can gate CI.

When adding a new tool, place a `// @api METHOD /path` line directly above the
`registerTool` call so coverage updates automatically.

Both scripts default to looking up the API plugin at `../grav-api/user/plugins/api/`.
Override via `--router` / `--changelog` flags if your local layout differs.

## License

MIT
