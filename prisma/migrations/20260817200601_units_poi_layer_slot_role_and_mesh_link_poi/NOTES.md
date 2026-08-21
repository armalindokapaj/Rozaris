Reconciliation placeholder, not a real schema change — see the sibling
`../20260817200611_units_poi_layer_slot_role_and_mesh_link_poi/migration.sql`
for the actual DDL for this logical change (Units Blocks & POI Layer PRD).

`_prisma_migrations` on the live DB has this exact migration name recorded
as successfully applied, with a checksum equal to SHA-256 of an empty file —
i.e. whatever concurrent session applied it really did run an empty
migration (likely a `prisma migrate dev` race against the `...200611` one
moments later, which carried the real changes). `migration.sql` here is
deliberately left empty (0 bytes) to match that recorded checksum exactly,
so `prisma migrate dev`'s local-vs-applied history check reconciles without
requiring a destructive `prisma migrate reset` and without editing the
`_prisma_migrations` table directly. This file is a sibling note, not
`migration.sql` itself, so it doesn't affect Prisma's checksum.
