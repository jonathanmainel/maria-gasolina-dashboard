# Prototype Instructions

Run the local server yourself and open the preview in the browser available to this environment. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

Build app UI in `src/`. Keep `.openai/hosting.json`, `worker/index.js`, `scripts/prepare-sites-build.mjs`, and `tests/sites-worker.test.mjs` intact so the same local prototype can be handed to Sites. Before a Sites handoff, run `npm run build` and `npm run test:sites`; the build must leave `dist/client/index.html`, `dist/server/index.js`, and `dist/.openai/hosting.json`.

## Durable visual direction

- Use the approved refined Concept B as the dashboard source of truth: no sidebar, one broad white application surface, compact top navigation tabs and a dominant performance chart.
- Use Maria Gasolina branding as a restrained white-label layer: Montserrat, navy `#324552`, red `#9D2A1E`, gold `#D7982B`, and the official vector logo.
- Avoid vintage textures, photography, Bebas Neue and decorative marketing treatments inside the private dashboard.
- Keep the overview focused on four KPIs, evolution by channel, the channel strip, actual investment distribution, cost efficiency and result volume. Never present actual distribution as pacing against an agreed budget unless a reliable budget source exists.
- In channel views, replace cross-channel distribution and efficiency cards with channel performance and sortable detail tables. Google Ads includes campaigns, ad groups, keywords and Performance Max asset groups/assets; Meta Ads includes campaigns, ad sets and ads; Google Analytics includes acquisition and events.
- Keep ad-platform results separate from GA4 `form_submit` because their attribution models differ.
- Keep comparison with the previous period inside the period picker, not as a separate header control.
- Keep the campaign-purpose selector beside the period control with exactly three choices: all data, franchise and condominiums. Match campaign names case-insensitively and accent-insensitively; never imply that this selector filters GA4 or campaign-less daily series.
- Use the locally bundled official multicolor Google Ads product icon, sourced from Google's own static asset domain, instead of a monochrome approximation.
- Google Analytics is available in this version. Do not expose CRM, public sharing or PDF export until those features are genuinely available.
