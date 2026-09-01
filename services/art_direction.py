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
# Cutout assets (heroes, standees) live one step off the oil lane: literal
# "oil painting on canvas" makes an isolated full-body figure read as a
# photographed painted SCULPTURE (2026-09-01, Creed the clay statue). The
# cutout voice is painted RPG character illustration — same warmth and
# brushwork, unmistakably a living person.
HOUSE_STYLE_CUTOUT = (
    "Hand-painted fantasy RPG character illustration, in the tradition of "
    "classic painted game splash art: confident painterly brushwork, rich "
    "warm colour, dramatic soft studio lighting, crisp readable silhouette. "
    "The subject is a LIVING character — expressive eyes catching the light, "
    "natural skin and scale texture, hair and cloth with weight and movement. "
    "Not a photograph, not a 3D render, and NEVER a sculpture, statue, "
    "figurine, clay model, toy, or miniature: no clay or plasticine texture, "
    "no stone surface, no museum stiffness. No neon rim lighting, no cartoon "
    "outlines, no flat vector shapes"
)
