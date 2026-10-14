# Game-piece furniture

Plan2World treats furniture as spatial game pieces first and visual assets second.

## Core invariant

The saved project data remains the source of truth for placement:

- catalog/category identity;
- footprint (`width × depth`);
- position;
- rotation;
- color;
- optional height/scale/material metadata for compatibility.

The default renderer must not require a detailed GLB or a handcrafted procedural model for every catalog item.

## Default presentation

- **Catalog:** colored footprint tile + category icon, scaled to the item's real width/depth ratio.
- **2D plan:** existing footprint/selection/drag/rotate/resize behavior remains unchanged.
- **3D:** cheap colored board-game-like primitive with an exact footprint and a capped visual height.
- A small front marker makes rotation visible even for square pieces.

Detailed custom models remain supported as an optional skin. They should never be required to open, edit, place, save, or walk through a project.

## Why

The product is testing whether a normal user can reconstruct a home from a flat plan and manipulate the space like a simple game. Asset realism is not on that critical path. Keeping furniture abstract makes the catalog faster, the scene cheaper, category/footprint differences clearer, and future AI reconstruction independent of a fragile model-ID vocabulary.

Walkthrough collision is currently independent of furniture meshes: the existing walkthrough motion directly updates the camera pose. Proper wall/furniture collision should therefore be implemented later as explicit plan-space collision geometry rather than relying on visual mesh bounds.
