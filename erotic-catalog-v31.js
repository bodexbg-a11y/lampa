(function () {
    'use strict';

    var COMPONENT_ID = 'erotic_catalog_v31_component';
    var EROTIC_KEYWORD_ID = 2916;
    var VERSION = '3.1.0';

    if (window.plugin_erotic_catalog_v31_ready) return;
    window.plugin_erotic_catalog_v31_ready = true;

    function notify(message) {
        if (Lampa.Noty && Lampa.Noty.show) Lampa.Noty.show(message);
        else if (Lampa.Bell && Lampa.Bell.push) Lampa.Bell.push({ text: message });
    }

    function language() {
        var value = Lampa.Storage && Lampa.Storage.get('language', 'ru');
        return typeof value === 'string' ? value : 'ru';
    }

    function apiUrl(object, page) {
        var path;
        var year = object.filter_year || '';
        var yearParam = year ? '&primary_release_year=' + encodeURIComponent(year) : '';

        if (object.search_query) {
            path = 'search/movie?api_key=' + Lampa.TMDB.key() +
                '&query=' + encodeURIComponent(object.search_query) +
                '&include_adult=true&page=' + page +
                '&language=' + encodeURIComponent(language()) + yearParam;
        } else {
            path = 'discover/movie?api_key=' + Lampa.TMDB.key() +
                '&with_keywords=' + EROTIC_KEYWORD_ID +
                '&include_adult=true&sort_by=popularity.desc&page=' + page +
                '&language=' + encodeURIComponent(language()) + yearParam;
        }

        return Lampa.TMDB.api(path);
    }

    function prepareMovie(movie) {
        movie.source = 'tmdb';
        movie.media_type = 'movie';
        movie.method = 'movie';
        movie.title = movie.title || movie.original_title || movie.name || 'Без названия';
        movie.name = movie.title;
        movie.params = movie.params || {};
        return movie;
    }

    function actionPoster(icon, label, color) {
        var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="500" height="750" viewBox="0 0 500 750">' +
            '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="' + color + '"/><stop offset="1" stop-color="#16191d"/></linearGradient></defs>' +
            '<rect width="500" height="750" rx="36" fill="url(#g)"/>' +
            '<text x="250" y="325" text-anchor="middle" font-size="150" fill="white">' + icon + '</text>' +
            '<text x="250" y="470" text-anchor="middle" font-family="Arial,sans-serif" font-weight="700" font-size="52" fill="white">' + label + '</text>' +
            '</svg>';
        return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    }

    function actionCards(object) {
        var searchTitle = object.search_query ? 'Поиск: ' + object.search_query : 'Поиск';
        var yearTitle = object.filter_year ? 'Год: ' + object.filter_year : 'Выбрать год';

        return [
            {
                title: searchTitle,
                poster: actionPoster('⌕', 'ПОИСК', '#7d285d'),
                erotic_action: 'search',
                params: {}
            },
            {
                title: yearTitle,
                poster: actionPoster('▣', object.filter_year || 'ГОД', '#294d8f'),
                erotic_action: 'year',
                params: {}
            }
        ];
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

    function openCatalog(search, year) {
        var title = 'Эротическое кино 18+';
        if (search) title += ' — ' + search;
        if (year) title += ' (' + year + ')';

        Lampa.Activity.push({
            url: 'erotic-catalog',
            title: title,
            component: COMPONENT_ID,
            search_query: search || '',
            filter_year: year || '',
            page: 1,
            source: 'tmdb'
        });
    }

    function askSearch(object) {
        var controller = Lampa.Controller.enabled().name;
        Lampa.Input.edit({
            title: 'Название фильма',
            value: object.search_query || '',
            free: true,
            nosave: true
        }, function (value) {
            Lampa.Controller.toggle(controller);
            openCatalog((value || '').trim(), object.filter_year || '');
        });
    }

    function askYear(object) {
        var controller = Lampa.Controller.enabled().name;
        var current = new Date().getFullYear();
        var items = [{ title: 'Все годы', year: '', selected: !object.filter_year }];
        var year;

        for (year = current; year >= 1960; year--) {
            items.push({
                title: String(year),
                year: String(year),
                selected: String(object.filter_year || '') === String(year)
            });
        }

        Lampa.Select.show({
            title: 'Выберите год',
            items: items,
            onSelect: function (item) {
                Lampa.Controller.toggle(controller);
                openCatalog(object.search_query || '', item.year);
            },
            onBack: function () { Lampa.Controller.toggle(controller); }
        });
    }

    function parseResponse(response) {
        var data = typeof response === 'string' ? JSON.parse(response) : response;
        data = data || {};
        data.results = (data.results || []).map(prepareMovie);
        if (Lampa.Utils && Lampa.Utils.addSource) data = Lampa.Utils.addSource(data, 'tmdb');
        return data;
    }

    function Catalog(object) {
        var network = new Lampa.Reguest();
        var comp = Lampa.Maker.make('Category', object, function (module) {
            return module.toggle(module.MASK.base, 'Pagination');
        });

        function load(page, complete, error, includeActions) {
            network.timeout(20000);
            network.silent(apiUrl(object, page), function (response) {
                var data;
                try {
                    data = parseResponse(response);
                } catch (parseError) {
                    return error('TMDB вернул некорректный ответ');
                }

                if (includeActions) data.results = actionCards(object).concat(data.results);
                complete(data);
            }, function () {
                error('Не удалось загрузить каталог TMDB');
            });
        }

        comp.use({
            onCreate: function () {
                load(object.page || 1, this.build.bind(this), this.empty.bind(this), true);
            },
            onNext: function (resolve, reject) {
                load(object.page || 1, resolve.bind(this), reject.bind(this), false);
            },
            onInstance: function (card, data) {
                card.use({
                    onlyEnter: function () {
                        if (data.erotic_action === 'search') askSearch(object);
                        else if (data.erotic_action === 'year') askYear(object);
                        else openMovie(data);
                    },
                    onFocus: function () {
                        if (!data.erotic_action && Lampa.Background && Lampa.Utils.cardImgBackground) {
                            Lampa.Background.change(Lampa.Utils.cardImgBackground(data));
                        }
                    }
                });
            },
            onDestroy: function () { network.clear(); }
        });

        return comp;
    }

    function init() {
        if (!window.Lampa || !Lampa.Component || !Lampa.Menu || !Lampa.TMDB || !Lampa.Maker) {
            return setTimeout(init, 200);
        }

        if (!Lampa.Manifest || Lampa.Manifest.app_digital < 300) {
            return notify('Плагину «Эротика 18+» требуется Lampa 3.0 или новее');
        }

        Lampa.Component.add(COMPONENT_ID, Catalog);

        var icon = '<svg viewBox="0 0 24 24" width="34" height="34"><path fill="currentColor" d="M8 5v14l11-7z"/><path fill="currentColor" opacity=".4" d="M3 3h18v18H3z"/></svg>';
        Lampa.Menu.addButton(icon, 'Эротика 18+', function () {
            openCatalog('', '');
        });

        console.log('Erotic Catalog plugin ' + VERSION + ' initialized');
    }

    if (window.appready) init();
    else Lampa.Listener.follow('app', function (event) {
        if (event.type === 'ready') init();
    });
}());
