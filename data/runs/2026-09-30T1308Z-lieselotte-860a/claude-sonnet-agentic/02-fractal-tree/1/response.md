I wrote `index.html` in the current directory, but I couldn't check how it looks in a browser. Headless Chrome wouldn't start in this sandbox, so no screenshots. Instead I ran the script under Node with stubbed DOM and canvas objects. That run threw no errors across all presets and palettes, depth 1 and 14, regenerate, and malformed rules. Please open it once to check the visuals.

**How it works**
- **L-system:** An axiom plus rewrite rules (for example `A=F[+A][-A]`) are expanded, then walked as a turtle. `F` draws, `+` and `-` turn, and `[` `]` start and end a branch. Each `[` shrinks the branch length by the length ratio.
- **Editable grammar:** The axiom and rules are editable text fields. A letter that appears on several rule lines picks one at random.
- **Presets:** The page ships five: Sakura fork, Wild oak, Weeping willow, Fern frond and Night pine.
- **Growth:** Branches extend outward along their paths, so the trunk grows first and twigs sprout after the limb passes. Glowing buds mark the growing tips. Blossoms pop open once growth finishes, then some drift down as petals.
- **Controls:** Live sliders for recursion depth, branch angle, length ratio and randomness/jitter. I also added gravity droop, blossom density, wind and growth speed.
- **Regenerate and replay:** The Regenerate button draws a new random seed and regrows the tree with the current settings. A separate Replay button regrows the same tree.
- **Look:** Branches are coloured by depth, from trunk to twig. There are four palettes (Sakura night, Ember dusk, Jade morning, Frost aurora), each with its own sky, sun or moon, hills, blossoms and fireflies. Clicking the scene sends a gust of wind.
- **Performance:** The L-system expansion is capped at 45,000 branches and 400,000 symbols. If a depth would exceed that, the page stops at the deepest iteration that fits and says so in the status line. Each depth level is drawn as one batched stroke, and blossoms are pre-rendered sprites. If frames get slow on a very large tree, it updates wind sway on every other frame.

It's a single file with inline CSS and JS and no external resources.