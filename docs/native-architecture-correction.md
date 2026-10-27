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

Use **Correct walls and openings…** from the scene menu, **Walls…** from plan view,
or **Correct annotated plan…** after desktop reconstruction. The native correction
window has Walls, Openings and Notes tabs over the retained source image:

- Click a wall or choose its segment ID. Drag an endpoint, or enter centimetre
  coordinates, thickness and height. Exact adjoining endpoints move together.
- Draw a missing wall with two clicks. Wheel zooms; middle-button dragging pans.
- Split at a chosen percentage. Straight/quadratic paths, taper, saved floor
  references and opening positions are preserved. Cuts through openings or mounted
  furniture are refused; dependent objects are not silently removed.
- Add a door/window or select an existing opening, choose its wall, position,
  dimensions and basic motion, then apply. Choose the main door and inward arrow.
- Click an error marker or a note to inspect it; mark it reviewed explicitly.
  Source snapshots remain in saved native JSON and Project packages.

Every edit goes through the packaged shared native core. The correction session
keeps only its accepted current Project and one in-flight candidate. It can save
a Project while ground/entry/placement still needs work. **Apply to space** becomes
available only when the normal strict runtime compiler can produce a valid world.
The previous active world stays intact until that explicit commit. Godot does not
derive topology or modify GLB triangles as authoring truth.

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
adds window animation or new motion mechanisms. **Size / position…** selects this
opening in the correction window. Multi-leaf/pocket settings remain under this
door's **Panels…** action. All accepted choices persist in the canonical Project.

This is a native authoring change. Its synthetic fixture and frozen black-image
replay do not establish new model extraction quality, real-house route coverage,
or Windows hardware acceptance.
