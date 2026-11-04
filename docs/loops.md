# Section loop bands (round 9)

Neo-Brutalist animated bands behind a few sections. Loops after Scenario's Motion Loops (https://www.scenario.com/explorations/motion-loops).
The shipped files carry one-line comments to stay inside the 8 KB gzip budget; the full notes per file are here.

## js/loops.js

101 section loops (round 9): quiet animated bands behind sections marked data-loop="name".
Loops after Scenario's Motion Loops (https://www.scenario.com/explorations/motion-loops): each is draw(ctx,w,h,t,P),
a pure function of t whose periods divide 12 s, so it loops with no seam. Code per loop in js/loops/<name>.js,
fetched only when its section nears the viewport. Drawn in a Worker on an OffscreenCanvas (this same file; main-thread
fallback), <= 20 fps, only while on screen and the tab is visible, DPR <= 1.5, sized by ResizeObserver.
Reduced motion, Lite / data saver, cc_bg_motion "reduced" = one still frame; "off" = no canvas; ?static=1 = nothing;
print hides it (css). Colours: theme tokens --lp-1/2/3 (flat fills), --lp-ol (outline + hard shadow) on the section;
the band's strength is one flat css opacity (--lp-a) on the canvas, so the drawing itself stays fully opaque and flat.
Look: Neo-Brutalist (101 brand) - flat fills, 3px navy outlines, hard offset shadows, square corners, snappy moves with holds.

helpers for the loop files (the Scenario template's M.*, trimmed)

Neo-Brutalist block: hard offset shadow (no blur), flat fill, thick square-cornered navy outline. p is a Path2D.

the same for a stroked line motif: shadow line, navy outline line, colour line on top

draw stills once; run the clock while any band is visible

~20 fps

worker side: messages from the page below

after load + idle, like bg.js

## js/loops/bauhaus.js

Bauhaus shapes (sign-in / sign-up side panel), Neo-Brutalist: a coarse grid of flat quarter discs, half discs, squares
and triangles in cyan, orange and white, each with a 3 px navy outline and a hard screen-space shadow. On its own
staggered 12 s cycle each turns +90 deg, holds, +90 deg, holds, swings -180 deg back and holds, every turn with an
overshoot; the cycle ends where it started, so the loop closes.

## js/loops/contour.js

Contour terraces (inner-page headers). Scenario's contour lines, made Neo-Brutalist: the contour of a hill drawn as a
terrace of flat bars (heights snapped to 10 px steps) on the right half of the header only, navy outlines and hard
shadows; the hill jumps between three spots on a 12 s cycle (overshoot, hold), its top bar orange.

## js/loops/cubes.js

Isometric cubes (404 page), Neo-Brutalist: a sparse field of flat-shaded cubes (top cyan or orange, left white, right
navy) with thick navy outlines on isometric lattice nodes. On staggered 6 s beats a cube springs up (overshoot), holds,
drops and bounces once; its hard shadow stays on the floor, so the lift reads.

floor shadow, stays put

## js/loops/halftone.js

Block halftone (stats strip), Neo-Brutalist: a screen of chunky square blocks whose size snaps between three steps
(none, small, big) as two travelling waves (6 s and 12 s) pass; big blocks cyan, small ones white, all with a navy
outline and a hard shadow. The steps make every change a snap; between snaps the blocks hold.

## js/loops/truchet.js

Truchet arcs (WhatsApp community band), Neo-Brutalist: thick arcs with a navy outline and a hard shadow. Each tile snaps
a quarter turn with an overshoot once per 6 s, then holds, staggered across the band; two turns = 180 deg = the same tile,
so the 12 s loop closes. About one tile in ten is orange.

arcs on two opposite corners, turned by a

## js/loops/tunnel.js

Frame tunnel (final CTA band). Scenario's grid-tunnel idea, made Neo-Brutalist: nested square-cornered frames with thick
navy-outlined strokes and hard shadows snap one frame outward every 1.5 s (overshoot, then hold), 8 snaps per 12 s;
every 4th frame is orange and keeps its colour as it travels; a solid orange block marks the vanishing point.
