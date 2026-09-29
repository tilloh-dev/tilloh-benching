Write a Wavefront OBJ file `tree.obj` that models a recognizable low-poly tree.

Requirements:
- A trunk (e.g. a tapered prism with 5–8 sides) and a canopy that is layered or faceted: for example stacked, tapering cones like a pine, or a few overlapping low-poly spheres like a deciduous tree.
- Roughly 50–400 faces in total. Triangles and quads are both fine.
- Y is up. The tree stands on the ground plane: the lowest vertex has y = 0 and the trunk base is centered near x = 0, z = 0.
- Total height between 2 and 5 units, with believable proportions: the canopy is clearly wider than the trunk and part of the trunk is visible below it.
- Use `o` or `g` statements to separate the parts, named `trunk` and `canopy` (optional, but recommended).
- Use only `v` and `f` statements, `o`/`g` statements and `#` comments. No `mtllib`/`usemtl` and no separate material file; texture coordinates and normals are not needed.
- Valid geometry: every face references existing vertices (1-based indices), each part is a closed mesh, faces are wound counter-clockwise when seen from outside, and there are no degenerate (zero-area) faces, duplicate faces or unused vertices.

Compute the coordinates carefully so the result is clean, symmetric where intended and pleasing to look at.
