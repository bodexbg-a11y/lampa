(function () {
    'use strict';

    function load(url, fallback) {
        var script = document.createElement('script');
        script.src = url + (url.indexOf('?') >= 0 ? '&' : '?') + 'update=' + Date.now();
        script.async = false;
        script.onerror = function () {
            if (fallback) return load(fallback, '');
            if (window.Lampa && Lampa.Noty && Lampa.Noty.show) {
                Lampa.Noty.show('Не удалось загрузить плагин «Полное 18+»');
            }
        };
        (document.head || document.documentElement).appendChild(script);
    }

    load(
        'https://lampa-kakm.onrender.com/plugin.js?v=1.7.0',
        'https://cdn.jsdelivr.net/gh/bodexbg-a11y/lampa@main/adult-core.js?v=1.7.0'
    );
}());
