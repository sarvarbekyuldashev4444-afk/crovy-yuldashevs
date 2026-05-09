(function () {
    const colorRe = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
    const defaults = {
        background: "#ffffff",
        accent: "#c3c7cf"
    };

    function normalizeHex(value, fallback) {
        const raw = String(value || "").trim();
        if (!colorRe.test(raw)) return fallback;
        if (raw.length === 4) {
            return "#" + raw.slice(1).split("").map(ch => ch + ch).join("");
        }
        return raw.toLowerCase();
    }

    function hexToRgb(hex) {
        const value = normalizeHex(hex, "#000000").slice(1);
        return {
            r: parseInt(value.slice(0, 2), 16),
            g: parseInt(value.slice(2, 4), 16),
            b: parseInt(value.slice(4, 6), 16)
        };
    }

    function rgbToHex({ r, g, b }) {
        return "#" + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
    }

    function mix(a, b, amount) {
        const x = hexToRgb(a);
        const y = hexToRgb(b);
        return rgbToHex({
            r: x.r * (1 - amount) + y.r * amount,
            g: x.g * (1 - amount) + y.g * amount,
            b: x.b * (1 - amount) + y.b * amount
        });
    }

    function luminance(hex) {
        const { r, g, b } = hexToRgb(hex);
        const values = [r, g, b].map(v => {
            const c = v / 255;
            return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
        });
        return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722;
    }

    function readableText(background) {
        return luminance(background) > 0.58 ? "#161816" : "#f8faf7";
    }

    function currentConfig() {
        const cfg = window.CurrentTemplateConfig?.theme || window.APP_CONFIG?.theme || {};
        return {
            background: normalizeHex(cfg.background, defaults.background),
            accent: normalizeHex(cfg.accent, defaults.accent)
        };
    }

    function setVar(name, value) {
        document.documentElement.style.setProperty(name, value);
    }

    function apply(config = currentConfig()) {
        const background = normalizeHex(config.background, defaults.background);
        const accent = normalizeHex(config.accent, defaults.accent);
        const text = readableText(background);
        const surface = mix(background, text === "#161816" ? "#ffffff" : "#000000", text === "#161816" ? 0.74 : 0.18);
        const surface2 = mix(background, text === "#161816" ? "#ffffff" : "#000000", text === "#161816" ? 0.52 : 0.28);
        const border = mix(background, accent, 0.24);
        const muted = mix(text, background, 0.42);
        const accentHover = mix(accent, text === "#161816" ? "#000000" : "#ffffff", 0.14);

        setVar("--color-background", background);
        setVar("--color-accent", accent);
        setVar("--color-accent-10", accent + "1a");
        setVar("--color-accent-20", accent + "33");
        setVar("--color-surface", surface);
        setVar("--color-surface-2", surface2);
        setVar("--color-border", border);
        setVar("--color-text", text);
        setVar("--color-muted", muted);
        setVar("--color-button-text", readableText(accent));

        setVar("--bg", "var(--color-background)");
        setVar("--accent", "var(--color-accent)");
        setVar("--accent-hover", accentHover);
        setVar("--accent-soft", "var(--color-accent-10)");
        setVar("--accent-light", "var(--color-accent-10)");
        setVar("--surface", "var(--color-surface)");
        setVar("--surface-2", "var(--color-surface-2)");
        setVar("--surface-3", "var(--color-surface-2)");
        setVar("--card-bg", "var(--color-surface)");
        setVar("--divider", "var(--color-border)");
        setVar("--border", "var(--color-border)");
        setVar("--text-primary", "var(--color-text)");
        setVar("--text-secondary", "var(--color-muted)");
        setVar("--text-muted", "var(--color-muted)");
        setVar("--button-bg", "var(--color-accent)");
        setVar("--button-text", "var(--color-button-text)");
        setVar("--floating-menu-bg", "var(--color-surface)");
        setVar("--header-bg", "var(--color-background)");
        setVar("--input-bg", "var(--color-surface)");
        setVar("--placeholder-bg", "var(--color-surface-2)");
        setVar("--success", "var(--color-accent)");
        setVar("--warning", "var(--color-accent)");
        setVar("--danger", "var(--color-accent)");
        setVar("--error", "var(--color-accent)");
        setVar("--focus-ring", "0 0 0 4px var(--color-accent-20)");
    }

    function syncStoreName(name, subtitle) {
        const title = document.getElementById("marketTitle");
        const sub = document.getElementById("marketSubtitle");
        if (title && name) title.textContent = name;
        if (sub && subtitle) sub.textContent = subtitle;
    }

    window.ColorTheme = { apply, defaults, normalizeHex, syncStoreName };

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", () => apply(), { once: true });
    } else {
        apply();
    }
})();
