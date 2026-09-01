"""Art direction — the single visual voice for every generated image (Plan 54).

The lane: **oil painting** (owner's call, 2026-08-07). Visible brushwork
and impasto, layered glazes, real tonal depth, naturalistic materials —
19th-century romantic painting, not photography. It replaced the earlier
inked-storybook lane, which read as "animated" beside the Session 5
explorable scenes.

Still deliberately NOT photoreal: the glossy, over-lit, airbrushed render
is what reads as "AI slop". Painterly realism keeps the distinctive voice
while giving materials and light genuine weight.

Every image-prompt builder appends ``HOUSE_STYLE`` (or the transparent-
asset variant) instead of inventing its own style tail. Change the lane
here, and the whole product changes together.
"""

# Appended to scene-like images (portraits, banners, item cards, backdrops).
HOUSE_STYLE = (
    "Traditional oil painting on canvas in the tradition of 19th-century "
    "romantic painting: visible brushwork and impasto texture, layered glazes, "
    "rich tonal depth, naturalistic forms and believable materials, soft "
    "atmospheric light, faint canvas weave in the surface. Painterly realism — "
    "not a photograph, not a 3D render, no digital airbrush gradients, no neon "
    "rim lighting, no lens flare, no depth-of-field blur, no cartoon outlines, "
    "no flat vector shapes"
)

# Variant for transparent cut-out assets (standees, character models) —
# same voice, plus the isolation requirements those pipelines depend on.
HOUSE_STYLE_CUTOUT = (
    "Painted in oils: visible brushwork, layered glazes, rich tonal depth, "
    "naturalistic anatomy and believable materials, soft directional light. "
    "The subject is a LIVING character rendered in paint — with expressive "
    "eyes, natural skin/scale texture, and fabric that drapes and moves. "
    "Painterly realism — not a photograph, not a 3D render, and NEVER a "
    "sculpture, statue, figurine, clay model, toy, or miniature: no clay or "
    "plasticine texture, no matte stone surface, no museum-piece stiffness. "
    "No airbrush gradients, no neon rim lighting, no cartoon outlines"
)
