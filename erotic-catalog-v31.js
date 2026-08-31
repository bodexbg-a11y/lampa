(function () {
    'use strict';

    var COMPONENT_ID = 'erotic_catalog_v32_component';
    var EROTIC_KEYWORDS = '256466|302868|298666|207767|207807|343572|190370|240530|11190';
    var VERSION = '3.2.0';

    if (window.plugin_erotic_catalog_v32_ready) return;
    window.plugin_erotic_catalog_v32_ready = true;

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
                '&with_keywords=' + encodeURIComponent(EROTIC_KEYWORDS) +
                '&include_adult=true&sort_by=vote_average.desc&vote_count.gte=20&page=' + page +
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

    function createToolbar(object) {
        var filter = new Lampa.Filter({
            search: object.search_query || '',
            movie: {
                id: 'erotic_catalog_filter',
                title: 'Эротическое кино',
                release_date: '',
                names: [],
                alternative_titles: { titles: [] }
            }
        });
        var render = filter.render();
        var searchButton = render.find('.filter--search');
        var yearButton = render.find('.filter--filter');
        var sortButton = render.find('.filter--sort');

        sortButton.removeClass('selector').addClass('hide');

        searchButton.off('hover:enter').on('hover:enter', function () {
            askSearch(object);
        });
        searchButton.find('div').text(object.search_query || 'Поиск').removeClass('hide');

        yearButton.off('hover:enter').on('hover:enter', function () {
            askYear(object);
        });
        yearButton.find('span').text('Год');
        yearButton.find('div').text(object.filter_year || 'Все').removeClass('hide');

        return filter;
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
        var toolbar;
        var comp = Lampa.Maker.make('Category', object, function (module) {
            return module.toggle(module.MASK.base, 'Pagination');
        });

        function load(page, complete, error) {
            network.timeout(20000);
            network.silent(apiUrl(object, page), function (response) {
                var data;
                try {
                    data = parseResponse(response);
                } catch (parseError) {
                    return error('TMDB вернул некорректный ответ');
                }

                complete(data);
            }, function () {
                error('Не удалось загрузить каталог TMDB');
            });
        }

        comp.use({
            onCreate: function () {
                toolbar = createToolbar(object);
                this.scroll.prepend(toolbar.render());
                load(object.page || 1, this.build.bind(this), this.empty.bind(this));
            },
            onNext: function (resolve, reject) {
                load(object.page || 1, resolve.bind(this), reject.bind(this));
            },
            onInstance: function (card, data) {
                card.use({
                    onlyEnter: function () { openMovie(data); },
                    onFocus: function () {
                        if (Lampa.Background && Lampa.Utils.cardImgBackground) {
                            Lampa.Background.change(Lampa.Utils.cardImgBackground(data));
                        }
                    }
                });
            },
            onScroll: function () {
                if (Lampa.Controller.own(this)) Lampa.Controller.collectionSet(this.scroll.render(true));
            },
            onDestroy: function () {
                network.clear();
                if (toolbar) toolbar.destroy();
            }
        });

        return comp;
    }

    function init() {
        if (!window.Lampa || !Lampa.Component || !Lampa.Menu || !Lampa.TMDB || !Lampa.Maker || !Lampa.Filter) {
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
