import type { JsonSchemaNode } from '../client/json-schema.js';

// API response envelope
export interface ApiResponse<T> {
  data: T;
  meta?: ApiMeta;
  links?: ApiLinks;
}

export interface ApiMeta {
  pagination?: PaginationMeta;
}

export interface PaginationMeta {
  page: number;
  per_page: number;
  total: number;
  total_pages: number;
}

export interface ApiLinks {
  self: string;
  first: string;
  prev: string | null;
  next: string | null;
  last: string;
}

// RFC 7807 error response
export interface ProblemDetail {
  status: number;
  title: string;
  detail?: string;
  errors?: FieldError[];
}

export interface FieldError {
  field: string;
  message: string;
}

// Page types
export interface PageSummary {
  route: string;
  raw_route: string;
  slug: string;
  template: string;
  title: string;
  published: boolean;
  visible: boolean;
  routable: boolean;
  date: string;
  modified: number;
  order: number | null;
  has_children: boolean;
}

export interface Page extends PageSummary {
  content: string;
  header: Record<string, unknown>;
  media: MediaItem[];
  languages?: Record<string, { modified: number }>;
  path: string;
  file_path: string;
}

// Media types
export interface MediaItem {
  filename: string;
  url: string;
  path?: string;
  type: string;
  mime?: string;
  size: number;
  modified: number;
  width?: number;
  height?: number;
  thumbnails?: Record<string, string>;
}

export interface MediaFolder {
  name: string;
  path: string;
  type: 'folder';
}

// User types
export interface User {
  username: string;
  email: string;
  fullname: string;
  title: string;
  avatar_url?: string;
  state: string;
  access: Record<string, unknown>;
  groups: string[];
}

export interface UserProfile extends Omit<User, 'access'> {
  super_admin: boolean;
  access: Record<string, boolean>;
  content_editor?: string;
  grav_version: string;
  admin_version: string | null;
}

// API key types
export interface ApiKeyInfo {
  id: string;
  name: string;
  prefix: string;
  created: string;
  expires?: string;
  last_used?: string;
}

export interface ApiKeyCreated extends ApiKeyInfo {
  key: string; // Only shown once at creation
}

// Config types
export interface ConfigScope {
  scope: string;
  label: string;
}

// Package types
export interface PackageSummary {
  slug: string;
  type: string;
  name: string;
  version: string;
  description: string;
  description_html?: string;
  author: string;
  enabled: boolean;
  update_available: boolean;
  latest_version?: string;
  is_symlink?: boolean;
}

export interface PackageDetail extends PackageSummary {
  homepage?: string;
  installed: boolean;
  release_date?: string;
  screenshot?: string;
  custom_fields?: Record<string, string>;
}

// GPM update endpoints
export interface UpdatesResponse {
  total: number;
  plugins: PackageSummary[];
  themes: PackageSummary[];
  grav?: {
    version: string;
    available: string;
    is_symlink: boolean;
  };
}

export interface GpmUpdateResult {
  slug: string;
  type: 'plugin' | 'theme';
  version?: string;
  message?: string;
}

export interface GpmUpdateAllResponse {
  updated: GpmUpdateResult[];
  failed: GpmUpdateResult[];
  skipped: GpmUpdateResult[];
  cascaded_dependencies: GpmUpdateResult[];
}

export interface GpmUpgradeGravResponse {
  success: boolean;
  version_before: string;
  version_after?: string;
  message?: string;
}

// System types
export interface SystemInfo {
  grav_version: string;
  php_version: string;
  environment: string;
  [key: string]: unknown;
}

export interface LogEntry {
  date: string;
  level: string;
  message: string;
  context?: Record<string, unknown>;
}

export interface BackupInfo {
  filename: string;
  size: number;
  date: string;
}

// Webhook types
export interface Webhook {
  id: string;
  url: string;
  events: string[];
  active: boolean;
  secret?: string;
  created: string;
  modified: string;
  failure_count?: number;
}

export interface WebhookDelivery {
  id: string;
  event: string;
  url: string;
  status_code: number;
  success: boolean;
  timestamp: string;
  response_time_ms: number;
}

// Blueprint types
export interface PageTemplate {
  type: string;
  label: string;
}

export interface Blueprint {
  type: string;
  fields: Record<string, BlueprintField>;
}

export interface BlueprintField {
  type: string;
  label?: string;
  help?: string;
  default?: unknown;
  options?: Array<{ value: string; label: string }>;
  validate?: Record<string, unknown>;
  [key: string]: unknown;
}

// Scheduler types
export interface SchedulerJob {
  id: string;
  command: string;
  at: string;
  output: string;
  status: string;
}

// Dashboard types
export interface DashboardStats {
  [key: string]: unknown;
}

// Notifications v2 (beta.13). v1 fields like `date` may still appear on cached
// responses, but new servers ship the structured shape below.
export interface Notification {
  id: string;
  type: 'info' | 'notice' | 'warning' | 'promo' | string;
  icon?: string;
  title?: string;
  message: string; // markdown
  link?: string;
  image?: string;
  accent?: string;
  action?: { label: string; url: string };
  dependencies?: Record<string, string>;
  date?: string;
  [key: string]: unknown;
}

// Dashboard widgets (beta.13)
export type WidgetSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

export interface DashboardWidget {
  id: string;
  label: string;
  icon?: string;
  size: WidgetSize;
  defaultSize: WidgetSize;
  sizes: WidgetSize[];
  visible: boolean;
  order: number;
  authorize?: string;
  plugin?: string;
}

export interface DashboardWidgetLayout {
  id: string;
  visible?: boolean;
  size?: WidgetSize;
  order?: number;
}

// Environments (beta.12)
export interface EnvironmentEntry {
  name: string;
  label: string;
  exists: boolean;
  hasOverrides: boolean;
}

export interface EnvironmentsResponse {
  detected: string;
  environments: EnvironmentEntry[];
}

// Password policy (beta.13)
export interface PasswordPolicyRule {
  id: string;
  label: string;
  pattern?: string;
}

export interface PasswordPolicy {
  regex: string;
  min_length: number;
  rules: PasswordPolicyRule[];
}

// Blueprint upload (beta.13)
export interface BlueprintUploadResponse {
  filename: string;
  path: string; // user-rooted logical path
  url?: string;
  size?: number;
  mime?: string;
}

// Plugin discovery types
export interface SidebarItem {
  id: string;
  plugin: string;
  label: string;
  icon: string;
  route: string;
  priority: number;
  badge?: string;
  authorize?: string;
}

export interface PluginPageDefinition {
  id: string;
  plugin: string;
  title: string;
  icon: string;
  page_type: 'blueprint' | 'component';
  blueprint?: string;
  data_endpoint?: string;
  save_endpoint?: string;
  actions?: PluginPageAction[];
}

export interface PluginPageAction {
  id: string;
  label: string;
  icon: string;
  primary?: boolean;
  upload?: boolean;
  download?: boolean;
}

export interface FloatingWidget {
  id: string;
  plugin: string;
  label: string;
  icon: string;
  priority: number;
  autoLoad?: boolean;
  showFab?: boolean;
  width?: number;
  height?: number;
}

export interface ContextPanel {
  id: string;
  plugin: string;
  label: string;
  icon: string;
  contexts: string[];
  badgeEndpoint?: string;
}

export interface SettingsPanel {
  id: string;
  plugin: string;
  label: string;
  icon: string;
  blueprint: string;
  data_endpoint: string;
  save_endpoint: string;
  priority: number;
}

// Plugin MCP tool manifests (GET /mcp/tools)
export type McpToolMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

export interface McpToolAnnotations {
  readOnly?: boolean;
  destructive?: boolean;
  idempotent?: boolean;
}

export interface McpToolDefinition {
  name: string;
  plugin: string;
  title?: string;
  description: string;
  method: McpToolMethod;
  path: string;
  permission?: string | null;
  annotations?: McpToolAnnotations;
  input_schema?: JsonSchemaNode | null;
  path_params?: string[];
  query?: string[];
  /** Names the single argument whose object value is the whole JSON body. */
  body?: string | null;
}

export interface McpPluginSummary {
  slug: string;
  name: string;
  version?: string;
  tools: number;
}

export interface McpToolsResponse {
  tools: McpToolDefinition[];
  plugins?: McpPluginSummary[];
  warnings?: string[];
  fingerprint?: string;
}

// Translation types
export interface LanguageInfo {
  code: string;
  name: string;
  native?: string;
  default?: boolean;
}

export interface PageTranslations {
  translated: string[];
  untranslated: string[];
  // beta.7: disambiguates Grav's default-fallback behavior. `has_default_file`
  // is true when an untyped {template}.md exists; `explicit_language_files`
  // lists languages backed by a real {template}.{lang}.md on disk.
  has_default_file?: boolean;
  explicit_language_files?: string[];
}

export interface AdoptLanguageResponse {
  route: string;
  language: string;
  filename: string;
}

// Taxonomy types
export interface TaxonomyMap {
  [type: string]: string[];
}
