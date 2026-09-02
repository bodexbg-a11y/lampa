(function () {
    'use strict';

    var script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/gh/bodexbg-a11y/lampa/adult-core.js?update=' + Date.now();
    script.async = false;
    script.onerror = function () {
        if (window.Lampa && Lampa.Noty && Lampa.Noty.show) {
            Lampa.Noty.show('Не удалось обновить плагин «Полное 18+»');
        }
    };
    (document.head || document.documentElement).appendChild(script);
}());
