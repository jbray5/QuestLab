"""Art direction — the single visual voice for every generated image (Plan 54).

The lane: **inked storybook**. Confident hand-inked linework, flat gouache
colour washes, a muted earthy palette with one warm accent, and an
aged-paper feel — the tradition of classic tabletop rulebook plates.
Chosen (owner delegated the call) over photorealism because the glossy,
over-lit, airbrushed look is exactly what reads as "AI slop"; a flat
stylized voice is distinctive, hides model artefacts, and stays coherent
across items, portraits, standees, banners, and backdrops.

Every image-prompt builder appends ``HOUSE_STYLE`` (or the transparent-
asset variant) instead of inventing its own style tail. Change the lane
here, and the whole product changes together.
"""

# Appended to scene-like images (portraits, banners, item cards, backdrops).
HOUSE_STYLE = (
    "Hand-inked storybook illustration in the tradition of classic tabletop "
    "rulebook plates: confident ink linework, flat gouache colour washes, a "
    "muted earthy palette with one warm accent colour, subtle aged-paper "
    "grain, soft matte finish. Absolutely no photorealism, no glossy 3D-render "
    "look, no neon rim lighting, no airbrushed gradients, no lens effects, "
    "no depth-of-field blur"
)

# Variant for transparent cut-out assets (standees, character models) —
# same voice, plus the isolation requirements those pipelines depend on.
HOUSE_STYLE_CUTOUT = (
    "Hand-inked storybook illustration: confident ink linework, flat gouache "
    "colour washes, muted earthy palette, soft matte finish — no photorealism, "
    "no glossy 3D-render look, no airbrushed gradients"
)
