# v0.1.2
## 08/28/2026

1. [](#new)
    * Plugins can now publish their own tools. Any enabled plugin that ships an `mcp.yaml` manifest describing its API routes shows up as tools named `<plugin>_<name>`, with the plugin's own permissions checked before each call, and nothing to configure on this end. `refresh_plugin_tools` re-reads the manifests without a restart, so a plugin you install or enable mid-session becomes usable right away, and `discover_plugins` reports which plugins offer tools. Load only some plugins with `--plugin-tools slug,slug`, or turn the whole thing off with `--plugin-tools none` (or `GRAV_MCP_PLUGIN_TOOLS`). Sites running an older API plugin are unaffected: the server warns on stderr and starts with core tools only
    * A plugin manifest can now mark one argument as the whole request body (`body`, manifest version 2), so plugins whose fields come from site blueprints rather than the manifest, such as a Flex directory's fields, can be driven from a tool [getgrav/grav-plugin-api#32](https://github.com/getgrav/grav-plugin-api/issues/32)

1. [](#bugfix)
    * A plugin tool whose manifest sets `additionalProperties: true` on its root schema now passes undeclared arguments through instead of silently stripping them, and advertises that it accepts them [#4](https://github.com/getgrav/grav-mcp/issues/4)
    * Error responses are now read even though the API sends them as `application/problem+json`, so a failed call reports the server's own detail (`Product not found`, a conflict message) instead of a bare `HTTP 404: Not Found`
    * A `409` from a plugin route now reports the plugin's own reason (an attribute still in use, a slug already taken) instead of being mistaken for an ETag conflict and told to refetch
    * A `404` whose body is a plugin's own `data` envelope now reports its `message` (`No license matches that key.`) rather than the generic `Resource not found.`

1. [](#improved)
    * `run_scheduler` now describes what it actually does: it runs every job that has missed its scheduled time, not only the ones due in the current minute. Nothing about the call changed, but the old wording had it looking useless, since a job counts as due only during the exact minute its schedule names

# v0.1.1
## 08/25/2026

1. [](#bugfix)
    * Fixed the pre-flight permission checks on `create_backup` and `list_backups`, which refused keys that hold the `api.system.backup` permission the API actually requires [#2](https://github.com/getgrav/grav-mcp/issues/2) (thanks @sandymac)
    * Fixed `create_environment` to check `api.config.write` and `test_webhook` to check `api.webhooks.write`, matching what the API enforces [#2](https://github.com/getgrav/grav-mcp/issues/2)
    * Fixed `get_dashboard_widgets`, `update_dashboard_layout`, `get_blueprint` (user type) and `manage_api_keys` (list) to stop demanding a narrower permission than the API requires
    * Removed the `label` argument from `create_environment`; the API ignores it and always uses the folder name as the label [#3](https://github.com/getgrav/grav-mcp/issues/3) (thanks @sandymac)
    * Documented the `api.system.backup` permission in the README permission tree

# v0.1.0
## 04/12/2026

1. [](#new)
    * Initial release
