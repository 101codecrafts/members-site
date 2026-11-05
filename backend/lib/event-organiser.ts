/** GET /v1/events: tell the caller which events they organise without publishing anyone's user id.
 *  `organiser` is true only for the signed-in creator; `created_by` is always dropped. Pure, so it is unit-tested. */
export function withOrganiserFlag<T extends { created_by?: string | null }>(rows: T[], me: string | null): (Omit<T, 'created_by'> & { organiser: boolean })[] {
  return rows.map(({ created_by, ...e }) => ({ ...e, organiser: me != null && me !== '' && created_by != null && created_by === me }));
}
