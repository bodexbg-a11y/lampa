// Loaded through e32.js with a cache-busting URL.
(function () {
    'use strict';

    var COMPONENT_ID = 'erotic_catalog_v33_component';
    var EROTIC_KEYWORDS = '256466|302868|298666|207767|207807|343572|190370|240530|11190';
    var TAGS = [
        { id: '', title: 'Вся эротика', keywords: EROTIC_KEYWORDS },
        { id: 'bdsm', title: 'BDSM', keywords: '158713|6373|157707' },
        { id: 'fetish', title: 'Фетиш / латекс / шибари', keywords: '158713|206872|226712' },
        { id: 'massage', title: 'Эротический массаж', keywords: '226161' }
    ];
    var COUNTRIES = [
        { id: '', title: 'Все страны' },
        { id: 'FR', title: 'Франция' },
        { id: 'IT', title: 'Италия' },
        { id: 'ES', title: 'Испания' },
        { id: 'DE', title: 'Германия' },
        { id: 'US', title: 'США' },
        { id: 'JP', title: 'Япония' },
        { id: 'GB', title: 'Великобритания' }
    ];
    var CURATED_DIRECTORS = [{
        id: 30956,
        title: 'Хесус Франко',
        aliases: ['хесус франко', 'джесс франко', 'jesus franco', 'jesús franco', 'jess franco']
    }];
    var VERSION = '3.5.0';

    if (window.plugin_erotic_catalog_v33_ready) return;
    window.plugin_erotic_catalog_v33_ready = true;

    function notify(message) {
        if (Lampa.Noty && Lampa.Noty.show) Lampa.Noty.show(message);
        else if (Lampa.Bell && Lampa.Bell.push) Lampa.Bell.push({ text: message });
    }

    function language() {
        var value = Lampa.Storage && Lampa.Storage.get('language', 'ru');
        return typeof value === 'string' ? value : 'ru';
    }

    function findOption(items, id) {
        var found = items[0];
        items.some(function (item) {
            if (item.id === (id || '')) found = item;
            return item.id === (id || '');
        });
        return found;
    }

    function selectedTag(object) {
        return findOption(TAGS, object.filter_tag || '');
    }

    function discoverUrl(object, sort, votes, page) {
        var year = object.filter_year || '';
        var yearParam = year ? '&primary_release_year=' + encodeURIComponent(year) : '';
        var countryParam = object.filter_country ?
            '&with_origin_country=' + encodeURIComponent(object.filter_country) : '';
        var tag = selectedTag(object);
        var dateParam = sort === 'primary_release_date.desc' ?
            '&primary_release_date.lte=' + new Date().toISOString().slice(0, 10) : '';
        var path = 'discover/movie?api_key=' + Lampa.TMDB.key() +
            '&with_keywords=' + encodeURIComponent(tag.keywords) +
            '&include_adult=true&sort_by=' + encodeURIComponent(sort) +
            '&vote_count.gte=' + (votes || 0) + '&page=' + (page || 1) +
            '&language=' + encodeURIComponent(language()) + yearParam + countryParam + dateParam;
        return Lampa.TMDB.api(path);
    }

    function searchUrl(object) {
        var yearParam = object.filter_year ?
            '&primary_release_year=' + encodeURIComponent(object.filter_year) : '';
        return Lampa.TMDB.api('search/movie?api_key=' + Lampa.TMDB.key() +
            '&query=' + encodeURIComponent(object.search_query) +
            '&include_adult=true&page=1&language=' + encodeURIComponent(language()) + yearParam);
    }

    function detailsUrl(id) {
        return Lampa.TMDB.api('movie/' + id + '?api_key=' + Lampa.TMDB.key() +
            '&append_to_response=keywords,alternative_titles,external_ids' +
            '&language=' + encodeURIComponent(language()));
    }

    function directorCreditsUrl(id) {
        return Lampa.TMDB.api('person/' + id + '/movie_credits?api_key=' + Lampa.TMDB.key() +
            '&language=' + encodeURIComponent(language()));
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

    function openCatalog(search, year, country, tag) {
        var title = 'Эротическое кино 18+';
        if (search) title += ' — ' + search;
        if (year) title += ' (' + year + ')';

        Lampa.Activity.push({
            url: 'erotic-catalog',
            title: title,
            component: COMPONENT_ID,
            search_query: search || '',
            filter_year: year || '',
            filter_country: country || '',
            filter_tag: tag || '',
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
            openCatalog((value || '').trim(), object.filter_year || '',
                object.filter_country || '', object.filter_tag || '');
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
                openCatalog(object.search_query || '', item.year,
                    object.filter_country || '', object.filter_tag || '');
            },
            onBack: function () { Lampa.Controller.toggle(controller); }
        });
    }

    function askCountry(object) {
        var controller = Lampa.Controller.enabled().name;
        var items = COUNTRIES.map(function (country) {
            return {
                title: country.title,
                id: country.id,
                selected: (object.filter_country || '') === country.id
            };
        });

        Lampa.Select.show({
            title: 'Выберите страну',
            items: items,
            onSelect: function (item) {
                Lampa.Controller.toggle(controller);
                openCatalog(object.search_query || '', object.filter_year || '',
                    item.id, object.filter_tag || '');
            },
            onBack: function () { Lampa.Controller.toggle(controller); }
        });
    }

    function askTag(object) {
        var controller = Lampa.Controller.enabled().name;
        var items = [{
            title: 'Выбрать год…' + (object.filter_year ? '  (' + object.filter_year + ')' : ''),
            id: '__year__',
            selected: false
        }].concat(TAGS.map(function (tag) {
            return {
                title: tag.title,
                id: tag.id,
                selected: (object.filter_tag || '') === tag.id
            };
        }));

        Lampa.Select.show({
            title: 'Год и тематический тег',
            items: items,
            onSelect: function (item) {
                Lampa.Controller.toggle(controller);
                if (item.id === '__year__') return setTimeout(function () { askYear(object); }, 100);
                openCatalog(object.search_query || '', object.filter_year || '',
                    object.filter_country || '', item.id);
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
        var tagButton = render.find('.filter--filter');
        var countryButton = render.find('.filter--sort');

        searchButton.off('hover:enter').on('hover:enter', function () {
            askSearch(object);
        });
        searchButton.find('div').text(object.search_query || 'Поиск').removeClass('hide');

        countryButton.off('hover:enter').on('hover:enter', function () {
            askCountry(object);
        });
        countryButton.find('span').text('Страна');
        countryButton.find('div').text(findOption(COUNTRIES, object.filter_country).title).removeClass('hide');

        tagButton.off('hover:enter').on('hover:enter', function () {
            askTag(object);
        });
        tagButton.find('span').text('Тег / год');
        tagButton.find('div').text(selectedTag(object).title +
            (object.filter_year ? ' • ' + object.filter_year : '')).removeClass('hide');

        return filter;
    }

    function parseResponse(response) {
        var data = typeof response === 'string' ? JSON.parse(response) : response;
        data = data || {};
        data.results = (data.results || []).map(prepareMovie);
        return data;
    }

    function parseJson(response) {
        return (typeof response === 'string' ? JSON.parse(response) : response) || {};
    }

    function enrichMovie(movie, details) {
        movie.original_title = details.original_title || movie.original_title;
        movie.imdb_id = details.imdb_id ||
            (details.external_ids && details.external_ids.imdb_id) || movie.imdb_id;
        movie.external_ids = details.external_ids || movie.external_ids || {};
        movie.alternative_titles = details.alternative_titles || movie.alternative_titles || { titles: [] };
        movie.production_countries = details.production_countries || movie.production_countries || [];
        return prepareMovie(movie);
    }

    function matchesDetails(movie, details, object, curated) {
        var keywordIds = selectedTag(object).keywords.split('|').map(function (id) { return Number(id); });
        var detailIds = ((details.keywords && details.keywords.keywords) || []).map(function (keyword) {
            return keyword.id;
        });
        var tagMatched = (!object.filter_tag && curated) || detailIds.some(function (id) {
            return keywordIds.indexOf(id) >= 0;
        });
        var countryMatched = !object.filter_country || (details.production_countries || []).some(function (country) {
            return country.iso_3166_1 === object.filter_country;
        });

        return tagMatched && countryMatched;
    }

    function directorMovies(response, object) {
        var data = parseJson(response);
        var year = String(object.filter_year || '');
        var seen = {};

        return (data.crew || []).filter(function (movie) {
            var releaseYear = String(movie.release_date || '').slice(0, 4);
            if (movie.job !== 'Director' || !movie.id || seen[movie.id]) return false;
            if (year && releaseYear !== year) return false;
            seen[movie.id] = true;
            return true;
        }).map(prepareMovie).sort(function (a, b) {
            return (b.popularity || 0) - (a.popularity || 0);
        });
    }

    function normalizedQuery(value) {
        return String(value || '').toLowerCase().replace(/ё/g, 'е').trim();
    }

    function requestedDirector(query) {
        var value = normalizedQuery(query);
        var found = null;

        CURATED_DIRECTORS.some(function (director) {
            found = director.aliases.some(function (alias) {
                return normalizedQuery(alias) === value;
            }) ? director : null;
            return !!found;
        });

        return found;
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

        function request(url, complete, error, parser) {
            network.timeout(20000);
            network.silent(url, function (response) {
                var data;
                try {
                    data = (parser || parseResponse)(response);
                } catch (parseError) {
                    return error('TMDB вернул некорректный ответ');
                }
                complete(data);
            }, function () {
                error('Не удалось загрузить каталог TMDB');
            });
        }

        function loadHome(complete, error) {
            var configs = [
                { title: 'Сейчас популярно', sort: 'popularity.desc', votes: 10, pages: 3 },
                { title: 'Лучшее по рейтингу', sort: 'vote_average.desc', votes: 20, pages: 3 },
                { title: 'Новинки', sort: 'primary_release_date.desc', votes: 0, pages: 3 }
            ];
            var visibleDirectors = (object.filter_country || object.filter_tag) ? [] : CURATED_DIRECTORS;
            var rows = new Array(configs.length + visibleDirectors.length);
            var pending = rows.length;
            var successes = 0;

            function finish() {
                pending--;
                if (!pending) {
                    rows = rows.filter(function (row) { return row && row.results.length; });
                    if (rows.length) complete(rows);
                    else error(successes ? 'В каталоге пока нет фильмов' : 'Не удалось загрузить подборки TMDB');
                }
            }

            configs.forEach(function (config, index) {
                requestPages(config, function (data) {
                    successes++;
                    rows[index] = {
                        title: config.title,
                        results: data.results,
                        total_pages: 1,
                        params: {}
                    };
                    finish();
                }, finish);
            });

            visibleDirectors.forEach(function (director, directorIndex) {
                request(directorCreditsUrl(director.id), function (movies) {
                    successes++;
                    rows[configs.length + directorIndex] = {
                        title: director.title + ' — фильмография',
                        results: movies,
                        total_pages: 1,
                        params: {}
                    };
                    finish();
                }, finish, function (response) {
                    return directorMovies(response, object);
                });
            });
        }

        function requestPages(config, complete, error) {
            var pages = config.pages || 1;
            var results = new Array(pages);
            var pending = pages;
            var loaded = 0;

            for (var page = 1; page <= pages; page++) {
                (function (pageNumber) {
                    request(discoverUrl(object, config.sort, config.votes, pageNumber), function (data) {
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
            var director = requestedDirector(object.search_query);

            if (director) {
                return request(directorCreditsUrl(director.id), function (movies) {
                    if (!movies.length) return error('Фильмы режиссёра не найдены');
                    complete([{
                        title: director.title + ' — фильмография',
                        results: movies,
                        total_pages: 1,
                        params: {}
                    }]);
                }, error, function (response) {
                    return directorMovies(response, object);
                });
            }

            request(searchUrl(object), function (data) {
                var movies = data.results.slice(0, 20);

                if (!movies.length) return error('Ничего не найдено');

                loadCuratedMovieIds(function (curatedIds) {
                    var matched = [];
                    var pending = movies.length;

                    movies.forEach(function (movie) {
                        network.silent(detailsUrl(movie.id), function (response) {
                            var details;
                            try {
                                details = typeof response === 'string' ? JSON.parse(response) : response;
                            } catch (e) {
                                details = {};
                            }
                            enrichMovie(movie, details || {});
                            if (matchesDetails(movie, details || {}, object, curatedIds[movie.id])) matched.push(movie);
                            pending--;
                            if (!pending) finish();
                        }, function () {
                            if (!object.filter_country && !object.filter_tag && curatedIds[movie.id]) matched.push(movie);
                            pending--;
                            if (!pending) finish();
                        });
                    });

                    function finish() {
                        matched.sort(function (a, b) { return b.vote_average - a.vote_average; });
                        if (!matched.length) return error('В эротическом каталоге ничего не найдено');
                        complete([{
                            title: 'Результаты поиска: ' + object.search_query,
                            results: matched,
                            total_pages: 1,
                            params: {}
                        }]);
                    }
                });
            }, error);
        }

        function loadCuratedMovieIds(complete) {
            var ids = {};
            var pending = CURATED_DIRECTORS.length;

            if (!pending) return complete(ids);

            CURATED_DIRECTORS.forEach(function (director) {
                request(directorCreditsUrl(director.id), function (movies) {
                    movies.forEach(function (movie) { ids[movie.id] = true; });
                    finish();
                }, finish, function (response) {
                    return directorMovies(response, object);
                });
            });

            function finish() {
                pending--;
                if (!pending) complete(ids);
            }
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
            openCatalog('', '', '', '');
        });

        console.log('Erotic Catalog plugin ' + VERSION + ' initialized directly');
    }

    if (window.appready) init();
    else Lampa.Listener.follow('app', function (event) {
        if (event.type === 'ready') init();
    });
}());
