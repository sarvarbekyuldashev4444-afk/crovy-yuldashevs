(function () {
    const qs = (selector, root = document) => root.querySelector(selector);
    const qsa = (selector, root = document) => Array.from(root.querySelectorAll(selector));
    const byId = id => document.getElementById(id);

    function safeJson(value, fallback) {
        if (value === undefined || value === null || value === "") return fallback;
        if (typeof value !== "string") return value;
        try {
            return JSON.parse(value);
        } catch (e) {
            return fallback;
        }
    }

    function escapeHtml(value) {
        return String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    }

    function escapeAttr(value) {
        return escapeHtml(value).replace(/'/g, "&#39;");
    }

    function fmtMoney(value) {
        return Number(value || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
    }

    function fmtShort(value) {
        const n = Number(value) || 0;
        if (n >= 1000000) return (n / 1000000).toFixed(n % 1000000 === 0 ? 0 : 1) + "M";
        if (n >= 1000) return (n / 1000).toFixed(n % 1000 === 0 ? 0 : 1) + "k";
        return fmtMoney(n);
    }

    function debounce(fn, delay = 250) {
        let timer;
        return (...args) => {
            clearTimeout(timer);
            timer = setTimeout(() => fn(...args), delay);
        };
    }

    function haptic(type, value) {
        try {
            window.Telegram?.WebApp?.HapticFeedback?.[type]?.(value);
        } catch (e) {}
    }

    function mergeConfig(defaults, incoming) {
        const output = { ...(defaults || {}) };
        Object.entries(incoming || {}).forEach(([key, value]) => {
            if (Array.isArray(value)) output[key] = value;
            else if (value && typeof value === "object" && !Array.isArray(value)) {
                output[key] = mergeConfig(output[key] || {}, value);
            } else if (value !== undefined && value !== null && value !== "") {
                output[key] = value;
            }
        });
        return output;
    }

    window.AppDom = {
        qs,
        qsa,
        byId,
        safeJson,
        mergeConfig,
        escapeHtml,
        escapeAttr,
        fmtMoney,
        fmtShort,
        debounce,
        haptic,
    };
})();
