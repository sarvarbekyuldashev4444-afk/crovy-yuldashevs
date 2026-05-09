(function () {
    const defaultSections = [
        {
            id: "catalog",
            type: "catalog",
            enabled: true,
            title: "Mahsulotlar",
            order: 20
        },
        {
            id: "promo",
            type: "banner-carousel",
            enabled: true,
            title: "Aksiyalar",
            order: 10
        }
    ];

    window.TemplateDefaults = {
        seo: {
            title: "Crovy",
            description: "Telegram ichida premium qulupnay shokoladda buyurtma qilish.",
            image: ""
        },
        navigation: [
            { tab: "home", label: "Asosiy", icon: "fi-rr-home", enabled: true, order: 10 },
            { tab: "cart", label: "Savat", icon: "fi-rr-shopping-cart", enabled: true, order: 20 },
            { tab: "offices", label: "Filiallar", icon: "fi-rr-marker", enabled: true, order: 30 },
            { tab: "profile", label: "Profil", icon: "fi-rr-user", enabled: true, order: 40 }
        ],
        footer: {
            text: "Crovy",
            links: []
        },
        theme: {
            background: "#ffffff",
            accent: "#c3c7cf"
        },
        page_sections: defaultSections
    };
})();
