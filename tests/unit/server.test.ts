import { describe, it, expect } from 'vitest';
import { createServer } from '../../src/server.js';

function toolNames(coreTools?: 'all' | 'none' | string[]): string[] {
  const server = createServer({ url: 'https://test.grav.local/api', apiKey: 'grav_test', coreTools });
  return Object.keys((server as any)._registeredTools as Record<string, unknown>);
}

describe('createServer core tool groups', () => {
  it('loads every core group by default', () => {
    const names = toolNames();
    expect(names).toContain('list_pages');
    expect(names).toContain('get_config');
    expect(names).toContain('discover_plugins');
    expect(names).toContain('refresh_plugin_tools');
  });

  it('loads no core tools with none, but keeps refresh_plugin_tools', () => {
    expect(toolNames('none')).toEqual(['refresh_plugin_tools']);
  });

  it('loads only the groups listed', () => {
    const names = toolNames(['pages']);
    expect(names).toContain('list_pages');
    expect(names).toContain('refresh_plugin_tools');
    expect(names).not.toContain('get_config');
    expect(names).not.toContain('discover_plugins');
  });
});
