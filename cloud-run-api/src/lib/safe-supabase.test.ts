import { describe, it, expect, vi } from 'vitest';
import {
  safeQuery,
  safeQuerySingle,
  safeQueryOrDefault,
  safeQuerySingleOrDefault,
  SupabaseQueryError,
} from './safe-supabase.js';

// Mini fake PostgREST response builder
type FakeResponse<T> = {
  data: T | null;
  error: { message: string; code?: string; details?: string; hint?: string } | null;
};

function ok<T>(data: T): Promise<FakeResponse<T>> {
  return Promise.resolve({ data, error: null });
}

function err(message: string, code?: string): Promise<FakeResponse<any>> {
  return Promise.resolve({
    data: null,
    // PostgrestError shape has message, code, details, hint
    error: { message, code: code || 'XXXXX', details: '', hint: '' },
  });
}

describe('safe-supabase helpers', () => {
  describe('safeQuery', () => {
    it('returns data on success', async () => {
      const result = await safeQuery(ok([{ id: 1 }, { id: 2 }]) as any, 'test.ok');
      expect(result).toEqual([{ id: 1 }, { id: 2 }]);
    });

    it('returns [] when data is null but no error', async () => {
      const result = await safeQuery(ok(null) as any, 'test.null');
      expect(result).toEqual([]);
    });

    it('throws SupabaseQueryError on error', async () => {
      await expect(
        safeQuery(err('connection refused') as any, 'test.fail'),
      ).rejects.toThrow(SupabaseQueryError);
    });

    it('error message includes context', async () => {
      try {
        await safeQuery(err('timeout') as any, 'myCron.fetchUsers');
        expect.fail('should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(SupabaseQueryError);
        expect((e as Error).message).toContain('myCron.fetchUsers');
        expect((e as Error).message).toContain('timeout');
      }
    });
  });

  describe('safeQuerySingle', () => {
    it('returns data on success', async () => {
      const user = { id: 1, name: 'Steve' };
      const result = await safeQuerySingle(ok(user) as any, 'test.user');
      expect(result).toEqual(user);
    });

    it('returns null for PGRST116 (maybeSingle no rows)', async () => {
      const result = await safeQuerySingle(
        err('no rows', 'PGRST116') as any,
        'test.maybeSingle',
      );
      expect(result).toBeNull();
    });

    it('throws for real errors (not PGRST116)', async () => {
      await expect(
        safeQuerySingle(err('network error', 'PGRST500') as any, 'test.real'),
      ).rejects.toThrow(SupabaseQueryError);
    });
  });

  describe('safeQueryOrDefault', () => {
    it('returns data on success', async () => {
      const result = await safeQueryOrDefault(
        ok([{ id: 1 }]) as any,
        [],
        'test.ok',
      );
      expect(result).toEqual([{ id: 1 }]);
    });

    it('returns default on error and logs', async () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const result = await safeQueryOrDefault(
        err('db down') as any,
        [{ id: 0, name: 'default' }],
        'test.degraded',
      );
      expect(result).toEqual([{ id: 0, name: 'default' }]);
      expect(spy).toHaveBeenCalledWith(
        expect.stringContaining('test.degraded'),
        expect.stringContaining('db down'),
      );
      spy.mockRestore();
    });

    it('returns default when data is null without error', async () => {
      const result = await safeQueryOrDefault(
        ok(null) as any,
        [],
        'test.nulldata',
      );
      expect(result).toEqual([]);
    });

    it('does NOT throw on error', async () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      await expect(
        safeQueryOrDefault(err('anything') as any, [], 'test.noThrow'),
      ).resolves.toEqual([]);
      spy.mockRestore();
    });
  });

  describe('safeQuerySingleOrDefault', () => {
    it('returns data on success', async () => {
      const user = { id: 1 };
      const result = await safeQuerySingleOrDefault(ok(user) as any, null, 'test.single');
      expect(result).toEqual(user);
    });

    it('returns default on PGRST116', async () => {
      const defaultUser = { id: 0, name: 'anon' };
      const result = await safeQuerySingleOrDefault(
        err('no rows', 'PGRST116') as any,
        defaultUser,
        'test.noMatch',
      );
      expect(result).toEqual(defaultUser);
    });

    it('returns default on other errors with log', async () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const result = await safeQuerySingleOrDefault(
        err('timeout', 'PGRST500') as any,
        null,
        'test.realError',
      );
      expect(result).toBeNull();
      expect(spy).toHaveBeenCalled();
      spy.mockRestore();
    });
  });
});
