// Loaded through rus-series.js with a cache-busting URL.
(function () {
    'use strict';

    var COMPONENT_ID = 'rus_series_v2_component';
    var VERSION = '2.2.0';

    if (window.plugin_rus_series_v2_ready) return;
    window.plugin_rus_series_v2_ready = true;

    function notify(message) {
        if (Lampa.Noty && Lampa.Noty.show) Lampa.Noty.show(message);
        else if (Lampa.Bell && Lampa.Bell.push) Lampa.Bell.push({ text: message });
    }

    function language() {
        var value = Lampa.Storage && Lampa.Storage.get('language', 'ru');
        return typeof value === 'string' ? value : 'ru';
    }

    function api(path) {
        return Lampa.TMDB.api(path + (path.indexOf('?') >= 0 ? '&' : '?') +
            'api_key=' + Lampa.TMDB.key() + '&language=' + encodeURIComponent(language()));
    }

    function popularRussianUrl(page) {
        return api('discover/tv?include_adult=false&page=' + (page || 1) + '&sort_by=popularity.desc' +
            '&with_origin_country=RU&with_original_language=ru' +
            '&without_genres=10763%2C10764%2C10767');
    }

    function newTntSeriesUrl(page) {
        return api('discover/tv?include_adult=false&page=' + (page || 1) + '&sort_by=first_air_date.desc' +
            '&with_networks=1191&with_origin_country=RU&with_original_language=ru' +
            '&without_genres=10763%2C10764%2C10767' +
            '&first_air_date.lte=' + new Date().toISOString().slice(0, 10));
    }

    function discoverUrl(sort, votes, newest, page) {
        var date = newest ? '&first_air_date.lte=' + new Date().toISOString().slice(0, 10) : '';
        return api('discover/tv?include_adult=false&page=' + (page || 1) + '&sort_by=' + encodeURIComponent(sort) +
            '&with_origin_country=RU&with_original_language=ru' +
            '&without_genres=10763%2C10764%2C10767' +
            '&vote_count.gte=' + (votes || 0) + date);
    }

    function searchUrl(query) {
        return api('search/tv?include_adult=false&page=1&query=' + encodeURIComponent(query));
    }

    function isRussianSeries(item) {
        var countries = item.origin_country || [];
        return countries[0] === 'RU' && item.original_language === 'ru';
    }

    function prepareSeries(item) {
        item.source = 'tmdb';
        item.media_type = 'tv';
        item.method = 'tv';
        item.title = item.name || item.original_name || item.title || 'Без названия';
        item.name = item.title;
        item.params = item.params || {};
        return item;
    }

    function parseResponse(response) {
        var data = typeof response === 'string' ? JSON.parse(response) : response;
        data = data || {};
        data.results = (data.results || []).filter(isRussianSeries).map(prepareSeries);
        return data;
    }

    function openSeries(series) {
        prepareSeries(series);
        Lampa.Activity.push({
            url: 'tv/' + series.id,
            title: series.title,
            component: 'full',
            id: series.id,
            method: 'tv',
            card: series,
            source: 'tmdb'
        });
    }

    function openCatalog(search) {
        Lampa.Activity.push({
            url: 'rus-series-v2',
            title: search ? 'Русь сериалы — ' + search : 'Русь сериалы',
            component: COMPONENT_ID,
            search_query: search || '',
            page: 1,
            source: 'tmdb'
        });
    }

    function askSearch(object) {
        var controller = Lampa.Controller.enabled().name;
        Lampa.Input.edit({
            title: 'Поиск сериалов',
            value: object.search_query || '',
            free: true,
            nosave: true
        }, function (value) {
            Lampa.Controller.toggle(controller);
            openCatalog((value || '').trim());
        });
    }

    function createToolbar(object) {
        var filter = new Lampa.Filter({
            search: object.search_query || '',
            movie: {
                id: 'rus_series_filter',
                title: 'Русь сериалы',
                first_air_date: '',
                names: [],
                alternative_titles: { titles: [] }
            }
        });
        var render = filter.render();
        var searchButton = render.find('.filter--search');

        render.find('.filter--sort, .filter--filter').removeClass('selector').addClass('hide');
        searchButton.off('hover:enter').on('hover:enter', function () { askSearch(object); });
        searchButton.find('div').text(object.search_query || 'Поиск сериалов').removeClass('hide');

        return filter;
    }

    function ToolbarLine(filter, parent) {
        var render = filter.render();
        var last;
        var line = this;

        render.find('.selector').on('hover:focus', function () { last = this; });

        this.render = function (js) { return js ? render[0] : render; };
        this.toggle = function () {
            Lampa.Controller.add('items_line', {
                link: line,
                toggle: function () {
                    Lampa.Controller.collectionSet(render[0]);
                    Lampa.Controller.collectionFocus(last || false, render[0]);
                },
                right: function () {
                    if (Navigator.canmove('right')) Navigator.move('right');
                },
                left: function () {
                    if (Navigator.canmove('left')) Navigator.move('left');
                    else parent.emit('left');
                },
                down: function () { parent.emit('down'); },
                up: function () { Lampa.Controller.toggle('head'); },
                back: function () { parent.emit('back'); }
            });
            Lampa.Controller.toggle('items_line');
        };
        this.destroy = function () { filter.destroy(); };
    }

    function Catalog(object) {
        var network = new Lampa.Reguest();
        var toolbar;
        var comp = Lampa.Maker.make('Main', object);

        function request(url, complete, error) {
            network.timeout(20000);
            network.silent(url, function (response) {
                try {
                    complete(parseResponse(response));
                } catch (parseError) {
                    error('TMDB вернул некорректный ответ');
                }
            }, function () { error('Не удалось загрузить сериалы TMDB'); });
        }

        function loadHome(complete, error) {
            var configs = [
                {
                    title: 'Новые российские сериалы',
                    pages: 3,
                    url: function (page) { return discoverUrl('first_air_date.desc', 0, true, page); }
                },
                {
                    title: 'Новые сериалы на ТНТ',
                    pages: 3,
                    url: function (page) { return newTntSeriesUrl(page); }
                },
                {
                    title: 'Лучшие российские сериалы',
                    pages: 1,
                    url: function (page) { return discoverUrl('vote_average.desc', 300, false, page); }
                },
                {
                    title: 'Сейчас смотрят',
                    pages: 1,
                    url: function (page) { return popularRussianUrl(page); }
                }
            ];
            var rows = new Array(configs.length);
            var pending = configs.length;

            configs.forEach(function (config, index) {
                requestPages(config, function (data) {
                    rows[index] = {
                        title: config.title,
                        results: data.results,
                        total_pages: 1,
                        params: {}
                    };
                    finish();
                }, finish);
            });

            function finish() {
                pending--;
                if (!pending) {
                    rows = rows.filter(function (row) { return row && row.results.length; });
                    if (rows.length) complete(rows);
                    else error('В каталоге пока нет сериалов');
                }
            }
        }

        function requestPages(config, complete, error) {
            var pages = config.pages || 1;
            var results = new Array(pages);
            var pending = pages;
            var loaded = 0;

            for (var page = 1; page <= pages; page++) {
                (function (pageNumber) {
                    request(config.url(pageNumber), function (data) {
                        results[pageNumber - 1] = data.results || [];
                        loaded++;
                        finish();
                    }, finish);
                }(page));
            }

            function finish() {
                pending--;
                if (pending) return;
                if (!loaded) return error();

                var seen = {};
                var combined = [];
                results.forEach(function (items) {
                    (items || []).forEach(function (item) {
                        if (!seen[item.id]) {
                            seen[item.id] = true;
                            combined.push(item);
                        }
                    });
                });
                complete({ results: combined });
            }
        }

        function loadSearch(complete, error) {
            request(searchUrl(object.search_query), function (data) {
                if (!data.results.length) return error('Сериалы не найдены');
                complete([{
                    title: 'Результаты поиска: ' + object.search_query,
                    results: data.results,
                    total_pages: 1,
                    params: {}
                }]);
            }, error);
        }

        comp.use({
            onCreate: function () {
                toolbar = createToolbar(object);
                this.scroll.append(toolbar.render());
                this.items.push(new ToolbarLine(toolbar, this));
                if (object.search_query) loadSearch(this.build.bind(this), this.empty.bind(this));
                else loadHome(this.build.bind(this), this.empty.bind(this));
            },
            onInstance: function (line) {
                line.use({
                    onInstance: function (card, data) {
                        card.use({
                            onlyEnter: function () { openSeries(data); },
                            onFocus: function () {
                                if (Lampa.Background && Lampa.Utils.cardImgBackground) {
                                    Lampa.Background.change(Lampa.Utils.cardImgBackground(data));
                                }
                            }
                        });
                    }
                });
            },
            onDestroy: function () { network.clear(); }
        });

        return comp;
    }

    function init() {
        if (!window.Lampa || !Lampa.Component || !Lampa.Menu || !Lampa.TMDB ||
            !Lampa.Maker || !Lampa.Filter) return setTimeout(init, 200);

        if (!Lampa.Manifest || Lampa.Manifest.app_digital < 300) {
            return notify('Плагину «Русь сериалы» требуется Lampa 3.0 или новее');
        }

        Lampa.Component.add(COMPONENT_ID, Catalog);
        var icon = '<svg viewBox="0 0 24 24" width="34" height="34"><path fill="currentColor" d="M4 5h16v12H9l-5 4V5zm4 3v6l6-3-6-3z"/></svg>';
        Lampa.Menu.addButton(icon, 'Русь сериалы', function () { openCatalog(''); });

        console.log('Rus Series plugin ' + VERSION + ' initialized');
    }

    if (window.appready) init();
    else Lampa.Listener.follow('app', function (event) {
        if (event.type === 'ready') init();
    });
}());
