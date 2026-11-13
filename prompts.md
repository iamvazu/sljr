# prompts.md — Scene Stills and Camera-Flight Prompts

**Project:** "See Real Estate Through a New Lenz" scroll-world for Steven Lenz Jr. (Compass)
**Pipeline:** `oso95/scroll-world` · Photoreal architectural style · **Architecture A** (one continuous forward walkthrough, sequential legs, no connectors) · desktop 16:9 chain + native 9:16 mobile chain
**Use with:** `steven-lenz-scrollworld-prd.md` §6–§7

---

## How to use this file

1. **Stills (Step 2 of the skill).** Each still prompt = `STYLE PREAMBLE` (byte-for-byte identical every time) + `NEGATIVE TAIL` + the scene's `Subject:` block. Save as `gen/still_N.txt`.
   - Desktop: `--aspect_ratio 3:2 --resolution 2k --quality high` (model `gpt_image_2`).
   - Mobile: render each scene natively in portrait (see "Mobile chain" below) as `gen/still_Nm.txt`.
   - For photoreal, do **not** pass an `--image` reference between scenes; it clones the same room. Cohesion comes from the identical preamble.
2. **Legs (Step 4, Architecture A).** Render **sequentially**:
   - Leg 1 `--start-image` = still 1 (as a 16:9 canvas).
   - Leg N `--start-image` = the **actual last frame of leg N-1** (`ffmpeg -sseof -0.05 -i leg_{N-1}.mp4 -frames:v 1 last_{N-1}.png`).
   - **Never** pass `--end-image` in Architecture A.
   - **Before rendering the next leg, look at the last frame.** It must read as a calm forward drift, level horizon, no half-finished orbit. If not, re-roll.
3. **Bold clauses are the motion-handoff contract.** Keep them verbatim in every leg; they are what makes the seams invisible.
4. **Content-filter hygiene.** Seedance flags innocuous interiors. These prompts already avoid trigger words ("bed", "pool", "wine", "bar", "swim", "spa", "waterfall"). If a leg still returns `nsfw`: (1) re-roll up to 2×; (2) use that scene's **Safe variant**; (3) re-render just that leg on `kling3_0` with the same start image.
5. **Previz first.** Run all six legs at 480p, assemble, get approval, then rerun at 1080p with identical prompts.

**Durations:** legs 1, 2, 3, 5 = 8 s · leg 4 (gallery half-orbit) = 10 s · leg 6 (terrace settle) = 8 s. On `kling3_0` fallback use `--duration 10 --mode std --sound off`.

---

## Shared blocks

### STYLE PREAMBLE (copy exactly; do not edit per scene)

```
Ultra-photorealistic architectural photography of one cohesive contemporary California estate in the
Tri-Valley hills east of San Francisco: warm limestone, smoked oak, bronze-framed glass, honed
concrete, and native oak trees. Cinematic wide-angle lens, natural light, restrained designer
furnishings, editorial interiors-magazine quality, shallow depth of field, subtle film grain.
Cohesive color palette of deep midnight #0D1117, warm bone #F3EEE6, golden-hour amber #D8A55A,
hardwood brown #B07440, muted vineyard green #6E7F55 and twilight blue #3B4A6B. Empty and
unoccupied, no people, no figures.
```

### NEGATIVE TAIL (append after the preamble in every still)

```
Absolutely no text, no letters, no numbers, no signage, no logos, no brand marks, no sports team
insignia, no jerseys with names. Centered composition with the focal subject in the middle third and
calm headroom; nothing essential at the far left or right edge.
```

### LEG TAIL (append to every leg prompt)

```
Photorealistic, same estate and materials, same palette of midnight, bone, golden-hour amber,
hardwood and twilight blue. Smooth, graceful, slow motion, subtle parallax, natural light behavior,
steady horizon. Empty and unoccupied, no people. No text, no captions, no logos.
```

---

## Light and time-of-day arc

| Scene | Time of day | Key light |
|---|---|---|
| 1 Lens Portal | Golden hour, sun low over western hills | Warm amber backlight, long shadows |
| 2 Hardwood & Roots | Late golden hour | Amber shafts through clerestory windows |
| 3 Concierge Studio | Sunset | Warm practicals and a fading window glow |
| 4 Portfolio Gallery | Dusk | Gallery picture lights, cool sky through skylights |
| 5 VIP Lounge | Blue hour | Low warm lamps, a deep blue view wall |
| 6 Let's Connect Terrace | Twilight | Fire-table glow, string lights, a deep twilight sky with valley town lights |

Every scene shares the same architecture: the camera always moves **deeper into one estate**, which is what makes a single forward take believable.

---

## Scene 1 — The Lens Portal (Hero) · `id: lens`

**Still (desktop, 3:2) — `gen/still_1.txt`**
```
[STYLE PREAMBLE]
[NEGATIVE TAIL]
Subject: A monumental sculptural camera lens, three stories tall, standing in a golden oak-studded
hillside meadow like an architectural pavilion — brushed bronze barrel with fine knurled focus
rings, a circular aperture of overlapping blackened-steel blades partly open, and a flawless glass
front element. Seen through the glass, perfectly in focus and slightly magnified, is the estate
beyond: a long low contemporary residence of limestone and bronze glass, a gravel motor court lined
with olive trees, terraced vineyard rows on the slope behind, and the soft silhouette of Mount
Diablo on the horizon. Outside the lens the meadow is gently out of focus with warm bokeh. Low
golden-hour sun backlights dry summer grass. The lens sits dead center; the estate seen through it
occupies the middle of the frame.
```

**Leg 1 (16:9, 8 s) — start-image: still 1 on a 16:9 canvas · `gen/leg_1.txt`**
```
Single continuous cinematic camera move, no cuts. **Continue the same slow, steady forward glide.**
The camera drifts toward the giant bronze lens as its aperture blades smoothly open wider, the
estate beyond the glass sharpening like a focus pull; the camera passes straight through the open
aperture, the bronze rings sliding past the edges of frame, and emerges gliding low over the gravel
motor court toward the estate's tall pivoting glass entry door, which stands open, warm light inside.
**In the final second, settle back into a slow, steady forward glide toward the open entry door
and the warm-lit gallery hallway beyond it.**
[LEG TAIL]
```

**Safe variant:** remove "low" from "gliding low"; replace "pivoting glass entry door" with "tall open glass entry".

---

## Scene 2 — The Hardwood & Roots (Meet Steven) · `id: roots`

**Still — `gen/still_2.txt`**
```
[STYLE PREAMBLE]
[NEGATIVE TAIL]
Subject: The estate's private indoor basketball court, a refined architectural gymnasium: honey
maple hardwood floor with crisp painted court lines but no center logo, a single glass backboard
and hoop on a slim black-steel stanchion, a basketball resting alone at center court. High
clerestory windows rake warm late-golden-hour light across the floor in long amber stripes.
Walnut-slat walls, a vintage wooden gym bench along the sideline with a neatly folded white towel,
a coach's clipboard and a whistle on a lanyard. Through a long low window, a glimpse of a quiet
tree-lined suburban street at evening. Calm, nostalgic, disciplined.
```

**Leg 2 (8 s) — start-image: last frame of leg 1 · `gen/leg_2.txt`**
```
Single continuous cinematic camera move, no cuts. **Continue the same slow, steady forward glide.**
The camera travels down a warm-lit gallery hallway and through a wide open doorway into a private
indoor basketball court, then rises smoothly in a gentle crane-up as the full maple court reveals
below, amber light striping the floor, the lone ball at center court, the bench with towel, clipboard
and whistle along the sideline. The camera passes over center court toward the far end.
**In the final second, settle back into a slow, steady forward glide toward the open double doors at
the far end of the court, warm sunset light glowing beyond them.**
[LEG TAIL]
```

**Safe variant:** replace "rises smoothly in a gentle crane-up" with "glides steadily at eye level".

---

## Scene 3 — The Compass Concierge Studio (Services) · `id: concierge`

**Still — `gen/still_3.txt`**
```
[STYLE PREAMBLE]
[NEGATIVE TAIL]
Subject: A design studio wing of the estate, split by a floor-to-ceiling frameless glass partition.
On the left of the glass: a bare, unstaged living room — empty walls, plain floor, a stepladder,
paint sample swatches taped to the wall, a drop cloth. On the right of the glass: the very same room
beautifully finished and staged — sculptural sofa in bone boucle, walnut coffee table, abstract art,
layered rug, a lit floor lamp. In the foreground, a long walnut worktable with material boards, fabric
swatches, stone samples, a tape measure and rolled floor plans. At the far end, a discreet
blackened-steel door with a round brass handle suggests a private vault. Warm sunset light from tall
windows; warm practical lamps.
```

**Leg 3 (8 s) — start-image: last frame of leg 2 · `gen/leg_3.txt`**
```
Single continuous cinematic camera move, no cuts. **Continue the same slow, steady forward glide.**
The camera passes through open double doors into a design studio and tracks low and level alongside
a long walnut worktable of material boards and swatches, foreground samples sliding past in parallax,
while beside it a floor-to-ceiling glass partition reveals a bare unstaged room on one side becoming
a beautifully staged living room on the other as the camera moves along it. The camera continues
toward a discreet blackened-steel door at the far end, which swings slowly open onto a softly lit
corridor.
**In the final second, settle back into a slow, steady forward glide through the open steel door into
the softly lit gallery corridor beyond.**
[LEG TAIL]
```

**Safe variant:** remove "drop cloth" from the still; in the leg, replace "swings slowly open" with "stands open".

---

## Scene 4 — The Tri-Valley Portfolio Gallery (Featured Sales) · `id: portfolio`

> **Design rule:** the three frames are **empty**, with a soft even glow and no pictures inside. The website overlays real, credited property photos onto them in HTML. Never generate imagery that could pass as a real listing.

**Still — `gen/still_4.txt`**
```
[STYLE PREAMBLE]
[NEGATIVE TAIL]
Subject: A long, hushed private gallery hall at dusk: polished concrete floor, warm limestone walls,
a ribbon skylight showing a deep blue sky. Three large empty floating frames, each a thin bronze
border around a softly glowing blank warm-white panel, suspended at slight angles — one left, one
center, one right — each lit by its own museum picture light. A low leather gallery bench in the
middle of the room. Through a glass wall at the far end, the faint outline of vineyard rows on dark
hills. Calm, reverent, museum-like.
```

**Leg 4 (10 s) — start-image: last frame of leg 3 · `gen/leg_4.txt`**
```
Single continuous cinematic camera move, no cuts. **Continue the same slow, steady forward glide.**
The camera enters a long hushed gallery hall and sweeps in a slow half-orbit around the central
empty glowing bronze frame, keeping it centered, the left and right frames drifting past in
parallax, then continues past it down the hall; the three frames remain blank, softly glowing
panels throughout.
**In the final second, settle back into a slow, steady forward glide toward a wide opening at the end
of the hall where a warm, dimly lit lounge glows in blue-hour light.**
[LEG TAIL]
```

**Safe variant:** replace the half-orbit with "glides slowly past the three empty glowing frames, keeping the central frame centered as it passes". Lower re-roll risk.

**Overlay alignment note:** after the final render, record the scroll-progress points where each frame is most frontal (for example 30%, 50%, 70% of the leg). Pin the HTML listing cards there with a subtle CSS perspective tilt so they appear to sit in the frames.

---

## Scene 5 — The VIP Lounge (Sports & Entertainment + Testimonials) · `id: lounge`

**Still — `gen/still_5.txt`**
```
[STYLE PREAMBLE]
[NEGATIVE TAIL]
Subject: A private members-style lounge within the estate at blue hour: smoked-oak paneled walls,
deep low leather lounge chairs and a sculptural walnut coffee table with a closed leather portfolio
and a fountain pen on it, backlit floor-to-ceiling display shelving holding abstract bronze and glass
sculptures and art books, a glowing glass display niche with a single abstract sculptural object.
One whole wall is glass, framing the deep blue dusk sky over dark rolling hills with the first
twinkling valley lights. Warm low lamps, intimate, discreet, quietly powerful.
```

**Leg 5 (8 s) — start-image: last frame of leg 4 · `gen/leg_5.txt`**
```
Single continuous cinematic camera move, no cuts. **Continue the same slow, steady forward glide.**
The camera enters an intimate smoked-oak lounge and pushes in close toward the walnut coffee table
with its closed leather portfolio and fountain pen until they nearly fill the frame, then eases
gently back out and turns smoothly toward the glass view wall, where a tall glass door slides open
onto a terrace.
**In the final second, settle back into a slow, steady forward glide through the open glass door
toward the twilight terrace and the valley lights beyond.**
[LEG TAIL]
```

**Safe variant:** replace "leather lounge chairs" with "low upholstered lounge chairs"; drop the push-in and use a plain forward glide past the seating toward the glass door.

---

## Scene 6 — Let's Connect Terrace (Lead Capture & Compliance) · `id: terrace`

> **Composition rule:** keep the **center-left 40% calm** (sky and horizon) because the lead form sits there on desktop. On mobile, keep the **lower 55%** calm.

**Still — `gen/still_6.txt`**
```
[STYLE PREAMBLE]
[NEGATIVE TAIL]
Subject: A wide limestone terrace at twilight on the crest of the estate: a low linear fire table
with a calm flame, a pair of lounge chairs, potted olive trees, a frameless glass balustrade, and a
string of warm bistro lights overhead. Beyond the glass, a sweeping panorama of the Tri-Valley floor
with glittering town lights, dark rolling hills, and the ridgeline of Mount Diablo against a deep
twilight blue sky fading to a thin amber band on the horizon. Large calm sky occupying the upper
and left portion of the frame. Peaceful, open, inviting.
```

**Leg 6 (8 s) — start-image: last frame of leg 5 · `gen/leg_6.txt`**
```
Single continuous cinematic camera move, no cuts. **Continue the same slow, steady forward glide.**
The camera emerges onto a twilight limestone terrace, passes the glowing fire table and potted olive
trees, then rises gently as it reaches the glass balustrade, revealing the full panorama of glittering
valley lights, dark hills and the Mount Diablo ridgeline under a deep twilight sky.
**In the final second, settle into an almost still, very slow forward drift toward the horizon,
the sky calm and wide.**
[LEG TAIL]
```

*(Leg 6 ends the film, so its handoff clause settles to near-stillness and gives a clean resting frame behind the form.)*

**Safe variant:** remove "rises gently"; keep the glide level.

---

## Mobile chain (native 9:16) — pipeline §6b

**Portrait stills.** Prepend this clause to each still prompt and render natively in portrait (`--aspect_ratio 9:16` if the image model offers it; otherwise `2:3` and extend top and bottom to 1080×1920 with an outpaint that continues sky and floor, **not** a flat color pad, because these are full-bleed photoreal scenes):
```
Vertical portrait composition: the focal subject centered at about 45% height, generous sky or
ceiling above and floor below, nothing essential near the left or right edges.
```
Per-scene portrait focus:

| Scene | Portrait focal subject |
|---|---|
| 1 | The lens with the estate inside it; meadow foreground, sky above |
| 2 | The lone ball at center court with the hoop above it |
| 3 | The glass partition seam, bare on top and staged on the bottom, by moving the camera slightly higher |
| 4 | The **center** frame only; side frames are partially visible at the edges |
| 5 | Coffee table + portfolio, with the view wall above |
| 6 | Horizon at ~35% height; the lower 55% calm terrace floor for the form |

**Portrait legs.** Use the same leg prompts with this clause up front, `--aspect_ratio 9:16` (or Monid `ratio:"9:16"`), same model and params:
```
Vertical portrait framing throughout, the focal subject kept centered.
```
Chain the portrait legs against their **own** portrait last frames. Never mix a portrait leg into the desktop chain. The mobile chain must be complete (6 portrait legs).

**Encode:** 720 px wide, `-g 4`, crf 23, no audio, `+faststart`, output `*-m.mp4`. Posters: each portrait leg's first frame → `assets/still/<id>-m.webp`.

---

## Command reference (adapt to the CLI versions you verify in T1)

Stills (Higgsfield):
```sh
for i in 1 2 3 4 5 6; do
  higgsfield generate create gpt_image_2 --prompt "$(cat gen/still_$i.txt)" \
    --aspect_ratio 3:2 --resolution 2k --quality high --wait --wait-timeout 15m --json \
    > gen/out/still_$i.json 2> gen/out/still_$i.err &
done; wait
# result URL: jq -r '.[0].result_url' gen/out/still_$i.json  → curl -o gen/out/still_$i.png
```

16:9 start canvas for leg 1 (full-bleed photoreal: cover-crop, don't letterbox):
```sh
ffmpeg -i gen/out/still_1.png -vf "scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080" gen/out/canvas_1.png
```

Last-frame extraction between legs:
```sh
ffmpeg -y -sseof -0.05 -i gen/out/leg_$N.mp4 -frames:v 1 -q:v 1 gen/out/last_$N.png
```

Legs: use the skill's `pipeline.md` "Monid backend" functions (images go by **public URL** through Monid's `sfs` file store, `first_frame` role only, `ratio` set explicitly, `generate_audio:false`, `resolution` 480p for previz and 1080p for final). Use the Higgsfield `gen_dive` path only as the fallback biller. Read `cost.value` on every Monid run and keep a running total against the approved budget.

Desktop encode (skill Step 6):
```sh
ffmpeg -i leg_N.mp4 -an -c:v libx264 -preset veryfast -crf 20 -g 8 -pix_fmt yuv420p -movflags +faststart site/assets/vid/<id>.mp4
```
*(The skill specifies crf ~20 and `-g 8` for desktop. `veryfast` keeps turnaround short; switch to `-preset slow` only for the final master if file size is over budget.)*

---

## Image QA checklist (per still, before any leg is rendered)

- [ ] Reads as the **same estate** as the other five (materials, palette, lens feel)
- [ ] Time of day matches the light-arc table
- [ ] No text, numbers, logos, team insignia, or readable signage anywhere (zoom to 200%)
- [ ] No people or figures, including reflections
- [ ] Scene 4 frames are blank
- [ ] Scene 6 leaves calm space for the form (desktop center-left / mobile lower half)
- [ ] Nothing resembles a specific real, identifiable property or landmark beyond the generic Mt. Diablo silhouette
