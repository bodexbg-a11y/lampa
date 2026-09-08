// Loaded through adult18.js with a cache-busting URL.
(function () {
    'use strict';

    var VERSION = '1.14.0';
    var COMPONENT_ID = 'adult_catalog_component_1140';
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
        var hash = Lampa.Utils.hash('adult-catalog:' + movie.id + ':' + (source.title || url));
        var item = {
            title: movie.title,
            url: url,
            timeline: Lampa.Timeline.view(hash)
        };
        Lampa.Player.play(item);
        Lampa.Player.playlist([item]);
    }

    function showSources(movie) {
        var controller = Lampa.Controller.enabled().name;
        // The standard Full screen may trigger this button from its own source
        // selector. Returning to that now-hidden `select` controller leaves the
        // remote captured by an invisible layer after an external player exits.
        // The actual owner of this button is the Full card controller.
        if (controller === 'select') controller = 'full_start';
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
            if (source && (source.kind === 'preview' || source.kind === 'direct')) {
                add(source.title || 'Прямое видео', source.url);
            }
        });

        var preferred = String(movie.preferred_quality || 'auto');
        if (preferred !== 'auto') {
            var filtered = items.filter(function (item) {
                var title = String(item.title || '').toLowerCase();
                if (preferred === 'hls') return /hls/.test(title);
                return title.indexOf(preferred + 'p') >= 0;
            });
            if (filtered.length) items = filtered;
            else notify('Выбранного качества нет — показаны все доступные источники');
        }

        if (!items.length) return notify('Для этой карточки нет прямого видео для Just Player');
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
                var id = String(params.id || '');
                var endpoint = id.indexOf('pt-') === 0 ? '/api/peertube/video' :
                    (id.indexOf('ia-') === 0 ? '/api/archive/video' : '/api/movie');
                network.silent(apiUrl(endpoint, { id: params.id }), function (response) {
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
            var sourceName = movie.catalog_type === 'peertube' ? 'PeerTube' :
                (movie.catalog_type === 'archive' ? 'Internet Archive' :
                    (movie.catalog_type === 'scatgoon' ? 'ScatGoon' : 'TPDB'));
            body.find('.source--name').first().text(sourceName);
            var hasDirect = isDirectVideo(movie.preview_url) || (movie.sources || []).some(function (source) {
                return source && (source.kind === 'preview' || source.kind === 'direct') && isDirectVideo(source.url);
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
        var endpoint = movie.catalog_type === 'peertube' ? '/api/peertube/video' :
            (movie.catalog_type === 'archive' ? '/api/archive/video' : '/api/movie');
        network.silent(apiUrl(endpoint, { id: movie.id }), function (response) {
            Lampa.Loading.stop();
            try {
                var data = typeof response === 'string' ? JSON.parse(response) : response;
                var detailed = prepareMovie(data.result || movie);
                detailed.preferred_quality = movie.preferred_quality || 'auto';
                showDetails(detailed);
            } catch (e) {
                showDetails(movie);
            }
        }, function () {
            Lampa.Loading.stop();
            showDetails(movie);
        });
    }

    var GENRE_OPTIONS = [
        { title: 'Все жанры', value: '' },
        { title: 'Классика', value: 'classic' },
        { title: 'Комедия', value: 'comedy' },
        { title: 'Драма', value: 'drama' },
        { title: 'Триллер / криминал', value: 'thriller' },
        { title: 'Ужасы / мистика', value: 'horror' },
        { title: 'Приключения / фэнтези', value: 'adventure' },
        { title: 'Документальное', value: 'documentary' },
        { title: 'Лесби', value: 'lesbian' },
        { title: 'Гей', value: 'gay' },
        { title: 'BDSM / фетиш', value: 'bdsm' },
        { title: 'Пародия', value: 'parody' }
    ];

    var QUALITY_OPTIONS = [
        { title: 'Авто / все варианты', value: 'auto' },
        { title: '1080p', value: '1080' },
        { title: '720p', value: '720' },
        { title: '480p', value: '480' },
        { title: '360p', value: '360' },
        { title: '240p', value: '240' }
    ];

    var DURATION_OPTIONS = [
        { title: 'Все форматы', value: '' },
        { title: 'Полнометражные · 60+ мин', value: 'feature' },
        { title: 'Средние · 20–60 мин', value: 'medium' },
        { title: 'Короткие · до 20 мин', value: 'short' },
        { title: 'Любительские / домашние', value: 'amateur' },
        { title: 'Сборники', value: 'collection' }
    ];

    var SORT_OPTIONS = [
        { title: 'По популярности', value: 'popular' },
        { title: 'Недавно добавленные', value: 'added' },
        { title: 'По году: сначала новые', value: 'newest' },
        { title: 'По году: сначала старые', value: 'oldest' },
        { title: 'По названию', value: 'title' }
    ];

    function optionTitle(items, value, fallback) {
        var selected = items.filter(function (item) { return item.value === (value || ''); })[0];
        return selected ? selected.title : fallback;
    }

    function openCatalog(search, year, genre, quality, duration, sort, replace) {
        var title = 'Полное 18+';
        if (search) title += ' — ' + search;
        var activity = {
            url: 'adult-catalog',
            title: title,
            component: COMPONENT_ID,
            search_query: search || '',
            filter_year: year || '',
            filter_genre: genre || '',
            filter_quality: quality || 'auto',
            filter_duration: duration || '',
            filter_sort: sort || 'popular',
            page: 1
        };
        if (replace && Lampa.Activity.replace) Lampa.Activity.replace(activity, true);
        else Lampa.Activity.push(activity);
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
            openCatalog((value || '').trim(), object.filter_year, object.filter_genre, object.filter_quality,
                object.filter_duration, object.filter_sort, true);
        });
    }

    function chooseFilter(object, type) {
        var controller = Lampa.Controller.enabled().name;
        var items = [];
        var title;
        if (type === 'year') {
            title = 'Выберите год фильма';
            items.push({ title: 'Все годы', value: '' });
            var currentYear = new Date().getFullYear();
            for (var year = currentYear; year >= 1960; year--) items.push({ title: String(year), value: String(year) });
        } else if (type === 'genre') {
            title = 'Выберите жанр';
            items = GENRE_OPTIONS.slice();
        } else if (type === 'duration') {
            title = 'Формат и длительность';
            items = DURATION_OPTIONS.slice();
        } else if (type === 'sort') {
            title = 'Сортировка каталога';
            items = SORT_OPTIONS.slice();
        } else {
            title = 'Предпочитаемое качество';
            items = QUALITY_OPTIONS.slice();
        }
        items.forEach(function (item) {
            var selected = type === 'year' ? object.filter_year : (type === 'genre' ? object.filter_genre :
                (type === 'quality' ? object.filter_quality :
                    (type === 'duration' ? object.filter_duration : object.filter_sort)));
            item.selected = item.value === (selected || (type === 'quality' ? 'auto' : (type === 'sort' ? 'popular' : '')));
        });
        Lampa.Select.show({
            title: title,
            items: items,
            onSelect: function (item) {
                Lampa.Controller.toggle(controller);
                if (Lampa.Activity && Lampa.Activity.mixState) Lampa.Activity.mixState();
                openCatalog(
                    object.search_query,
                    type === 'year' ? item.value : object.filter_year,
                    type === 'genre' ? item.value : object.filter_genre,
                    type === 'quality' ? item.value : object.filter_quality,
                    type === 'duration' ? item.value : object.filter_duration,
                    type === 'sort' ? item.value : object.filter_sort,
                    true
                );
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
        var yearButton = render.find('.filter--sort');
        var genreButton = render.find('.filter--filter');
        var qualityButton = genreButton.clone().removeClass('filter--filter').addClass('adult-filter--quality');
        var durationButton = genreButton.clone().removeClass('filter--filter').addClass('adult-filter--duration');
        var sortButton = genreButton.clone().removeClass('filter--filter').addClass('adult-filter--sort');
        genreButton.after(qualityButton);
        qualityButton.after(durationButton);
        durationButton.after(sortButton);

        searchButton.off('hover:enter').on('hover:enter', function () { askSearch(object); });
        searchButton.find('div').text(object.search_query || 'Поиск').removeClass('hide');
        yearButton.off('hover:enter').on('hover:enter', function () { chooseFilter(object, 'year'); });
        yearButton.find('span').text('Год');
        yearButton.find('div').text(object.filter_year || 'Все').removeClass('hide');
        genreButton.off('hover:enter').on('hover:enter', function () { chooseFilter(object, 'genre'); });
        genreButton.find('span').text('Жанр');
        var chosenGenre = GENRE_OPTIONS.filter(function (item) { return item.value === object.filter_genre; })[0];
        genreButton.find('div').text(chosenGenre && chosenGenre.value ? chosenGenre.title : 'Все').removeClass('hide');
        qualityButton.off('hover:enter').on('hover:enter', function () { chooseFilter(object, 'quality'); });
        qualityButton.find('span').text('Качество');
        var chosenQuality = QUALITY_OPTIONS.filter(function (item) { return item.value === (object.filter_quality || 'auto'); })[0];
        qualityButton.find('div').text(chosenQuality ? chosenQuality.title : 'Авто').removeClass('hide');
        durationButton.off('hover:enter').on('hover:enter', function () { chooseFilter(object, 'duration'); });
        durationButton.find('span').text('Длительность');
        durationButton.find('div').text(optionTitle(DURATION_OPTIONS, object.filter_duration, 'Все форматы')).removeClass('hide');
        sortButton.off('hover:enter').on('hover:enter', function () { chooseFilter(object, 'sort'); });
        sortButton.find('span').text('Сортировка');
        sortButton.find('div').text(optionTitle(SORT_OPTIONS, object.filter_sort || 'popular', 'По популярности')).removeClass('hide');
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
            network.silent(apiUrl('/api/archive', params), function (response) {
                try { complete(parseResponse(response)); }
                catch (e) { error('Сервер вернул некорректный ответ'); }
            }, function () { error('Не удалось подключиться к серверу каталога'); });
        }

        function loadHome(complete, error) {
            var selectedDuration = object.filter_duration || '';
            var selectedSort = object.filter_sort || 'popular';
            var configs = selectedDuration ? [{
                title: optionTitle(DURATION_OPTIONS, selectedDuration, 'Видео') + ' · до 60 карточек',
                duration: selectedDuration
            }] : [
                { title: 'Полнометражные фильмы · до 60 карточек', duration: 'feature' },
                { title: 'Средние · 20–60 минут', duration: 'medium' },
                { title: 'Короткие ролики · до 20 минут', duration: 'short' },
                { title: 'Любительские / домашние', duration: 'amateur' }
            ];
            var rows = new Array(configs.length);
            var pending = configs.length;
            var successes = 0;

            function finish() {
                pending--;
                if (pending) return;
                rows = rows.filter(function (row) { return row && row.results.length; });
                if (rows.length) complete(rows);
                else error(successes ? 'По выбранному году ничего не найдено' : 'Каталог временно недоступен');
            }

            configs.forEach(function (config, index) {
                request({
                    page: 1,
                    year: object.filter_year,
                    genre: object.filter_genre,
                    duration: config.duration,
                    sort: selectedSort
                }, function (data) {
                    successes++;
                    rows[index] = {
                        title: (data.fallback === 'tpdb' ? 'Резерв TPDB · ' : '') + config.title,
                        results: data.results,
                        total_pages: 1,
                        params: {}
                    };
                    finish();
                }, finish);
            });
        }

        function loadSearch(complete, error) {
            request({
                page: 1,
                q: object.search_query,
                year: object.filter_year,
                genre: object.filter_genre,
                duration: object.filter_duration,
                sort: object.filter_sort || 'popular'
            }, function (data) {
                if (!data.results.length) return error('Ничего не найдено');
                complete([{
                    title: (data.fallback === 'tpdb' ? 'Резерв TPDB · ' : '') + 'Результаты поиска: ' + object.search_query,
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
                            onlyEnter: function () {
                                data.preferred_quality = object.filter_quality || 'auto';
                                openMovie(data);
                            },
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
        if (Lampa.Storage.get('adult_catalog_age_confirmed', false)) return openCatalog('', '', '', 'auto', '', 'popular');
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
                    openCatalog('', '', '', 'auto', '', 'popular');
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
