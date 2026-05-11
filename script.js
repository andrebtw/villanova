function get_env() {
    return "ac66f3b9b442471f910d96310b7ba181";
}

const AGENDA_UID = 14115607;
const CATEGORIES_KEY = "villanova_categories";
const DEFAULT_CATEGORIES = ["Exposition", "Electro"];
const REFRESH_SEC = 60 * 60 * 1000;


/* Open Agenda function to get the events */
async function fetch_events(start, end) {
    const url = "https://api.openagenda.com/v2/agendas/" + AGENDA_UID + "/events"
        + "?key=" + get_env()
        + "&timings[gte]=" + start.toISOString()
        + "&timings[lte]=" + end.toISOString()
        + "&includeLabels=1"
        + "&size=999";

    const response = await fetch(url);
    const data = await response.json();

    const events = [];

    for (let i = 0; i < data.events.length; i++) {
        const raw = data.events[i];

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
            const tag = raw_tags[j].replace(/\n/g, ' ').trim(); // remove new lines if there is
            if (tag !== '') {
                tags.push(tag);
            }
        }
        // events details formatted correctly for my html
        events.push({
            uid: raw.uid,
            name: name,
            start_date: start_date,
            end_date: end_date,
            address: address,
            image: image,
            tags: tags,
            description: description,
            artists: artists,
        });
    }

    return events;
}

async function get_cached_events(cache_key, fetch_fn) {
    try {
        const cached = localStorage.getItem(cache_key);
        if (cached) {
            const { timestamp, events } = JSON.parse(cached);
            if (Date.now() - timestamp < REFRESH_SEC) {
                return events;
            }
        }
    } catch (e) {
        console.log("Something happened when getting stuff from cache.");
        console.log(e);
    }

    const events = await fetch_fn();
    try {
        localStorage.setItem(cache_key, JSON.stringify({ timestamp: Date.now(), events }));
    } catch (e) {}
    return events;
}

async function get_next_week_events() {
    return get_cached_events("villanova_week_events", function () {
        const start = new Date();
        const end = new Date();
        end.setDate(start.getDate() + 7);
        return fetch_events(start, end);
    });
}

async function get_next_month_events() {
    return get_cached_events("villanova_month_events", function () {
        const start = new Date();
        start.setDate(start.getDate() + 7); // the month will be counted after the 7 days so no duplicate stuff
        const end = new Date();
        end.setDate(end.getDate() + 31 + 7); // again bcs i started at the 7+ day
        return fetch_events(start, end);
    });
}

function build_tags(event_types, tags, max_tags) {
    for (let i = 0; i < tags.length; i++) {
        if (max_tags !== null && i >= max_tags) {
            break;
        }
        const tag = tags[i];
        const span = document.createElement("span");
        if (tag.length > 10) {
            span.textContent = tag.slice(0, 10) + "...";
        } else {
            span.textContent = tag;
        }
        event_types.appendChild(span);
    }
}

function create_article(event, max_tags) {
    const article = document.createElement("article");
    article.style.cursor = 'pointer';

    article.addEventListener('click', function () {
        window.location.href = 'event_detail.html?id=' + event.uid;
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

function render_events(section_id, events, max_tags) {
    const section = document.querySelector(section_id);
    section.replaceChildren();

    if (events.length == 0) {
        const message = document.createElement('p');
        message.textContent = 'There are no parties...';
        section.appendChild(message);
        return;
    }

    for (let i = 0; i < events.length; i++) {
        section.appendChild(create_article(events[i], max_tags));
    }
}

function filter_events(events, query) {
    const q = query.toLowerCase().trim();

    if (q == '') {
        return events;
    }

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
            }
        }

        if (in_name || in_description || in_address || in_tags) {
            results.push(event);
        }
    }

    return results;
}

function filter_by_categories(events, categories) {
    if (categories.length == 0)
        return events;
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
    const week = filter_by_categories(filter_events(all_week_events, query), selected_categories);
    const month = filter_by_categories(filter_events(all_month_events, query), selected_categories);
    render_events('#next_7_days_section', week, 3);
    render_events('#next_month_section', month, null);
}

function load_categories() {
    try {
        const saved = localStorage.getItem(CATEGORIES_KEY);
        return saved ? JSON.parse(saved) : [...DEFAULT_CATEGORIES];
    }
    catch (e) {
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
    return btn;
}

let add_btn = document.getElementById('add_categories');
let search_input = document.querySelector('.search_bar input');


let all_week_events = [];
let all_month_events = [];
let selected_categories = [];

search_input.addEventListener('input', apply_filters);


function init_categories() {
    load_categories().forEach(function (label) {
        add_btn.insertAdjacentElement('beforebegin', create_category_button(label));
    });
}

get_next_week_events().then(function (events) {
    all_week_events = events;
    apply_filters();
});

get_next_month_events().then(function (events) {
    all_month_events = events;
    apply_filters();
});


init_categories();

document.getElementById('categories').addEventListener('click', function (e) {
    const btn = e.target.closest('button');
    if (!btn || btn.id === 'add_categories')
        return ;

    if (e.target.classList.contains('cat_delete')) {
        const label = btn.querySelector('span:first-child').textContent.trim();
        selected_categories = selected_categories.filter(function (c) { return c !== label; });
        btn.remove();
        save_categories();
        apply_filters();
        return ;
    }

    const label = btn.querySelector('span:first-child').textContent.trim();

    if (label === 'All') {
        selected_categories = [];
    } 
    else if (selected_categories.includes(label)) {
        selected_categories = selected_categories.filter(function (c) { return c !== label; });
    } 
    else {
        selected_categories.push(label);
    }

    document.querySelectorAll('#categories button:not(#add_categories)').forEach(function (b) {
        const l = b.querySelector('span:first-child').textContent.trim();
        b.classList.toggle('selected_category', l === 'All' ? selected_categories.length === 0 : selected_categories.includes(l));
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
    input.placeholder = 'Category...';
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
