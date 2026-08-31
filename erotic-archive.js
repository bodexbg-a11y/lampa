(function () {
    'use strict';

    var COMPONENT_ID = 'erotic_catalog_component';
    var EROTIC_KEYWORD_ID = 2916;

    if (window.plugin_erotic_catalog_ready) return;
    window.plugin_erotic_catalog_ready = true;

    function notify(message) {
        if (Lampa.Noty && Lampa.Noty.show) Lampa.Noty.show(message);
        else if (Lampa.Bell && Lampa.Bell.push) Lampa.Bell.push({ text: message });
    }

    function apiUrl(object) {
        var page = object.page || 1;
        var language = (Lampa.Storage && Lampa.Storage.get('language', 'ru')) || 'ru';
        var path;

        if (object.search_query) {
            path = 'search/movie?api_key=' + Lampa.TMDB.key() +
                '&query=' + encodeURIComponent(object.search_query) +
                '&include_adult=true&page=' + page +
                '&language=' + encodeURIComponent(language);
        } else {
            path = 'discover/movie?api_key=' + Lampa.TMDB.key() +
                '&with_keywords=' + EROTIC_KEYWORD_ID +
                '&include_adult=true&sort_by=popularity.desc&page=' + page +
                '&language=' + encodeURIComponent(language);
        }

        return Lampa.TMDB.api(path);
    }

    function prepareMovie(movie) {
        movie.source = 'tmdb';
        movie.media_type = 'movie';
        movie.method = 'movie';
        movie.title = movie.title || movie.original_title || movie.name;
        movie.name = movie.title;
        return movie;
    }

    function openMovie(movie) {
        prepareMovie(movie);
        Lampa.Activity.push({
            url: 'movie/' + movie.id,
            title: movie.title,
            component: 'full',
            id: movie.id,
            method: 'movie',
            card: movie,
            source: 'tmdb'
        });
    }

    function Catalog(object) {
        var network = new Lampa.Reguest();
        var comp = new Lampa.InteractionCategory(object);

        for (var key in comp) {
            this[key] = typeof comp[key] === 'function' ? comp[key].bind(comp) : comp[key];
        }

        this.create = function () { return comp.render(); };

        this.initialize = function () {
            comp.loading(true);
            network.timeout(20000);
            network.silent(apiUrl(object), function (response) {
                comp.loading(false);
                var data;
                try {
                    data = typeof response === 'string' ? JSON.parse(response) : response;
                } catch (error) {
                    return comp.empty('TMDB вернул некорректный ответ');
                }

                data = data || {};
                data.results = (data.results || []).map(prepareMovie);
                if (!data.results.length) return comp.empty('Ничего не найдено');

                if (Lampa.Utils && Lampa.Utils.addSource) data = Lampa.Utils.addSource(data, 'tmdb');
                comp.build(data);
                comp.render().find('.category-full').addClass('mapping--grid');
            }, function () {
                comp.loading(false);
                comp.empty('Не удалось загрузить каталог TMDB');
            });
        };

        comp.cardRender = function (object, movie, card) {
            card.onEnter = function () { openMovie(movie); };
        };

        this.destroy = function () {
            network.clear();
            if (comp.destroy) comp.destroy();
        };
    }

    function openCatalog(search) {
        Lampa.Activity.push({
            url: '',
            title: search ? 'Поиск: ' + search : 'Эротическое кино 18+',
            component: COMPONENT_ID,
            search_query: search || '',
            page: 1,
            source: 'tmdb'
        });
    }

    function askSearch() {
        Lampa.Input.edit({
            title: 'Название фильма',
            value: '',
            free: true,
            nosave: true
        }, function (value) {
            if (value && value.trim()) openCatalog(value.trim());
        });
    }

    function openHome() {
        Lampa.Select.show({
            title: 'Эротическое кино 18+',
            items: [
                { title: 'Открыть каталог', catalog: true },
                { title: 'Поиск фильма', search: true }
            ],
            onSelect: function (item) {
                if (item.search) askSearch();
                else openCatalog('');
            },
            onBack: function () { Lampa.Controller.toggle('menu'); }
        });
    }

    function enter() {
        if (Lampa.Storage.get('erotic_catalog_adult_confirmed', false)) return openHome();

        Lampa.Select.show({
            title: 'Контент 18+',
            items: [
                { title: 'Мне исполнилось 18 лет', confirm: true },
                { title: 'Отмена', cancel: true }
            ],
            onSelect: function (item) {
                if (item.confirm) {
                    Lampa.Storage.set('erotic_catalog_adult_confirmed', true);
                    openHome();
                } else Lampa.Controller.toggle('menu');
            },
            onBack: function () { Lampa.Controller.toggle('menu'); }
        });
    }

    function init() {
        if (!window.Lampa || !Lampa.Component || !Lampa.Menu || !Lampa.TMDB) {
            return setTimeout(init, 200);
        }

        Lampa.Component.add(COMPONENT_ID, Catalog);
        var icon = '<svg viewBox="0 0 24 24" width="34" height="34"><path fill="currentColor" d="M8 5v14l11-7z"/><path fill="currentColor" opacity=".4" d="M3 3h18v18H3z"/></svg>';
        Lampa.Menu.addButton(icon, 'Эротика 18+', enter);

        if (Lampa.SettingsApi && Lampa.SettingsApi.addParam) {
            Lampa.SettingsApi.addParam({
                component: 'more',
                param: { type: 'button' },
                field: {
                    name: 'Поиск эротических фильмов',
                    description: 'Открывает фильм в стандартной карточке Lampa'
                },
                onChange: askSearch
            });
            Lampa.SettingsApi.addParam({
                component: 'more',
                param: { type: 'button' },
                field: {
                    name: 'Сбросить подтверждение 18+',
                    description: 'Повторно показать возрастное предупреждение'
                },
                onChange: function () {
                    Lampa.Storage.set('erotic_catalog_adult_confirmed', false);
                    notify('Подтверждение 18+ сброшено');
                }
            });
        }

        window.erotic_catalog_search = askSearch;
        console.log('Erotic Catalog plugin 2.0.0 initialized');
    }

    if (window.appready) init();
    else Lampa.Listener.follow('app', function (event) {
        if (event.type === 'ready') init();
    });
}());
