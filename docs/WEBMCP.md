# WebMCP console

Tools & Extensions includes a WebMCP console backed by the installed MagAgent. It can:

- report Playwright/browser readiness and exact HTTPS origin policy;
- add or remove reviewed origins;
- open an allowed page and display its live tools, schemas, and annotations;
- invoke a tool against the displayed registry revision;
- confirm a potentially mutating direct call and render its structured result.

Install the MagAgent browser extra and Chromium before using the console:

```bash
python -m pip install "mag-agent[browser]"
playwright install chromium
magent webmcp status
```

The desktop app does not access cookies, IndexedDB, or credentials. MagAgent owns origin-isolated
browser profiles and validates the final URL after redirects. A registry change rejects the call
as stale. Chat and graph agents use their normal OAP and AAIS permission path; the console's direct
call requires a visible one-off confirmation when the site's live annotation is not read-only.
