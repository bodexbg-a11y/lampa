(function () {
    'use strict';

    var url = 'https://raw.githack.com/bodexbg-a11y/lampa/main/erotic-catalog-v31.js?v=3.1.0';

    if (window.plugin_erotic_catalog_v31_ready) return;

    if (window.Lampa && Lampa.Utils && Lampa.Utils.putScriptAsync) {
        Lampa.Utils.putScriptAsync([url], function () {});
    } else {
        var script = document.createElement('script');
        script.src = url;
        document.head.appendChild(script);
    }
}());
