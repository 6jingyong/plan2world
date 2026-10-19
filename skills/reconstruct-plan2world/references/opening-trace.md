# Opening derivation behavior

Openings are visual annotations on an already accepted `bare-house-v1`. They do not
own wall geometry, IDs or derived interval fields.

`source-annotation-v1` supplies only:

- `kind: door | window`;
- two observed source-pixel endpoints;
- source evidence;
- optional evidence-backed door operation and operation evidence.

It must not supply `id`, `wallId`, `width`, `position`, confidence or thickness.

`deriveSourceOpenings` / `tooling/derive-plan2world-openings.mjs` owns:

- deterministic opening IDs supplied by the assembler (`d1…`, `win1…`);
- matching both endpoints to one normalized Bare House host within tolerance;
- endpoint projection onto that host;
- projection-distance tolerance;
- path-distance width in source pixels;
- opening midpoint parameter along straight or quadratic hosts;
- cm width after scale is supplied;
- warnings when both endpoints do not resolve to one host or door operation is unresolved.

A manually prepared low-level opening trace may still include `wallId` as an optional
program hint, but image-model `source-annotation-v1` deliberately forbids it.

Door operation remains visual evidence, not geometry math:

- `single` — one hinged leaf;
- `double` — two hinged leaves sharing one aperture;
- `sliding` — sliding-panel/track access;
- `opening` — evidenced leafless passage.

Fixed glazing remains a window. Missing/uncertain opening extent or operation is a
review warning. Reopen the geometry gate only if later evidence proves the Bare House
wall geometry itself is wrong or disconnected.

The deterministic assembler calls this derivation logic, so the Skill should never
recompute, identify or assign opening fields itself.
