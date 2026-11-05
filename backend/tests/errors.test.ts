import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fromPostgres, toAppError, AppError } from '../lib/errors.ts';

test('a database that is behind the code maps to schema_outdated (500), never leaking SQL', () => {
  for (const code of ['42883', '42P01', '42703', '42704', 'PGRST202', 'PGRST204', 'PGRST205']) {
    const e = fromPostgres({ code, message: 'function public.admin_console_stats() does not exist' });
    assert.equal(e.code, 'schema_outdated', code);
    assert.equal(e.status, 500);
    assert.doesNotMatch(e.message, /admin_console_stats|function public/);
    assert.match(e.message, /^Database not updated/);
  }
});

test('existing mappings unchanged; unknown DB errors stay internal', () => {
  assert.equal(fromPostgres({ code: '42501' }).status, 403);
  assert.equal(fromPostgres({ code: 'P0001', message: 'Course is full' }).code, 'unprocessable');
  assert.equal(fromPostgres({ code: 'XX000' }).code, 'internal');
  assert.equal(toAppError(new Error('boom')).code, 'internal');
  assert.equal(new AppError('mfa_required', 'x').status, 403);
});
