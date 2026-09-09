# Plugin tool manifests: how a Grav plugin adds tools to grav-mcp

Status: contract for implementation, 2026-08-28. Three repos implement it: the API plugin (`grav-plugin-api`) collects and serves manifests, `grav-mcp` loads them as MCP tools, and any plugin (`grav-plugin-kahunacart` first) ships one.

## The idea

grav-mcp ships hand-written tools for everything the API plugin does itself. A third-party plugin registers its own routes through `onApiRegisterRoutes`, but nothing describes those routes to an MCP client. This contract lets a plugin describe them declaratively. The plugin owns the description and it lives next to the routes it describes, the API plugin serves the union for the authenticated caller, and grav-mcp turns each entry into an MCP tool at startup with no code per plugin.

Naming and permissions follow what grav-mcp already does: every tool carries a permission the client checks before calling (`GravClient.checkPermission`), the server enforces the same permission on the route, and read tools carry `readOnlyHint`.

## The manifest file

A plugin ships `mcp.yaml` in its root, next to `blueprints.yaml` and `permissions.yaml`.

```yaml
version: 1
prefix: kahunacart          # optional; defaults to the plugin slug. Tool name = "{prefix}_{name}"
tools:
  - name: list_products
    title: List products
    description: >
      List catalog products with paging, search and status filters. Returns product rows with their variants and attributes. Use get_product for one product with everything on it.
    method: GET
    path: /kahunacart/products
    permission: kahunacart.products.manage
    annotations:
      readOnly: true
    input:
      type: object
      properties:
        q: { type: string, description: "Search title, slug or SKU" }
        status: { type: string, enum: [draft, published, archived] }
        page: { type: integer, minimum: 1, default: 1 }
        per_page: { type: integer, minimum: 1, maximum: 100, default: 20 }

  - name: update_product
    title: Update a product
    description: Change one or more fields of a product. Only the fields sent are changed; `attributes` is a merge keyed by slug and a null value removes that attribute.
    method: PATCH
    path: /kahunacart/products/{id}
    permission: kahunacart.products.manage
    annotations:
      idempotent: true
    input:
      type: object
      required: [id]
      properties:
        id: { type: integer, description: "Product id" }
        title: { type: string }
        status: { type: string, enum: [draft, published, archived] }
        attributes:
          type: object
          description: "Attribute slug to value; null removes"
          additionalProperties: true
```

### Fields

| Key | Required | Meaning |
|---|---|---|
| `version` | yes | Manifest format version. `1` or `2`; `2` adds `body`. |
| `prefix` | no | Tool-name prefix. Defaults to the plugin slug with `-` replaced by `_`. |
| `tools[].name` | yes | `^[a-z][a-z0-9_]*$`. The final tool name is `{prefix}_{name}` and must be 64 characters or fewer. |
| `tools[].title` | no | Human title shown by MCP clients. |
| `tools[].description` | yes | What the tool does and returns, when to use it, and anything the model must know to call it well. One to four sentences. Do not repeat the permission; the loader appends `[Requires: <permission>]` itself. |
| `tools[].method` | yes | `GET`, `POST`, `PATCH`, `PUT` or `DELETE`. |
| `tools[].path` | yes | Route path relative to the API base, starting with `/`. `{name}` placeholders name path parameters; each must exist in `input.properties` and is treated as required. |
| `tools[].permission` | no | The permission the route enforces. The API plugin omits the tool from `/mcp/tools` when the caller lacks it; grav-mcp checks it again before calling. |
| `tools[].annotations` | no | `readOnly`, `destructive`, `idempotent` booleans. Defaults: `GET` is `readOnly: true, idempotent: true`; `DELETE` is `destructive: true, idempotent: true`; `PUT` and `PATCH` are `idempotent: true`; `POST` is all false. Setting a key overrides the default for that key only. |
| `tools[].input` | no | A JSON Schema object (`type: object`) in the subset below. Omit for a tool with no arguments. |
| `tools[].query` | no | For `POST`, `PATCH`, `PUT` and `DELETE`: the property names to send as query-string parameters instead of in the JSON body. `GET` sends every non-path property as a query parameter. |
| `tools[].body` | no | Names the single `type: object` property whose value *is* the JSON request body, for a route whose fields come from site data (a Flex directory's blueprint) rather than the manifest. Never on a `GET`; every other property must then be a path placeholder or a `query` name, and the root schema may not be `additionalProperties: true`. |

Only JSON bodies are supported. Multipart routes (file, image and release uploads) are out of scope for version 1; leave them out of the manifest.

### The JSON Schema subset

grav-mcp converts `input` to a zod schema at load time, so the manifest may use only what the converter understands. The API plugin rejects a tool that uses anything else and reports it under `warnings`.

Allowed per property: `type` (`string`, `integer`, `number`, `boolean`, `array`, `object`), `description`, `default`, `enum` (strings or numbers), `nullable: true`, `minimum`, `maximum`, `minLength`, `maxLength`, `pattern`, `format` (`date`, `date-time`, `email`, `uri`; advisory, passed through to the description), `items` (same subset, for arrays), `properties` + `required` + `additionalProperties` (for nested objects). An `object` with no `properties` is a free-form map (`additionalProperties` defaults to `true` in that case). `additionalProperties: true` on the *root* schema is honoured too: undeclared arguments pass through, as query parameters on a `GET` and into the JSON body on every other method, and the tool advertises that it accepts them. It is illegal together with `body`. Only set it on a route that validates its own payload, since an open root leaves a model free to invent fields; prefer `body` to scope the payload to one argument where you can. Not allowed: `$ref`, `oneOf`, `anyOf`, `allOf`, `not`, `if`/`then`, tuple `items`, `patternProperties`, `const`, `dependencies`.

## The event

Plugins that build tools from runtime data can add them in code. The API plugin fires `onApiMcpTools` with `$event['tools']`, an `McpToolCollector`:

```php
public function onApiMcpTools(Event $event): void
{
    $event['tools']->add('kahunacart', [
        'name' => 'sync_stripe',
        'description' => '...',
        'method' => 'POST',
        'path' => '/kahunacart/providers/stripe/sync',
        'permission' => 'kahunacart.settings',
    ]);
}
```

The first argument is the plugin slug (used for `prefix` defaulting and the `plugin` field). Entries are validated exactly like manifest entries. File manifests are read first, then the event fires; a duplicate final name is dropped with a warning and the first one wins.

## The endpoint

`GET /mcp/tools`, permission `api.access`. Response in the API plugin's usual envelope:

```json
{
  "data": {
    "tools": [
      {
        "name": "kahunacart_list_products",
        "plugin": "kahunacart",
        "title": "List products",
        "description": "List catalog products ...",
        "method": "GET",
        "path": "/kahunacart/products",
        "permission": "kahunacart.products.manage",
        "annotations": { "readOnly": true, "destructive": false, "idempotent": true },
        "input_schema": { "type": "object", "properties": { "q": { "type": "string" } } },
        "path_params": [],
        "query": [],
        "body": null
      }
    ],
    "plugins": [
      { "slug": "kahunacart", "name": "KahunaCart", "version": "0.1.0", "tools": 48 }
    ],
    "warnings": [
      "kahunacart: tool 'upload_image' skipped: unsupported schema keyword 'oneOf' at properties.file"
    ],
    "fingerprint": "5f1d…"
  }
}
```

Rules:

- Only enabled plugins are read. A plugin without `mcp.yaml` and without an `onApiMcpTools` listener contributes nothing and is not listed under `plugins`.
- A tool whose `permission` the caller does not hold is omitted (super admins see everything). Tools without a permission are always included. `plugins[].tools` counts what this caller can see.
- `annotations` is always fully populated with the defaults applied. `input_schema` is always present (`{"type":"object","properties":{}}` for a tool with no arguments). `path_params` lists the placeholders in `path` in order.
- `fingerprint` is a hash of the enabled-plugin set plus the manifest file mtimes, so a client can tell whether anything changed without diffing. The response carries it as the `ETag` too and honours `If-None-Match` with a 304.
- `warnings` names every entry that was skipped and why. It is safe to show to any authenticated caller; it contains no secrets.
- Invalid manifests never break the endpoint: a YAML parse error becomes one warning for that plugin and the rest is served.

## The grav-mcp side

- At startup, before the transport connects, grav-mcp calls `GET /mcp/tools` and registers one MCP tool per entry. Failure to reach the endpoint (network, 401, or 404 from an older API plugin) is logged to stderr and the server starts with core tools only.
- Tool name: the `name` from the response, unchanged. A name that collides with a core tool is skipped with a stderr warning.
- Description: the manifest description followed by ` [Requires: <permission>]` when a permission is set, matching the core tools' wording, and ` (plugin: <slug>)`.
- Annotations map to `readOnlyHint`, `destructiveHint`, `idempotentHint`.
- Call handling: `client.checkPermission(permission)` when set; substitute each `{param}` from the arguments (URL-encoded); `GET` sends remaining arguments as query; `DELETE` sends remaining arguments as query unless the tool lists none in `query` and there is a body-shaped argument, in which case they go in the body (KahunaCart's `DELETE /attributes/{id}` takes `{force: true}` in the body, so: `DELETE` sends arguments named in `query` as query and the rest as the JSON body; if `query` is empty everything goes to the body); `POST`/`PATCH`/`PUT` send arguments named in `query` as query and the rest as the JSON body. When the tool sets `body`, that argument's object is the whole body instead and nothing else is added to it (an omitted value sends no body at all; a value that is not an object is a `400` error rather than a silently empty body); `query` still works as usual. Undefined arguments are dropped. The result is the response `data`, with pagination attached the way `addPaginationInfo` does for core tools. Errors go through `handleToolCall` like every other tool.
- A `refresh_plugin_tools` tool (core, `api.access`) re-fetches `/mcp/tools`, registers new tools, updates changed ones and removes vanished ones, then reports `{added, updated, removed, warnings}`. The SDK sends `tools/list_changed` for these changes.
- Configuration: `--plugin-tools <all|none|slug,slug,...>` or `GRAV_MCP_PLUGIN_TOOLS`. Default `all`. `none` disables the startup fetch (the refresh tool still works and reports that plugin tools are disabled). A slug list loads only those plugins' tools.
- `discover_plugins` gains `mcp_tools: [{plugin, tools}]` from the same response so a model can see which plugins offer tools.

## What each repo delivers

**grav-plugin-api**: `classes/Api/Mcp/McpToolCollector.php` (validation, defaults, dedupe, warnings), `classes/Api/Mcp/McpManifestLoader.php` (finds `plugins://<slug>/mcp.yaml` for each enabled plugin, parses, feeds the collector, fires the event), `classes/Api/Controllers/McpController.php` (`tools()`), the route in `ApiRouter::registerCoreRoutes`, tests with a fixture manifest covering every validation rule and the permission filter, an `openapi.yaml` entry, a README section "MCP tool manifests" that is the reference for plugin authors (the manifest table and schema subset above), and a CHANGELOG block.

**grav-mcp**: `src/client/json-schema.ts` (subset to zod, root and nested `additionalProperties` honoured, throws on anything outside the subset), `src/tools/plugin-tools.ts` (fetch, register, refresh, call handler), the CLI flag and env var, `discover_plugins` addition, unit tests with msw for the converter, the loader, the call handler for every method, the refresh diff, and the collision and disabled cases, a README section, and a CHANGELOG bullet.

**grav-plugin-kahunacart**: `mcp.yaml` covering every JSON route the admin uses (products and variants, options, categories, tags, attributes, tax and shipping zones, coupons, sales, reports, orders and order actions, order downloads, customers, webhook log, providers, config), with descriptions and input schemas derived from the controllers, a unit test that validates the manifest against the subset rules and checks every `method` + `path` is a registered route, and a CHANGELOG bullet.
