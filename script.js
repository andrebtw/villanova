function get_env() {
    return "ac66f3b9b442471f910d96310b7ba181";
}

const DEFAULT_AGENDA_UID = "14115607";
const AGENDA_KEY = "villanova_agenda_uid";
const CITY_KEY = "villanova_city_name";
const CATEGORIES_KEY = "villanova_categories";
const DEFAULT_CATEGORIES = ["Exposition", "Electro"];
const REFRESH_SEC = 60 * 60 * 1000;
const PAGE_SIZE = 20;

function get_agenda_uid() {
    return localStorage.getItem(AGENDA_KEY) || DEFAULT_AGENDA_UID;
}

function parse_events(raw_list) {
    const events = [];
    for (let i = 0; i < raw_list.length; i++) {
        const raw = raw_list[i];
        const name = raw.title?.fr || raw.title?.en || '';
        const start_date = raw.firstTiming?.begin || null;
        const end_date = raw.lastTiming?.end || null;
        const address = raw.location?.address || '';
        const description = raw.description?.fr || raw.description?.en || '';
        const artists = raw.artist?.fr || raw.artist?.en || '';
        const image = raw.image ? raw.image.base + raw.image.filename : null;

        const raw_tags = raw.keywords?.fr || [];
        const tags = [];
        for (let j = 0; j < raw_tags.length; j++) {
            const tag = raw_tags[j].replace(/\n/g, ' ').trim();
            if (tag !== '') tags.push(tag);
        }

        events.push({ uid: raw.uid, name, start_date, end_date, address, image, tags, description, artists });
    }
    return events;
}

async function fetch_events_page(start, end, after) {
    let url = "https://api.openagenda.com/v2/agendas/" + get_agenda_uid() + "/events"
        + "?key=" + get_env()
        + "&timings[gte]=" + start.toISOString()
        + "&timings[lte]=" + end.toISOString()
        + "&includeLabels=1"
        + "&size=" + PAGE_SIZE;

    if (after && after.length) {
        for (let i = 0; i < after.length; i++) {
            url += "&after[]=" + encodeURIComponent(after[i]);
        }
    }

    const response = await fetch(url);
    const data = await response.json();
    const after_cursor = data.after;
    const is_done = !after_cursor || (Array.isArray(after_cursor) && after_cursor.length === 0);
    return { events: parse_events(data.events || []), after: is_done ? null : after_cursor };
}

function create_state(start, end, type) {
    return {
        start,
        end,
        type,
        loaded: [],
        next_after: null,
        fetched: false,
        done: false,
        fetching: false,
        navigating: false,
        current_page: 0
    };
}

let week_state = null;
let month_state = null;
let filtered_week = [];
let filtered_month = [];

function get_cache_key(type) {
    return "villanova_" + type + "_lazy_" + get_agenda_uid();
}

function load_from_cache(type) {
    try {
        const raw = localStorage.getItem(get_cache_key(type));
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (Date.now() - parsed.timestamp < REFRESH_SEC) {
            return { loaded: parsed.loaded, next_after: parsed.next_after, done: parsed.done };
        }
    } catch (e) {}
    return null;
}

function save_to_cache(type, state) {
    try {
        localStorage.setItem(get_cache_key(type), JSON.stringify({
            timestamp: Date.now(),
            loaded: state.loaded,
            next_after: state.next_after,
            done: state.done
        }));
    } catch (e) {}
}

async function fetch_next_page(state) {
    if (state.fetching || state.done) return 0;
    state.fetching = true;
    try {
        const after = state.fetched ? state.next_after : null;
        const result = await fetch_events_page(state.start, state.end, after);
        state.fetched = true;
        state.loaded = state.loaded.concat(result.events);
        state.next_after = result.after;
        state.done = result.after === null || result.events.length === 0;
        return result.events.length;
    } catch (e) {
        console.error("Erreur chargement événements:", e);
        return 0;
    } finally {
        state.fetching = false;
    }
}

function get_filtered(state) {
    return state.type === 'week' ? filtered_week : filtered_month;
}

function set_filtered(state, events) {
    if (state.type === 'week') filtered_week = events;
    else filtered_month = events;
}

function get_section_id(state) {
    return state.type === 'week' ? '#next_7_days_section' : '#next_month_section';
}

function get_max_tags(state) {
    return state.type === 'week' ? 3 : null;
}

function build_tags(event_types, tags, max_tags) {
    for (let i = 0; i < tags.length; i++) {
        if (max_tags !== null && i >= max_tags) break;
        const tag = tags[i];
        const span = document.createElement("span");
        span.textContent = tag.length > 10 ? tag.slice(0, 10) + "..." : tag;
        event_types.appendChild(span);
    }
}

function create_article(event, max_tags) {
    const article = document.createElement("article");
    article.style.cursor = 'pointer';
    article.setAttribute('tabindex', '0');
    article.setAttribute('role', 'link');
    article.setAttribute('aria-label', event.name);

    function go() {
        window.location.href = 'event_detail.html?id=' + event.uid;
    }

    article.addEventListener('click', go);
    article.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            go();
        }
    });

    const event_types = document.createElement('div');
    event_types.classList.add('event_types');
    build_tags(event_types, event.tags, max_tags);

    const party_name = document.createElement('h3');
    party_name.classList.add('party_name');
    party_name.textContent = event.name;

    const location_name = document.createElement('span');
    location_name.classList.add('location_name');
    location_name.textContent = event.address;

    const artists = document.createElement('span');
    artists.classList.add('artists');
    artists.textContent = event.description;

    const distance = document.createElement('span');
    distance.classList.add('distance');
    distance.textContent = event.artists;

    article.appendChild(event_types);
    article.appendChild(party_name);
    article.appendChild(location_name);
    article.appendChild(artists);
    article.appendChild(distance);

    return article;
}

function render_section(state, filtered) {
    const section_id = get_section_id(state);
    const max_tags = get_max_tags(state);
    const section = document.querySelector(section_id);
    section.replaceChildren();

    const page_start = state.current_page * PAGE_SIZE;
    const page_events = filtered.slice(page_start, page_start + PAGE_SIZE);

    if (page_events.length === 0) {
        const msg = document.createElement('p');
        msg.textContent = 'Aucune soirée pour le moment...';
        section.appendChild(msg);
    } else {
        for (let i = 0; i < page_events.length; i++) {
            section.appendChild(create_article(page_events[i], max_tags));
        }
    }

    const ctrl_id = section_id.replace('#', '') + '_pagination';
    let ctrl = document.getElementById(ctrl_id);
    if (!ctrl) {
        ctrl = document.createElement('div');
        ctrl.id = ctrl_id;
        ctrl.className = 'pagination';
        section.insertAdjacentElement('afterend', ctrl);
    }
    ctrl.replaceChildren();

    const has_prev = state.current_page > 0;
    const has_next = (state.current_page + 1) * PAGE_SIZE < filtered.length || !state.done;

    if (!has_prev && !has_next) return;

    const prev_btn = document.createElement('button');
    prev_btn.textContent = '← Précédent';
    prev_btn.disabled = !has_prev;
    prev_btn.setAttribute('aria-label', 'Page précédente');
    prev_btn.addEventListener('click', function () {
        navigate(state, -1);
    });

    const page_info = document.createElement('span');
    page_info.setAttribute('aria-live', 'polite');
    page_info.textContent = 'Page ' + (state.current_page + 1);

    const next_btn = document.createElement('button');
    next_btn.textContent = 'Suivant →';
    next_btn.disabled = !has_next;
    next_btn.setAttribute('aria-label', 'Page suivante');
    next_btn.addEventListener('click', function () {
        navigate(state, 1);
    });

    ctrl.appendChild(prev_btn);
    ctrl.appendChild(page_info);
    ctrl.appendChild(next_btn);
}

async function navigate(state, delta) {
    if (state.navigating) return;
    state.navigating = true;

    try {
        const new_page = state.current_page + delta;
        if (new_page < 0) return;

        const query = search_input.value;
        let current_filtered = get_filtered(state);

        if (delta > 0) {
            const page_start = new_page * PAGE_SIZE;

            if (page_start >= current_filtered.length) {
                if (state.done) return;
                await fetch_next_page(state);
                save_to_cache(state.type, state);
                current_filtered = filter_by_categories(filter_events(state.loaded, query), selected_categories);
                set_filtered(state, current_filtered);
                if (page_start >= current_filtered.length) return;
            }

            const preload_start = (new_page + 1) * PAGE_SIZE;
            if (preload_start >= current_filtered.length && !state.done && !state.fetching) {
                fetch_next_page(state).then(function () {
                    save_to_cache(state.type, state);
                    const q = search_input.value;
                    set_filtered(state, filter_by_categories(filter_events(state.loaded, q), selected_categories));
                });
            }
        }

        state.current_page = new_page;
        render_section(state, current_filtered);
    } finally {
        state.navigating = false;
    }
}

function filter_events(events, query) {
    const q = query.toLowerCase().trim();
    if (q === '') return events;

    const results = [];
    for (let i = 0; i < events.length; i++) {
        const event = events[i];
        const in_name = event.name.toLowerCase().includes(q);
        const in_description = event.description.toLowerCase().includes(q);
        const in_address = event.address.toLowerCase().includes(q);

        let in_tags = false;
        for (let j = 0; j < event.tags.length; j++) {
            if (event.tags[j].toLowerCase().includes(q)) {
                in_tags = true;
                break;
            }
        }

        if (in_name || in_description || in_address || in_tags) results.push(event);
    }
    return results;
}

function filter_by_categories(events, categories) {
    if (categories.length === 0) return events;
    return events.filter(function (event) {
        return categories.some(function (category) {
            return event.tags.some(function (tag) {
                return tag.toLowerCase() === category.toLowerCase();
            });
        });
    });
}

function apply_filters() {
    const query = search_input.value;

    if (week_state) {
        filtered_week = filter_by_categories(filter_events(week_state.loaded, query), selected_categories);
        week_state.current_page = 0;
        render_section(week_state, filtered_week);
    }

    if (month_state) {
        filtered_month = filter_by_categories(filter_events(month_state.loaded, query), selected_categories);
        month_state.current_page = 0;
        render_section(month_state, filtered_month);
    }
}

function load_categories() {
    try {
        const saved = localStorage.getItem(CATEGORIES_KEY);
        return saved ? JSON.parse(saved) : [...DEFAULT_CATEGORIES];
    } catch (e) {
        return [...DEFAULT_CATEGORIES];
    }
}

function save_categories() {
    const buttons = document.querySelectorAll('#categories button:not(#add_categories, #all_categories)');
    const labels = Array.from(buttons, function (b) { return b.querySelector('span:first-child').textContent.trim(); });
    localStorage.setItem(CATEGORIES_KEY, JSON.stringify(labels));
}

function create_category_button(label) {
    const btn = document.createElement('button');
    btn.innerHTML = '<span>' + label + '</span><span class="cat_delete">x</span>';
    btn.setAttribute('aria-pressed', 'false');
    return btn;
}

let add_btn = document.getElementById('add_categories');
let search_input = document.querySelector('.search_bar input');

let selected_categories = [];

search_input.addEventListener('input', apply_filters);

function init_categories() {
    load_categories().forEach(function (label) {
        add_btn.insertAdjacentElement('beforebegin', create_category_button(label));
    });
}

async function load_events() {
    const now = new Date();

    const week_start = new Date(now);
    const week_end = new Date(now);
    week_end.setDate(week_end.getDate() + 7);

    const month_start = new Date(now);
    month_start.setDate(month_start.getDate() + 7);
    const month_end = new Date(now);
    month_end.setDate(month_end.getDate() + 31 + 7);

    week_state = create_state(week_start, week_end, 'week');
    month_state = create_state(month_start, month_end, 'month');

    const week_cached = load_from_cache('week');
    if (week_cached) {
        week_state.loaded = week_cached.loaded;
        week_state.next_after = week_cached.next_after;
        week_state.done = week_cached.done;
        week_state.fetched = true;
        apply_filters();
    } else {
        await fetch_next_page(week_state);
        apply_filters();
        if (!week_state.done) {
            await fetch_next_page(week_state);
            apply_filters();
        }
        save_to_cache('week', week_state);
    }

    const month_cached = load_from_cache('month');
    if (month_cached) {
        month_state.loaded = month_cached.loaded;
        month_state.next_after = month_cached.next_after;
        month_state.done = month_cached.done;
        month_state.fetched = true;
        apply_filters();
    } else {
        await fetch_next_page(month_state);
        apply_filters();
        if (!month_state.done) {
            await fetch_next_page(month_state);
            apply_filters();
        }
        save_to_cache('month', month_state);
    }
}

// l'agenda OpenAgenda affiché, modifiable depuis le bouton "Changer de ville"
const saved_city = localStorage.getItem(CITY_KEY);
if (saved_city) {
    document.getElementById('city_name').textContent = saved_city;
}

load_events();
init_categories();

const change_city_button = document.getElementById('change_city_button');
const city_form = document.getElementById('city_form');

change_city_button.addEventListener('click', function () {
    const is_hidden = city_form.hasAttribute('hidden');
    if (is_hidden) {
        city_form.removeAttribute('hidden');
        change_city_button.setAttribute('aria-expanded', 'true');
        document.getElementById('agenda_input').value = get_agenda_uid();
        document.getElementById('city_input').focus();
    } else {
        city_form.setAttribute('hidden', '');
        change_city_button.setAttribute('aria-expanded', 'false');
    }
});

city_form.addEventListener('submit', function (e) {
    e.preventDefault();

    const city = document.getElementById('city_input').value.trim();
    const agenda = document.getElementById('agenda_input').value.trim();

    if (agenda) {
        localStorage.setItem(AGENDA_KEY, agenda);
    }
    if (city) {
        localStorage.setItem(CITY_KEY, city);
        document.getElementById('city_name').textContent = city;
    }

    city_form.setAttribute('hidden', '');
    change_city_button.setAttribute('aria-expanded', 'false');

    localStorage.removeItem(get_cache_key('week'));
    localStorage.removeItem(get_cache_key('month'));
    load_events();
});

document.getElementById('categories').addEventListener('click', function (e) {
    const btn = e.target.closest('button');
    if (!btn || btn.id === 'add_categories') return;

    if (e.target.classList.contains('cat_delete')) {
        const label = btn.querySelector('span:first-child').textContent.trim();
        selected_categories = selected_categories.filter(function (c) { return c !== label; });
        btn.remove();
        save_categories();
        apply_filters();
        return;
    }

    const label = btn.querySelector('span:first-child').textContent.trim();

    if (label === 'Tout') {
        selected_categories = [];
    } else if (selected_categories.includes(label)) {
        selected_categories = selected_categories.filter(function (c) { return c !== label; });
    } else {
        selected_categories.push(label);
    }

    document.querySelectorAll('#categories button:not(#add_categories)').forEach(function (b) {
        const l = b.querySelector('span:first-child').textContent.trim();
        const is_selected = l === 'Tout' ? selected_categories.length === 0 : selected_categories.includes(l);
        b.classList.toggle('selected_category', is_selected);
        b.setAttribute('aria-pressed', is_selected ? 'true' : 'false');
    });

    apply_filters();
});

add_btn.addEventListener('click', function () {
    const existing_input = document.getElementById('category_input');
    if (existing_input) {
        existing_input.focus();
        return;
    }

    const input = document.createElement('input');
    input.id = 'category_input';
    input.type = 'text';
    input.placeholder = 'Catégorie...';
    add_btn.insertAdjacentElement('beforebegin', input);
    input.focus();

    function confirm() {
        const value = input.value.trim();
        if (value) {
            const btn = create_category_button(value);
            input.replaceWith(btn);
            save_categories();
        } else {
            input.remove();
        }
    }

    input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') confirm();
        if (e.key === 'Escape') input.remove();
    });

    input.addEventListener('blur', confirm);
});
