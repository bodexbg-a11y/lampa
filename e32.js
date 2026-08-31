(function () {
    'use strict';

    var source = 'https://raw.githubusercontent.com/bodexbg-a11y/lampa/main/erotic-catalog-v31.js?v=3.2.0';

    if (window.plugin_erotic_catalog_v32_ready) return;

    if (window.Lampa && Lampa.Utils && Lampa.Utils.putScriptAsync) {
        Lampa.Utils.putScriptAsync([source], function () {});
    } else {
        var script = document.createElement('script');
        script.src = source;
        document.head.appendChild(script);
    }
}());
