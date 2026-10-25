# Pocket Forge mark

Updated 24 October 2026 after the user requested a name-based logo to replace the unclear anvil.

The pocket silhouette represents a portable skill; the flame cut into it represents making and refining that skill. The monochrome mark fits the current Apple-inspired interface. It is authored directly as SVG and remains crisp at header and favicon sizes.

## Assets

- `apps/web/public/pocket-forge.svg`: charcoal app tile with a white pocket and negative-space flame. Used in the header and favicon.
- `apps/web/public/pocket-forge-symbol.svg`: standalone dark pocket; transparent background and flame opening.
- `apps/web/public/pocket-forge-lockup.svg`: icon and Pocket Forge wordmark. Lettering uses the platform system font rather than embedded font outlines.
- `docs/design/pocket-forge-logo-preview.jpg`: browser-rendered preview, not the editable source.

The old anvil path was removed from Glyph.tsx. The icon is a separate brand asset, not a generic UI glyph. The visible adjacent brand name provides its accessible label; the header image is decorative to avoid repeating that name.
