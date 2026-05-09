# Motion System

This folder owns the app motion language for the static Telegram WebApp.

- `durations.js` - shared timing tokens.
- `easing.js` - shared easing curves.
- `presets.js` - reusable interaction presets.
- `variants.js` - semantic motion variant names.
- `transitions.js` - tiny runtime helpers for close animations and dynamic lists.
- `motion-system.css` - the actual GPU-friendly CSS motion layer.

The CSS file is loaded after legacy styles and intentionally overrides older
ad-hoc animations with a single system. Motion uses `transform` and `opacity`
where possible, keeps loading effects light, and respects
`prefers-reduced-motion`.
