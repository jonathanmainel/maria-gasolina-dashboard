# Prototype Instructions

Run the local server yourself and open the preview in the browser available to this environment. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

Build app UI in `src/`. Keep `.openai/hosting.json`, `worker/index.js`, `scripts/prepare-sites-build.mjs`, and `tests/sites-worker.test.mjs` intact so the same local prototype can be handed to Sites. Before a Sites handoff, run `npm run build` and `npm run test:sites`; the build must leave `dist/client/index.html`, `dist/server/index.js`, and `dist/.openai/hosting.json`.

## Durable visual direction

- Keep the information architecture, density, compact header, slim icon rail, cards and long-form section flow close to Reportei.
- Use Maria Gasolina branding as a restrained white-label layer: Montserrat, navy `#324552`, red `#9D2A1E`, gold `#D7982B`, and the official vector logo.
- Avoid vintage textures, photography, Bebas Neue and decorative marketing treatments inside the private dashboard.
- Do not expose GA4, CRM, public sharing or PDF export until those features are genuinely available.
