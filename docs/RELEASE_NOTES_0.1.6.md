# Mag Command Center 0.1.6 Release Notes

Mag Command Center `0.1.6` aligns the desktop setup and documentation surfaces with MagAgent `0.32.14`.

## Highlights

- Raised the recommended MagAgent version to `0.32.14+`.
- Updated in-app documentation to call out provider key aliases and current cloud-model defaults from MagAgent `0.32.14`.
- Refreshed distribution guidance so first-run and upgrade flows point users at the provider compatibility patch release.

## Compatibility

- MagAgent `0.32.14+` is recommended for provider credential aliases, current Anthropic/Gemini defaults, and newer OpenAI/Anthropic request-parameter compatibility.
- The desktop app still shells out to `magent`; custom MagAgent installs can be selected by launching with `MAGENT_BIN=/path/to/magent`.

## Known Notes

- 0.1.6 artifacts are still unsigned.
