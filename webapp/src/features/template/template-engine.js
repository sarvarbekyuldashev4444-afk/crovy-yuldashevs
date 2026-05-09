(function () {
    const defaults = window.TemplateDefaults || {};
    const { safeJson, mergeConfig, qsa } = window.AppDom || {};

    function parseConfig(raw) {
        const cfg = { ...(raw || {}) };
        cfg.seo = safeJson?.(cfg.seo, cfg.seo) || defaults.seo;
        cfg.navigation = safeJson?.(cfg.navigation, cfg.navigation) || defaults.navigation;
        cfg.footer = safeJson?.(cfg.footer, cfg.footer) || defaults.footer;
        cfg.page_sections = safeJson?.(cfg.page_sections, cfg.page_sections) || defaults.page_sections;
        cfg.market_settings = safeJson?.(cfg.market_settings, cfg.market_settings) || {};
        cfg.home_settings = safeJson?.(cfg.home_settings, cfg.home_settings) || {};
        cfg.product_card_settings = safeJson?.(cfg.product_card_settings, cfg.product_card_settings) || {};
        cfg.system_messages = safeJson?.(cfg.system_messages, cfg.system_messages) || {};
        cfg.theme = mergeConfig?.(defaults.theme, cfg.theme || {}) || (cfg.theme || {});
        return mergeConfig?.(defaults, cfg) || cfg;
    }

    function applySeo(config) {
        const seo = config.seo || {};
        const title = seo.title || config.store_name || "Crovy";
        document.title = title;
        upsertMeta("description", seo.description || config.store_welcome || "");
        upsertMeta("og:title", title, true);
        upsertMeta("og:description", seo.description || "", true);
        if (seo.image) upsertMeta("og:image", seo.image, true);
    }

    function upsertMeta(name, content, property = false) {
        if (!content) return;
        const attr = property ? "property" : "name";
        let el = document.querySelector(`meta[${attr}="${name}"]`);
        if (!el) {
            el = document.createElement("meta");
            el.setAttribute(attr, name);
            document.head.appendChild(el);
        }
        el.setAttribute("content", content);
    }

    function applyTheme(config) {
        document.body.dataset.density = config.theme?.density || "comfortable";
        if (window.ColorTheme) window.ColorTheme.apply(config.theme || {});
    }

    function applyNavigation(config) {
        const navigation = Array.isArray(config.navigation) ? config.navigation : defaults.navigation;
        const ordered = [...navigation].sort((a, b) => (a.order || 0) - (b.order || 0));
        ordered.forEach(item => {
            const node = document.querySelector(`.nav-item[data-tab="${item.tab}"]`);
            if (!node) return;
            node.style.order = item.order || 0;
            node.classList.toggle("nav-config-hidden", item.enabled === false);
            const icon = node.querySelector("i");
            const label = node.querySelector("span:not(.cart-badge)");
            if (icon && item.icon) icon.className = `fi ${item.icon}`;
            if (label && item.label) label.textContent = item.label;
        });
    }

    function applySections(config) {
        const sections = Array.isArray(config.page_sections) ? config.page_sections : defaults.page_sections;
        const sectionMap = new Map(sections.map(section => [section.type || section.id, section]));
        const catalog = sectionMap.get("catalog");
        const promo = sectionMap.get("banner-carousel");
        const title = document.querySelector("#page-home .section-title");
        if (title && catalog?.title) title.textContent = catalog.title;
        const promoEl = document.getElementById("promoCarousel");
        if (promoEl && promo?.enabled === false) promoEl.dataset.templateHidden = "true";
        qsa?.("#page-home .promo-carousel, #page-home .category-tabs, #page-home .section-header, #catalog").forEach((node) => {
            let type = "catalog";
            if (node.id === "promoCarousel") type = "banner-carousel";
            else if (node.id === "categoryTabs") type = "categories";
            else if (node.classList.contains("section-header")) type = "catalog-title";
            const cfg = sectionMap.get(type);
            if (cfg?.order !== undefined) node.style.order = cfg.order;
            if (cfg?.enabled === false) node.style.display = "none";
        });
    }

    function apply(config) {
        const parsed = parseConfig(config);
        window.CurrentTemplateConfig = parsed;
        applySeo(parsed);
        applyTheme(parsed);
        applyNavigation(parsed);
        applySections(parsed);
        return parsed;
    }

    window.TemplateEngine = { parseConfig, apply };
})();
