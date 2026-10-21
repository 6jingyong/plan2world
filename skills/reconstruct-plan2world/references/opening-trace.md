# Opening derivation behavior

This is a low-level program contract. Image observations use
`architecture-pass.md`; furniture uses `furnishing-pass.md`. This document does
not request another model pass for openings.

Openings are visual annotations on an already accepted `bare-house-v1`. They do not
own wall geometry, IDs or derived interval fields.

The program-projected `source-annotation-v1` supplies:

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
program hint, but architectural image observations deliberately forbid it.

Door operation remains visual evidence, not geometry math:

- `single` — one hinged leaf;
- `double` — two hinged leaves sharing one aperture;
- `sliding` — sliding-panel/track access;
- `opening` — evidenced leafless passage.

Fixed glazing remains a window. Unresolved operation is a review warning and does
not remove a source-supported aperture. An accepted opening without a resolved
host fails the architecture gate before furnishing; the low-level warning alone
does not authorize continuing normal assembly. Keep uncertain candidates in the
audit without inventing their geometry.

Initial accepted doors/windows extend from floor to host wall height, with window
sill 0. The assembler applies this editable product default independently of
image evidence. The extraction model must not estimate opening heights.

The deterministic assembler calls this derivation logic, so the Skill should never
recompute, identify or assign opening fields itself.
