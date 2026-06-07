# Design Notes

Mag Command Center uses neubrutalism as a reference point, adapted for a desktop productivity surface.

Reference: <https://designmd.app/library/neubrutalism>

## What The Reference Emphasizes

- Thick structural borders that clearly define every component.
- Hard offset shadows instead of blurred or gradient depth.
- Saturated flat colors, especially yellow, red, blue, black, and white.
- Bold typography where labels and headings carry visual weight.
- Layered, paper-cutout composition.
- Full light and dark mode support.

## Mag Command Center Adaptation

This app should feel bold and immediately recognizable, but not noisy enough to make long coding or memory-management sessions tiring.

Rules:

- Use 3px borders on major controls and panels.
- Use hard shadows like `4px 4px 0` or `6px 6px 0`.
- Avoid gradients, blur shadows, glass effects, and low-contrast decorative surfaces.
- Use saturated accent colors for action areas, not every surface.
- Keep data-heavy panels white/off-black with strong borders for readability.
- Preserve visible focus outlines in both light and dark modes.
- Keep text sizes practical for dense desktop workflows.

## Light Mode

- Background: warm off-white.
- Text: near-black.
- Borders/shadows: black.
- Primary accents: yellow, blue, red, green.
- Panels: white or warm white.

## Dark Mode

- Background: near-black.
- Text: warm white.
- Borders: warm white where needed for contrast.
- Shadows: black.
- Panels: dark gray, not pure black.
- Accent colors remain saturated but slightly softened for readability.

## Component Guidance

- Navigation buttons use icon + text, heavy border, and hard shadow.
- Primary action buttons use red or blue accents with white text.
- Status cards use a small saturated icon tile plus compact content.
- Inputs and textareas must keep high contrast and strong visible focus states.
- JSON/code panels use bordered `pre` blocks with wrapping and scroll containment.

## Accessibility Notes

- Do not rely on color alone; status text must say `Ready`, `Needs attention`, `OK`, or `Review`.
- Maintain visible focus states.
- Keep dark mode contrast high across text, borders, and controls.
- Avoid tiny buttons; primary controls should be at least 40px tall.
