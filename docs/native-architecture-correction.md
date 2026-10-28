# Native wall correction and door appearance

Desktop reconstruction makes two observations, then returns an editable native
Project with located source-review notes when geometry cannot be assembled
strictly. It never adds a model repair call. The original observations and working
image SHA-256 stay in `Project.architectureReview`, including observations that
could not be applied. The original/working raster and preparation evidence stay
with the Project. Reviewing a note is an explicit acknowledgement, not an accuracy
certificate, and does not delete its evidence.

Valid strict input still produces the same draft. Source wall duplicates and
zero-area retracing may use the existing exact deterministic projection. An
unhosted opening remains a source marker; it does not get an invented wall. If a
record is malformed, individually usable wall records remain editable. A source
with unusable scale opens an annotated drawing canvas instead of pretending to
have a measured reconstruction. Provider, file and image-identity failures remain
operational errors.

Use **Correct walls and openings…** from the scene menu, **Fix plan…** from plan view,
or **Correct annotated plan…** after desktop reconstruction. The native correction
window has Walls, Openings, Notes and Start tabs over the retained source image:

- **Choose entrance… → Start** lets you click an existing door on the plan or
  choose it from the list, then point the amber inward arrow into the home.
  Door/side choices are previews only. **Confirm entrance** explicitly saves the
  choice; **Cancel entrance preview** restores the saved choice. Missing-entry
  Projects open this tab automatically. No wall-edit permission is needed.
  The green arrow denotes the confirmed entry. An outward, obstructed or too
  narrow entry remains editable but cannot enable **Apply to space**.

- Walls start protected. Explicitly enable **Enable wall correction** for advanced
  correction. Changed walls retain `authorModified`, show amber in top view, and
  require **Also allow marked walls** for another correction; source notes stay
  independent and no operation history is retained.
- Click a wall or choose its segment ID. Drag an endpoint, or enter centimetre
  coordinates, thickness and height. Exact adjoining endpoints move together.
- Draw a missing wall with two clicks. Wheel zooms; middle-button dragging pans.
- Split at a chosen percentage. Straight/quadratic paths, taper, saved floor
  references and opening positions are preserved. Cuts through openings or mounted
  furniture are refused; dependent objects are not silently removed.
- Add a door/window or select an existing opening, choose its wall, position,
  dimensions and basic motion, then apply. Hinge/travel endpoint and opening-side
  controls retain the native door semantics; they are independent of the main
  entrance's inward arrow. **Preview selected door as entrance…** opens Start.
- Click an error marker or a note to inspect it; mark it reviewed explicitly.
  Source snapshots remain in saved native JSON and Project packages.

Every edit goes through the packaged shared native core. The correction session
keeps only its accepted current Project and one in-flight candidate. It can save
a Project while ground/entry/placement still needs work. **Apply to space** becomes
available only when the normal strict runtime compiler can produce a valid world.
The previous active world stays intact until that explicit commit. Godot does not
derive topology or modify GLB triangles as authoring truth.

Source fractional coordinates and dimensions survive selection and height-only
edits. Endpoint clicking without a drag never rounds geometry or dirties the
Project. App close/source replacement protects unsaved correction sessions as
well as the active furniture Project. Invalid/overlapping apertures block shared
runtime artifact compilation before a host wall could be omitted; native backup
and correction remain available. Source semantic blocks remain visible/selectable
without arbitrary proxy collision; real replacement furniture retains collision.

Walls already have independent native IDs and compiler-owned owner metadata; a
separate fragmentation of the building mesh is unnecessary. Logical splits update
Project references, and the shared compiler regenerates surfaces and collision.
Structural commits replace the derived world; interactive point previews stay in
the native drawing window.

Selecting furniture, a door or a window shows one compact **Modify M** action.
Furniture modification uses the same categorized thumbnail catalog as addition,
with the current asset selected and a cancellable placement preview. Door/window
modification uses that catalog component in a native window bound to the selected
object, without a whole-house ID selector. Choosing a thumbnail is provisional;
the final button applies it. Add and Modify retain separate browse filters.

In walkthrough, aim at the object and press **M** or release the pointer to click
the contextual action. Furniture replacement enters plan placement mode. Wood,
glass and metal/security-door cards change presentation only, keeping the same
body nodes and open state. Window-type cards retain the aperture and physics;
the shared compiler supplies simplified frame presentation. Neither card picker
adds window animation or new motion mechanisms. **Size / position…** previews this
opening in the same Godot world. Multi-leaf/pocket settings remain under this
door's **Panels…** action. All accepted choices persist in the canonical Project.

This is a native authoring change. Its synthetic fixture and frozen black-image
replay do not establish new model extraction quality, real-house route coverage,
or Windows hardware acceptance.

## Same-world ground and opening placement

Use **Build… → Pave ground** in the normal native top view. Click the polygon
corners, preview, then Confirm or Cancel. **Last corner** edits only the pending
outline. **Adjust existing corners** enables dragging; choose an existing explicit
polygon ground to adjust it. Live wall/curve floor boundaries are read-only in
this polygon tool and stay intact. No accepted operation history or Undo is added.
New authoring uses polygons; curve editing and curved mounting are outside the
current product scope, while older Project curves remain compatible.

A confirmed ground is a native `Room.boundary` with outdoor semantics. The shared
compiler derives invisible outer guards from the union of accepted surfaces,
including exposed edges without physical walls. Shared/overlapping interior seams
are passable and slab holes stay holes. Guards stop the player at the outer edge;
actual architectural air walls remain distinct. Source geometry is not inferred
or completed by this safety policy.

**Build… → Add door / Add window** uses the same categorized thumbnails as Modify.
Pick a solid host wall, drag the opening or its end handles, adjust width/height
and window sill, then Confirm. **Size / position…** for an existing opening uses
this same tool and preserves material, motion, hinge and identity. Preview checks
use the shared core, and acceptance runs the full compiler again. Invalid openings
remain unconfirmed, with the previous world and Project retained. Ground and
aperture geometry rebuild the derived world; appearance-only changes retain
existing player and door state. Source-error correction remains separately editable.
