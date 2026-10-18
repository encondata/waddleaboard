# Prototype Instructions

Run the local server yourself and open the preview in the browser available to this environment. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

## Waddle Aboard design decisions

- Build this as a polished, responsive public website, not a phone-frame prototype.
- Preserve the selected warm postcard/scrapbook direction: ivory paper, deep navy type, cobalt actions, coral, marigold, and mint accents.
- Keep the experience playful and travel-oriented without becoming childish or looking like a generic SaaS dashboard.
- Use Fredoka for display type and Nunito for body copy.
- The current release is static and demonstrative: authentication, database persistence, production QR provisioning, and moderation services come later.
- The selected public brand and domain are **Waddle Aboard** and `WaddleAboard.com`; DuckPort was the earlier working name.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

Build app UI in `src/`. Keep `.openai/hosting.json`, `worker/index.js`, `scripts/prepare-sites-build.mjs`, and `tests/sites-worker.test.mjs` intact so the same local prototype can be handed to Sites. Before a Sites handoff, run `npm run build` and `npm run test:sites`; the build must leave `dist/client/index.html`, `dist/server/index.js`, and `dist/.openai/hosting.json`.
