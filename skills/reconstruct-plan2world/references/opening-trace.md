# Opening derivation behavior

Openings are source annotations on an already accepted `bare-house-v1`. They do not
own wall geometry.

The annotation pass supplies only:

- `id`;
- `kind: door | window`;
- two observed source-pixel endpoints;
- source evidence;
- optional evidence-backed door operation/confidence.

It must not supply `wallId`, `width`, `position` or thickness.

`deriveSourceOpenings` / `tooling/derive-plan2world-openings.mjs` owns:

- matching both endpoints to one normalized Bare House host within tolerance;
- endpoint projection onto that host;
- projection-distance tolerance;
- path-distance width in source pixels;
- opening midpoint parameter along straight or quadratic hosts;
- cm width after scale is supplied;
- warnings when both endpoints do not resolve to one host or door operation is unresolved.

A manually prepared low-level opening trace may still include `wallId` as an optional
program hint, but `source-annotation-v1` deliberately forbids it so the image model
never owns normalized-ID association.

Door operation remains source evidence, not geometry math:

- `single` — one hinged leaf;
- `double` — two hinged leaves sharing one aperture;
- `sliding` — sliding-panel/track access;
- `opening` — evidenced leafless passage.

Fixed glazing remains a window. Missing/uncertain opening extent or operation is a
review warning. Reopen the geometry gate only if later evidence proves the Bare House
wall geometry itself is wrong or disconnected.

The deterministic assembler calls the same opening derivation logic when converting
`source-annotation-v1` into the final draft, so the Skill should normally call the
assembler rather than recomputing or assigning opening fields itself.
