// Loaded through adult18.js with a cache-busting URL.
(function () {
    'use strict';

    var VERSION = '1.7.0';
    var COMPONENT_ID = 'adult_catalog_component_170';
    var API_BASE = String(window.ADULT_CATALOG_API_BASE || 'https://lampa-kakm.onrender.com').replace(/\/$/, '');
    var initialized = false;
    var detailCache = {};

    // The old loader set a boolean before the menu was actually registered.
    // A failed/early load therefore blocked every subsequent update in the same
    // Lampa session. Only skip a core that has completed this exact version.
    if (window.plugin_adult_catalog_version === VERSION) return;

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
        movie.sources = movie.sources || [];
        return movie;
    }

    function escapeHtml(value) {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function joined(items, empty) {
        return Array.isArray(items) && items.length ? items.join(', ') : empty;
    }

    function parseResponse(response) {
        var data = typeof response === 'string' ? JSON.parse(response) : response;
        data = data || {};
        data.results = (data.results || []).map(prepareMovie);
        return data;
    }

    function isDirectVideo(url) {
        return /^https?:\/\//i.test(url || '') && /\.(mp4|m3u8)(?:[?#]|$)/i.test(url || '');
    }

    function playDirect(movie, source) {
        var url = String(source && source.url || '');
        if (!isDirectVideo(url)) return notify('Источник не поддерживает системный плеер');
        var item = { title: movie.title, url: url };
        Lampa.Player.play(item);
        Lampa.Player.playlist([item]);
    }

    function showSources(movie) {
        var controller = Lampa.Controller.enabled().name;
        var seen = {};
        var items = [];

        function add(title, url) {
            url = String(url || '');
            if (!isDirectVideo(url) || seen[url]) return;
            seen[url] = true;
            items.push({ title: title, source: { kind: 'direct', title: title, url: url } });
        }

        add('TPDB — официальное превью', movie.preview_url);
        (movie.sources || []).forEach(function (source) {
            if (source && source.kind === 'preview') add(source.title || 'Прямое видео', source.url);
        });

        if (!items.length) return notify('Для этой карточки нет прямого видео для Just Player');
        if (items.length === 1) return playDirect(movie, items[0].source);

        Lampa.Select.show({
            title: 'Прямые источники — ' + movie.title,
            items: items,
            onSelect: function (item) {
                Lampa.Controller.toggle(controller);
                playDirect(movie, item.source);
            },
            onBack: function () { Lampa.Controller.toggle(controller); }
        });
    }

    function openDetails(movie) {
        movie = prepareMovie(movie);
        detailCache[movie.id] = movie;
        Lampa.Router.call('full', standardMovie(movie));
    }

    function personId(name, index) {
        var hash = 0;
        var value = String(name || '') + ':' + index;
        var i;
        for (i = 0; i < value.length; i++) hash = ((hash << 5) - hash + value.charCodeAt(i)) | 0;
        return Math.abs(hash) + 1000000;
    }

    function standardPerson(name, index, department, job) {
        return {
            id: personId(name, index),
            name: name,
            original_name: name,
            known_for_department: department,
            job: job || '',
            character: '',
            profile_path: '',
            source: 'adult_catalog'
        };
    }

    function standardMovie(movie) {
        movie = prepareMovie(movie);
        var rating = Number(movie.rating || 0);
        if (rating > 10) rating = rating / 10;
        return {
            id: movie.id,
            source: 'adult_catalog',
            name: movie.title,
            title: movie.title,
            original_title: movie.title,
            release_date: movie.release_date,
            overview: movie.description || 'Описание в базе отсутствует.',
            runtime: movie.duration ? Math.round(Number(movie.duration) / 60) : 0,
            vote_average: rating,
            adult: true,
            img: movie.poster,
            poster: movie.poster,
            background_image: movie.background_image,
            tagline: movie.studio ? 'Студия: ' + movie.studio : '',
            production_countries: [],
            production_companies: movie.studio ? [{ id: 0, name: movie.studio }] : [],
            origin_country: [],
            spoken_languages: [],
            genres: (movie.tags || []).slice(0, 8).map(function (name, index) {
                return { id: index + 1, name: name };
            }),
            keywords: { keywords: [] },
            adult_catalog_data: movie
        };
    }

    function fullData(movie) {
        return {
            movie: standardMovie(movie),
            persons: {
                crew: (movie.directors || []).map(function (name, index) {
                    return standardPerson(name, index, 'Directing', 'Director');
                }),
                cast: (movie.performers || []).map(function (name, index) {
                    return standardPerson(name, index, 'Acting', '');
                })
            }
        };
    }

    function registerAdultSource() {
        Lampa.Api.sources.adult_catalog = {
            full: function (params, complete, error) {
                var cached = detailCache[params.id] || (params.card && params.card.adult_catalog_data);
                if (cached) return complete(fullData(cached));
                var network = new Lampa.Reguest();
                network.timeout(20000);
                network.silent(apiUrl('/api/movie', { id: params.id }), function (response) {
                    var movie;
                    try {
                        var data = typeof response === 'string' ? JSON.parse(response) : response;
                        movie = prepareMovie(data.result || {});
                    } catch (e) {
                        return error({ blocked: false });
                    }
                    if (!movie.id) return error({ blocked: false });
                    detailCache[movie.id] = movie;
                    complete(fullData(movie));
                }, function () { error({ blocked: false }); });
            },
            person: function (params, complete, error) { error({ blocked: false }); },
            clear: function () {}
        };
    }

    function registerFullScreenButton() {
        Lampa.Listener.follow('full', function (event) {
            if (event.type !== 'complite' || !event.data || !event.data.movie || event.data.movie.source !== 'adult_catalog') return;
            var movie = detailCache[event.data.movie.id] || event.data.movie.adult_catalog_data;
            if (!movie) return;
            var body = event.body || (event.object && event.object.activity && event.object.activity.render());
            if (!body || !body.find) return;
            var container = body.find('.buttons--container');
            container.find('.adult-catalog-source').remove();
            body.find('.source--name').first().text(movie.catalog_type === 'scatgoon' ? 'ScatGoon' : 'TPDB');
            var hasDirect = isDirectVideo(movie.preview_url) || (movie.sources || []).some(function (source) {
                return source && source.kind === 'preview' && isDirectVideo(source.url);
            });
            if (!hasDirect) return;
            var button = $('<div class="full-start__button selector adult-catalog-source">' +
                '<svg><use xlink:href="#sprite-play"></use></svg><span>Смотреть в плеере</span></div>');
            button.on('hover:enter', function () {
                showSources(movie);
            });
            container.append(button);
        });
    }

    function showDetails(movie) {
        openDetails(movie);
    }

    function openMovie(movie) {
        if (movie.catalog_type === 'scatgoon') return showDetails(movie);
        var network = new Lampa.Reguest();
        Lampa.Loading.start(function () {
            network.clear();
            Lampa.Loading.stop();
        });
        network.timeout(20000);
        network.silent(apiUrl('/api/movie', { id: movie.id }), function (response) {
            Lampa.Loading.stop();
            try {
                var data = typeof response === 'string' ? JSON.parse(response) : response;
                showDetails(prepareMovie(data.result || movie));
            } catch (e) {
                showDetails(movie);
            }
        }, function () {
            Lampa.Loading.stop();
            showDetails(movie);
        });
    }

    function openCatalog(search) {
        var title = 'Полное 18+';
        if (search) title += ' — ' + search;
        Lampa.Activity.push({
            url: 'adult-catalog',
            title: title,
            component: COMPONENT_ID,
            search_query: search || '',
            page: 1
        });
    }

    function askSearch(object) {
        var controller = Lampa.Controller.enabled().name;
        Lampa.Input.edit({
            title: 'Поиск видео',
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
            movie: { id: 'adult_catalog_filter', title: 'Полное 18+', release_date: '', names: [] }
        });
        var render = filter.render();
        var searchButton = render.find('.filter--search');
        render.find('.filter--sort').remove();
        render.find('.filter--filter').remove();

        searchButton.off('hover:enter').on('hover:enter', function () { askSearch(object); });
        searchButton.find('div').text(object.search_query || 'Поиск').removeClass('hide');
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
            network.silent(apiUrl('/api/scatgoon', params), function (response) {
                try { complete(parseResponse(response)); }
                catch (e) { error('Сервер вернул некорректный ответ'); }
            }, function () { error('Не удалось подключиться к серверу каталога'); });
        }

        function loadHome(complete, error) {
            var rows = new Array(3);
            var pending = 3;
            var successes = 0;
            var configs = [
                { title: 'Новые видео', page: 1 },
                { title: 'Ещё видео', page: 2 },
                { title: 'Больше видео', page: 3 }
            ];

            function finish() {
                pending--;
                if (pending) return;
                rows = rows.filter(function (row) { return row && row.results.length; });
                if (rows.length) complete(rows);
                else error(successes ? 'По выбранному году ничего не найдено' : 'Каталог временно недоступен');
            }

            configs.forEach(function (config, index) {
                request({ page: config.page }, function (data) {
                    successes++;
                    rows[index] = { title: config.title, results: data.results, total_pages: 1, params: {} };
                    finish();
                }, finish);
            });
        }

        function loadSearch(complete, error) {
            request({ page: 1, q: object.search_query }, function (data) {
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
        if (Lampa.Storage.get('adult_catalog_age_confirmed', false)) return openCatalog('');
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
                    openCatalog('');
                }
            },
            onBack: function () { Lampa.Controller.toggle(controller); }
        });
    }

    function init() {
        if (initialized) return;
        if (!window.Lampa || !Lampa.Component || !Lampa.Menu || !Lampa.Maker || !Lampa.Filter || !Lampa.Api || !Lampa.Router) {
            return setTimeout(init, 200);
        }
        if (!Lampa.Manifest || Lampa.Manifest.app_digital < 300) {
            return notify('Плагину «Полное 18+» требуется Lampa 3.0 или новее');
        }
        initialized = true;
        registerAdultSource();
        registerFullScreenButton();
        Lampa.Component.add(COMPONENT_ID, Catalog);
        var icon = '<svg viewBox="0 0 24 24" width="34" height="34"><path fill="currentColor" d="M8 5v14l11-7z"/><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2"/></svg>';
        Lampa.Menu.addButton(icon, 'Полное 18+ v' + VERSION, confirmAge);
        window.plugin_adult_catalog_ready = true;
        window.plugin_adult_catalog_version = VERSION;
        console.log('Adult Catalog plugin ' + VERSION + ' initialized');
    }

    if (window.appready) init();
    else Lampa.Listener.follow('app', function (event) {
        if (event.type === 'ready') init();
    });
}());
