# Frontend Architecture

Static Telegram WebApp without a bundler. The project keeps legacy entry files
(`app.js`, `admin.js`) for compatibility, while scalable code is organized here.

## Layers

- `app/` - bootstrap and app-wide wiring.
- `features/` - business-facing features, for example template/CMS rendering.
- `shared/api/` - reusable HTTP client and API helpers.
- `shared/config/` - template defaults and editable schemas.
- `shared/lib/` - DOM, parsing and framework-free utilities.
- `shared/motion/` - centralized durations, easing, variants and GPU-friendly motion CSS.
- `shared/styles/radius-theme.css` - radius tokens, two-color theme variables and rounded UI audit layer.
- `shared/ui/` - reusable UI behavior such as toast and loading state helpers.
- `shared/styles/` - design tokens and common UI system.

## Admin-Editable Template

The admin settings screen stores CMS-like JSON in the backend `settings` table:

- `seo` - page title, description, preview image.
- `navigation` - bottom menu items with label, icon, order and visibility.
- `page_sections` - editable independent page blocks.
- `footer` - footer text and link schema for future layouts.
- `theme` - only `background` and `accent` colors.

`TemplateEngine.apply()` merges backend config with `TemplateDefaults`, applies
SEO/theme/navigation, and controls page block titles/order/visibility.
