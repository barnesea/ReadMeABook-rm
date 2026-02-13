/**
 * Utility: Permission Resolution Tests
 * Documentation: documentation/admin-dashboard.md
 */

import { describe, expect, it } from 'vitest';
import { resolvePermission } from '@/lib/utils/permissions';

describe('resolvePermission', () => {
  it('always grants permission for admins regardless of other settings', () => {
    expect(resolvePermission('admin', null, false)).toBe(true);
    expect(resolvePermission('admin', false, false)).toBe(true);
    expect(resolvePermission('admin', true, false)).toBe(true);
    expect(resolvePermission('admin', null, true)).toBe(true);
  });

  it('uses per-user setting when explicitly true', () => {
    expect(resolvePermission('user', true, false)).toBe(true);
    expect(resolvePermission('user', true, true)).toBe(true);
  });

  it('uses per-user setting when explicitly false', () => {
    expect(resolvePermission('user', false, true)).toBe(false);
    expect(resolvePermission('user', false, false)).toBe(false);
  });

  it('falls back to global setting when per-user is null', () => {
    expect(resolvePermission('user', null, true)).toBe(true);
    expect(resolvePermission('user', null, false)).toBe(false);
  });
});
