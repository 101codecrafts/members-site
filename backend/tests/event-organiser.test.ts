// r12: the events list marks the caller's own events (organiser view) and never returns the creator's id.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withOrganiserFlag } from '../lib/event-organiser.ts';

const rows = [{ id: 'a', title: 'A', created_by: 'u1' }, { id: 'b', title: 'B', created_by: 'u2' }, { id: 'c', title: 'C', created_by: null }];
test('signed-in creator gets organiser:true on their events only', () => {
  assert.deepEqual(withOrganiserFlag(rows, 'u1').map((e) => [e.id, e.organiser]), [['a', true], ['b', false], ['c', false]]);
});
test('visitors (no session) and empty ids are never organisers', () => {
  for (const me of [null, '']) assert.ok(withOrganiserFlag(rows, me).every((e) => e.organiser === false));
});
test('created_by is never returned', () => {
  for (const e of withOrganiserFlag(rows, 'u1')) assert.equal('created_by' in e, false);
});
