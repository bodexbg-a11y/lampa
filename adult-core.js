// Loaded through adult18.js with a cache-busting URL.
(function () {
    'use strict';

    var COMPONENT_ID = 'adult_catalog_component';
    var API_BASE = String(window.ADULT_CATALOG_API_BASE || 'https://lampa-kakm.onrender.com').replace(/\/$/, '');
    var VERSION = '1.0.0';

    if (window.plugin_adult_catalog_ready) return;
    window.plugin_adult_catalog_ready = true;

    function notify(message) {
        if (Lampa.Noty && Lampa.Noty.show) Lampa.Noty.show(message);
        else if (Lampa.Bell && Lampa.Bell.push) Lampa.Bell.push({ text: message });
    }

    function apiUrl(path, params) {
        var query = [];
        Object.keys(params || {}).forEach(function (key) {
            if (params[key] !== '' && params[key] !== undefined) {
                query.push(encodeURIComponent(key) + '=' + encodeURIComponent(params[key]));
            }
        });
        return API_BASE + path + (query.length ? '?' + query.join('&') : '');
    }

    function prepareMovie(movie) {
        movie = movie || {};
        movie.title = movie.title || 'Без названия';
        movie.name = movie.title;
        movie.release_date = movie.date || (movie.year ? movie.year + '-01-01' : '');
        movie.overview = movie.description || '';
        movie.vote_average = Number(movie.rating || 0);
        movie.poster = movie.poster || '';
        movie.img = movie.poster;
        movie.background_image = movie.background || movie.poster;
        movie.params = movie.params || {};
        return movie;
    }

    function parseResponse(response) {
        var data = typeof response === 'string' ? JSON.parse(response) : response;
        data = data || {};
        data.results = (data.results || []).map(prepareMovie);
        return data;
    }

    function openExternal(url) {
        if (!/^https?:\/\//i.test(url || '')) return notify('Ссылка источника отсутствует');
        if (Lampa.Platform && typeof Lampa.Platform.open === 'function') Lampa.Platform.open(url);
        else window.open(url, '_blank');
    }

    function playPreview(movie) {
        if (!/^https?:\/\//i.test(movie.preview_url || '')) return notify('У этого фильма нет доступного превью');
        var controller = Lampa.Controller.enabled().name;
        Lampa.Player.play({ title: movie.title, url: movie.preview_url });
        Lampa.Player.playlist([{ title: movie.title, url: movie.preview_url }]);
        Lampa.Player.callback(function () { Lampa.Controller.toggle(controller); });
    }

    function openMovie(movie) {
        var controller = Lampa.Controller.enabled().name;
        var items = [];
        if (movie.preview_url) items.push({ title: 'Смотреть официальное превью', action: 'preview' });
        if (movie.source_url) items.push({ title: 'Открыть страницу источника', action: 'source' });
        items.push({
            title: (movie.year ? movie.year + ' • ' : '') + (movie.studio || 'Студия не указана'),
            action: 'info'
        });

        Lampa.Select.show({
            title: movie.title,
            items: items,
            onSelect: function (item) {
                Lampa.Controller.toggle(controller);
                if (item.action === 'preview') playPreview(movie);
                else if (item.action === 'source') openExternal(movie.source_url);
                else notify(movie.description || 'Описание отсутствует');
            },
            onBack: function () { Lampa.Controller.toggle(controller); }
        });
    }

    function openCatalog(search, year) {
        var title = 'Полное 18+';
        if (search) title += ' — ' + search;
        if (year) title += ' (' + year + ')';
        Lampa.Activity.push({
            url: 'adult-catalog',
            title: title,
            component: COMPONENT_ID,
            search_query: search || '',
            filter_year: year || '',
            page: 1
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
        for (year = current; year >= 1930; year--) {
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
            movie: { id: 'adult_catalog_filter', title: 'Полное 18+', release_date: '', names: [] }
        });
        var render = filter.render();
        var searchButton = render.find('.filter--search');
        var yearButton = render.find('.filter--filter');
        render.find('.filter--sort').remove();

        searchButton.off('hover:enter').on('hover:enter', function () { askSearch(object); });
        searchButton.find('div').text(object.search_query || 'Поиск').removeClass('hide');
        yearButton.off('hover:enter').on('hover:enter', function () { askYear(object); });
        yearButton.find('span').text('Год');
        yearButton.find('div').text(object.filter_year || 'Все годы').removeClass('hide');
        return filter;
    }

    function ToolbarLine(filter, parent) {
        var render = filter.render();
        var last;
        var line = this;
        render.find('.selector').on('hover:focus', function () { last = this; });
        this.render = function (js) { return js ? render[0] : render; };
        this.toggle = function () {
            Lampa.Controller.add('adult_items_line', {
                link: line,
                toggle: function () {
                    Lampa.Controller.collectionSet(render[0]);
                    Lampa.Controller.collectionFocus(last || false, render[0]);
                },
                right: function () { if (Navigator.canmove('right')) Navigator.move('right'); },
                left: function () {
                    if (Navigator.canmove('left')) Navigator.move('left');
                    else parent.emit('left');
                },
                down: function () { parent.emit('down'); },
                up: function () { Lampa.Controller.toggle('head'); },
                back: function () { parent.emit('back'); }
            });
            Lampa.Controller.toggle('adult_items_line');
        };
        this.destroy = function () { filter.destroy(); };
    }

    function Catalog(object) {
        var network = new Lampa.Reguest();
        var toolbar;
        var comp = Lampa.Maker.make('Main', object);

        function request(params, complete, error) {
            network.timeout(25000);
            network.silent(apiUrl('/api/movies', params), function (response) {
                try { complete(parseResponse(response)); }
                catch (e) { error('Сервер вернул некорректный ответ'); }
            }, function () { error('Не удалось подключиться к серверу каталога'); });
        }

        function loadHome(complete, error) {
            var rows = new Array(3);
            var pending = 3;
            var successes = 0;
            var configs = [
                { title: 'Новые фильмы', mode: 'new', page: 1 },
                { title: 'Лучшее по рейтингу', mode: 'rating', page: 2 },
                { title: 'Ещё фильмы', mode: 'all', page: 3 }
            ];

            function finish() {
                pending--;
                if (pending) return;
                rows = rows.filter(function (row) { return row && row.results.length; });
                if (rows.length) complete(rows);
                else error(successes ? 'По выбранному году ничего не найдено' : 'Каталог временно недоступен');
            }

            configs.forEach(function (config, index) {
                request({ page: config.page, year: object.filter_year || '', mode: config.mode }, function (data) {
                    successes++;
                    rows[index] = { title: config.title, results: data.results, total_pages: 1, params: {} };
                    finish();
                }, finish);
            });
        }

        function loadSearch(complete, error) {
            request({ page: 1, year: object.filter_year || '', q: object.search_query }, function (data) {
                if (!data.results.length) return error('Ничего не найдено');
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
                            onlyEnter: function () { openMovie(data); },
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

    function confirmAge() {
        if (Lampa.Storage.get('adult_catalog_age_confirmed', false)) return openCatalog('', '');
        var controller = Lampa.Controller.enabled().name;
        Lampa.Select.show({
            title: 'Раздел только для совершеннолетних',
            items: [
                { title: 'Мне исполнилось 18 лет', action: 'accept' },
                { title: 'Отмена', action: 'cancel' }
            ],
            onSelect: function (item) {
                Lampa.Controller.toggle(controller);
                if (item.action === 'accept') {
                    Lampa.Storage.set('adult_catalog_age_confirmed', true);
                    openCatalog('', '');
                }
            },
            onBack: function () { Lampa.Controller.toggle(controller); }
        });
    }

    function init() {
        if (!window.Lampa || !Lampa.Component || !Lampa.Menu || !Lampa.Maker || !Lampa.Filter) {
            return setTimeout(init, 200);
        }
        if (!Lampa.Manifest || Lampa.Manifest.app_digital < 300) {
            return notify('Плагину «Полное 18+» требуется Lampa 3.0 или новее');
        }
        Lampa.Component.add(COMPONENT_ID, Catalog);
        var icon = '<svg viewBox="0 0 24 24" width="34" height="34"><path fill="currentColor" d="M8 5v14l11-7z"/><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2"/></svg>';
        Lampa.Menu.addButton(icon, 'Полное 18+', confirmAge);
        console.log('Adult Catalog plugin ' + VERSION + ' initialized');
    }

    if (window.appready) init();
    else Lampa.Listener.follow('app', function (event) {
        if (event.type === 'ready') init();
    });
}());
