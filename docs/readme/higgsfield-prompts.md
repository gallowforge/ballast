# Ledger: image prompts for Higgsfield

Nothing here has been generated and no credits have been spent. The README, the landing page and the app are finished without these images; each one below would replace or enrich a part that already works. HQ batches them into one priced plan for Ali.

## The idea every image serves

**A calm runway: your money laid out as a road that ends on a date.** A straight road crosses ruled ledger paper toward a low horizon; a brass sun sits on that horizon; a small brass flag stands at the roadside where the date is. Calm, kind, honest. Never a city, a car, a person, a coin, or a chart.

## Style lock (shared by every prompt)

- **Medium:** a fine risograph or letterpress print on warm uncoated paper. Flat areas of ink with a faint print grain and slight misregistration. Not 3D, not glossy, not photoreal.
- **Palette, 60/30/10:** paper `#F2ECDF` as the field, ink green `#1D3A2E` for the road and the rules, brass `#B8892F` used once (the sun and the flag only). No other hues.
- **Line:** thin, even ruled lines like ledger paper, slightly irregular as printed lines are.
- **Light:** low, soft, late afternoon; no glow, no lens flare, no rays.
- **Composition grammar:** one vanishing point, low horizon (lower third), generous empty paper, the road centred or a little left of centre, the flag right of the road.
- **Type:** none in the image. Every word is set by the page.

## Model

**Seedream 5.0 Pro** for all three, following Ali's standing choice for images. It holds flat print textures and a strict limited palette better than models that drift toward glossy 3D, and it follows geometric composition (one vanishing point, ruled lines) closely. Ask for 2 variants of each and pick one; confirm the pick with Ali before spending on any upscale.

---

## 1. Hero illustration: "The calm road"

Where it goes: behind the landing page headline on wide screens, and as the base layer of the README hero and the social card (the real road chart and phone stay on top, so the numbers remain real).

| Slot        | Prompt text                                                                                                                                                                                                         |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Subject     | A single straight two-lane road with a thin dashed centre line, receding to a low horizon across an endless field ruled with fine horizontal ledger lines.                                                          |
| Composition | Wide landscape, horizon at one third from the top, single vanishing point slightly left of centre. The road is wide at the bottom edge and narrows to a point on the horizon. Large calm empty sky of plain paper. |
| Detail      | A small brass sun resting on the horizon exactly at the vanishing point. A small triangular brass pennant on a thin pole at the right roadside, about two thirds of the way to the horizon.                        |
| Style       | Two-colour risograph print on warm uncoated paper: ink green road with a soft vertical gradient from dense at the bottom to pale near the horizon, ink green hairline rules, brass sun and pennant.               |
| Texture     | Fine print grain, faint paper fibres, very slight misregistration of the brass layer.                                                                                                                               |
| Mood        | Quiet, unhurried, reassuring; the feeling of a long road you can see the end of.                                                                                                                                    |
| Aspect      | 21:9, at least 3000 px wide.                                                                                                                                                                                        |
| Negatives   | no text, no numbers, no cars, no people, no buildings, no trees, no mountains, no clouds, no glow, no lens flare, no 3D render, no glossy gradients, no vignette, no extra colours, no coins, no charts.          |

References to show the model: the README hero (`docs/readme/hero.webp`) for layout and colours; a Stripe Press cover and a Monocle illustrated cover for the print quality.

## 2. Paper surface for staging screens

Where it goes: a tiling background under the README crops and the phone, so they sit on a real-feeling sheet instead of flat colour.

| Slot        | Prompt text                                                                                                                           |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Subject     | A sheet of warm cream accounting ledger paper seen flat from directly above, with very faint pale green horizontal rules.             |
| Composition | Edge to edge, perfectly even lighting, no objects, seamless tileable texture.                                                         |
| Style       | High-resolution scan of uncoated cotton paper, fine fibres and the slightest tooth.                                                   |
| Palette     | Paper `#F2ECDF`, rules `#1D3A2E` at about 8% strength, nothing else.                                                                  |
| Aspect      | 1:1, 2048 px, tileable.                                                                                                               |
| Negatives   | no shadows, no folds, no stains, no coffee rings, no vignette, no visible edges, no text, no margin line, no colour shift, no grain clumps. |

## 3. A refined mark

Where it goes: the app icon, favicon and the logo beside the wordmark. The current mark (a road meeting the horizon under a brass sun on ink green, `public/favicon.svg`) stays until a better one is picked, and any pick is redrawn as a clean SVG by hand before use, so the shipped icon is never a raster from a model.

| Slot        | Prompt text                                                                                                                                                                       |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Subject     | An app icon: a road drawn as two straight converging lines with a short dashed centre line, meeting a horizon line, with a small round brass sun sitting on the horizon above it. |
| Composition | Centred, symmetrical, the horizon at about 40% from the top, generous padding, readable at 16 px.                                                                                  |
| Style       | Flat geometric vector mark, uniform stroke weight, crisp edges, no gradients.                                                                                                     |
| Palette     | Ink green `#1D3A2E` square with softly rounded corners, paper `#F2ECDF` lines, brass `#B8892F` sun.                                                                                |
| Aspect      | 1:1, 1024 px.                                                                                                                                                                     |
| Negatives   | no text, no letters, no dollar or coin symbols, no 3D, no bevel, no shadow, no glow, no gradient, no extra elements, no perspective tilt of the icon itself.                      |

## What changes in the repo if they are approved

1. The hero illustration becomes a WebP under `public/` (served from the site itself, so the Content Security Policy is unchanged), placed behind the landing headline with the real road chart still drawn on top.
2. The paper texture becomes a small tiling WebP used by `scripts/readme-visuals.mjs` as the canvas background.
3. A picked mark is traced into `public/favicon.svg` and the icon set is rebuilt with `npm run icons`.
