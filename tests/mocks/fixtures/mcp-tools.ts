// GET /mcp/tools: plugin-published tool manifests (docs/plugin-tools-spec.md)

export const mcpToolsResponse = {
  tools: [
    {
      name: 'kahunacart_list_products',
      plugin: 'kahunacart',
      title: 'List products',
      description: 'List catalog products with paging, search and status filters.',
      method: 'GET',
      path: '/kahunacart/products',
      permission: 'kahunacart.products.manage',
      annotations: { readOnly: true, destructive: false, idempotent: true },
      input_schema: {
        type: 'object',
        properties: {
          q: { type: 'string', description: 'Search title, slug or SKU' },
          status: { type: 'string', enum: ['draft', 'published', 'archived'] },
          page: { type: 'integer', minimum: 1 },
          per_page: { type: 'integer', minimum: 1, maximum: 100 },
        },
      },
      path_params: [],
      query: [],
    },
    {
      name: 'kahunacart_get_product',
      plugin: 'kahunacart',
      title: 'Get a product',
      description: 'Get one product with its variants and attributes.',
      method: 'GET',
      path: '/kahunacart/products/{id}',
      permission: 'kahunacart.products.manage',
      annotations: { readOnly: true, destructive: false, idempotent: true },
      input_schema: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'integer', description: 'Product id' },
          lang: { type: 'string' },
        },
      },
      path_params: ['id'],
      query: [],
    },
    {
      name: 'kahunacart_create_product',
      plugin: 'kahunacart',
      title: 'Create a product',
      description: 'Create a catalog product.',
      method: 'POST',
      path: '/kahunacart/products',
      permission: 'kahunacart.products.manage',
      annotations: { readOnly: false, destructive: false, idempotent: false },
      input_schema: {
        type: 'object',
        required: ['title'],
        properties: {
          title: { type: 'string' },
          status: { type: 'string', enum: ['draft', 'published', 'archived'] },
          notify: { type: 'boolean' },
        },
      },
      path_params: [],
      query: ['notify'],
    },
    {
      name: 'kahunacart_update_product',
      plugin: 'kahunacart',
      title: 'Update a product',
      description: 'Change one or more fields of a product.',
      method: 'PATCH',
      path: '/kahunacart/products/{id}',
      permission: 'kahunacart.products.manage',
      annotations: { readOnly: false, destructive: false, idempotent: true },
      input_schema: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'integer', description: 'Product id' },
          title: { type: 'string' },
          lang: { type: 'string', description: 'Language to write' },
          attributes: {
            type: 'object',
            description: 'Attribute slug to value; null removes',
            additionalProperties: true,
          },
        },
      },
      path_params: ['id'],
      query: ['lang'],
    },
    {
      name: 'kahunacart_replace_product',
      plugin: 'kahunacart',
      title: 'Replace a product',
      description: 'Replace every field of a product.',
      method: 'PUT',
      path: '/kahunacart/products/{id}',
      permission: 'kahunacart.products.manage',
      annotations: { readOnly: false, destructive: false, idempotent: true },
      input_schema: {
        type: 'object',
        required: ['id', 'title'],
        properties: {
          id: { type: 'integer' },
          title: { type: 'string' },
        },
      },
      path_params: ['id'],
      query: [],
    },
    {
      name: 'kahunacart_delete_attribute',
      plugin: 'kahunacart',
      title: 'Delete an attribute',
      description: 'Delete a product attribute, optionally forcing removal from products that use it.',
      method: 'DELETE',
      path: '/kahunacart/attributes/{id}',
      permission: 'kahunacart.products.manage',
      annotations: { readOnly: false, destructive: true, idempotent: true },
      input_schema: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string' },
          force: { type: 'boolean', description: 'Remove from products that use it' },
        },
      },
      path_params: ['id'],
      query: [],
    },
    {
      name: 'seo_audit',
      plugin: 'seo',
      description: 'Audit a page for SEO problems.',
      method: 'GET',
      path: '/seo/audit',
      annotations: { readOnly: true, destructive: false, idempotent: true },
      input_schema: { type: 'object', properties: { route: { type: 'string' } } },
      path_params: [],
      query: [],
    },
  ],
  plugins: [
    { slug: 'kahunacart', name: 'KahunaCart', version: '0.1.0', tools: 6 },
    { slug: 'seo', name: 'SEO', version: '2.0.0', tools: 1 },
  ],
  warnings: [
    "seo: tool 'upload_image' skipped: unsupported schema keyword 'oneOf' at properties.file",
  ],
  fingerprint: '5f1d0001',
};

// Same endpoint after a plugin update: one description changed, one tool added,
// one tool gone.
export const changedMcpToolsResponse = {
  ...mcpToolsResponse,
  tools: [
    {
      ...mcpToolsResponse.tools[0],
      description: 'List catalog products. Now with a variants filter.',
    },
    ...mcpToolsResponse.tools.slice(1, 5),
    {
      name: 'kahunacart_list_orders',
      plugin: 'kahunacart',
      title: 'List orders',
      description: 'List customer orders.',
      method: 'GET',
      path: '/kahunacart/orders',
      permission: 'kahunacart.orders.manage',
      annotations: { readOnly: true, destructive: false, idempotent: true },
      input_schema: { type: 'object', properties: {} },
      path_params: [],
      query: [],
    },
    mcpToolsResponse.tools[6],
  ],
  warnings: [],
  fingerprint: '5f1d0002',
};

// A plugin whose final tool name collides with a core tool.
export const collidingMcpToolsResponse = {
  tools: [
    {
      name: 'discover_plugins',
      plugin: 'clash',
      description: 'A plugin tool that wants a core tool name.',
      method: 'GET',
      path: '/clash/plugins',
      annotations: { readOnly: true, destructive: false, idempotent: true },
      input_schema: { type: 'object', properties: {} },
      path_params: [],
      query: [],
    },
    mcpToolsResponse.tools[0],
  ],
  plugins: [{ slug: 'clash', name: 'Clash', version: '1.0.0', tools: 1 }],
  warnings: [],
  fingerprint: '5f1d0003',
};

// A manifest entry the converter refuses: the endpoint served it, but grav-mcp
// cannot build a schema for it.
export const unsupportedSchemaToolsResponse = {
  tools: [
    {
      name: 'kahunacart_upload_image',
      plugin: 'kahunacart',
      description: 'Upload a product image.',
      method: 'POST',
      path: '/kahunacart/products/{id}/image',
      annotations: { readOnly: false, destructive: false, idempotent: false },
      input_schema: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          file: { oneOf: [{ type: 'string' }, { type: 'object' }] },
        },
      },
      path_params: ['id'],
      query: [],
    },
    mcpToolsResponse.tools[0],
  ],
  plugins: [{ slug: 'kahunacart', name: 'KahunaCart', version: '0.1.0', tools: 2 }],
  warnings: [],
  fingerprint: '5f1d0004',
};

// Manifest version 2 ground: a root `additionalProperties` (true and false) and
// the `body` designation that names the argument carrying the whole JSON body.
export const rootAndBodyToolsResponse = {
  tools: [
    {
      name: 'widgets_replace_thing',
      plugin: 'widgets',
      title: 'Replace a thing',
      description: 'Replace a thing with whatever fields the site defines.',
      method: 'PUT',
      path: '/things/{id}',
      annotations: { readOnly: false, destructive: false, idempotent: true },
      input_schema: {
        type: 'object',
        required: ['id'],
        additionalProperties: true,
        properties: {
          id: { type: 'string' },
          dry_run: { type: 'boolean', description: 'Validate without saving' },
        },
      },
      path_params: ['id'],
      query: ['dry_run'],
    },
    {
      name: 'widgets_create_thing',
      plugin: 'widgets',
      title: 'Create a thing',
      description: 'Create a thing from the declared fields only.',
      method: 'POST',
      path: '/things',
      annotations: { readOnly: false, destructive: false, idempotent: false },
      input_schema: {
        type: 'object',
        required: ['title'],
        additionalProperties: false,
        properties: { title: { type: 'string' } },
      },
      path_params: [],
      query: [],
    },
    {
      name: 'flex_update_object',
      plugin: 'flex-objects',
      title: 'Update a Flex object',
      description: 'Update one Flex object; `object` holds the blueprint fields.',
      method: 'PATCH',
      path: '/flex-objects/{type}/{key}',
      annotations: { readOnly: false, destructive: false, idempotent: true },
      input_schema: {
        type: 'object',
        required: ['type', 'key', 'object'],
        properties: {
          type: { type: 'string' },
          key: { type: 'string' },
          lang: { type: 'string' },
          object: {
            type: 'object',
            additionalProperties: true,
            description: 'Fields per the directory blueprint',
          },
        },
      },
      path_params: ['type', 'key'],
      query: ['lang'],
      body: 'object',
    },
    {
      name: 'flex_create_object',
      plugin: 'flex-objects',
      title: 'Create a Flex object',
      description: 'Create a Flex object in a directory.',
      method: 'POST',
      path: '/flex-objects/{type}',
      annotations: { readOnly: false, destructive: false, idempotent: false },
      input_schema: {
        type: 'object',
        required: ['type'],
        properties: {
          type: { type: 'string' },
          object: { type: 'object', additionalProperties: true },
        },
      },
      path_params: ['type'],
      query: [],
      body: 'object',
    },
  ],
  plugins: [
    { slug: 'widgets', name: 'Widgets', version: '1.0.0', tools: 2 },
    { slug: 'flex-objects', name: 'Flex Objects', version: '1.0.0', tools: 2 },
  ],
  warnings: [],
  fingerprint: '5f1d0005',
};
