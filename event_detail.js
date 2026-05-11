function get_env() {
    return "ac66f3b9b442471f910d96310b7ba181";
}

const AGENDA_UID = 14115607;

async function get_event(event_id) {
    const params = new URLSearchParams({
        key: get_env(),
        includeLabels: 1,
    });

    const response = await fetch(`https://api.openagenda.com/v2/agendas/${AGENDA_UID}/events/${event_id}?${params}`);
    const data = await response.json();
    return data.event;
}

function format_date(iso) {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString('fr-FR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

function render_event(event) {
    const tags = (event.keywords?.fr || (event.categories || []).map(c => c.label?.fr))
        .map(t => t?.replace(/\n/g, ' ').trim())
        .filter(Boolean);

    const title = event.title?.fr || event.title?.en || '';
    const description = event.longDescription?.fr || event.description?.fr || event.description?.en || '';
    const address = event.location?.address || '';
    const start_date = event.firstTiming?.begin || null;
    const end_date = event.lastTiming?.end || null;
    const image = event.image ? event.image.base + event.image.filename : null;

    document.title = `VillaNova - ${title}`;

    const event_title = document.getElementById('event_title');
    event_title.textContent = title;

    const event_description = document.getElementById('event_description');
    event_description.textContent = description;

    const event_address = document.getElementById('event_address');
    event_address.textContent = address;

    const event_dates = document.getElementById('event_dates');
    event_dates.textContent = `${format_date(start_date)}${end_date ? ' → ' + format_date(end_date) : ''}`;

    const event_image = document.getElementById('event_image');
    if (image) {
        event_image.src = image;
        event_image.alt = title;
        event_image.hidden = false;
    }

    const event_tags = document.getElementById('event_tags');
    tags.forEach(tag => {
        const span = document.createElement('span');
        span.textContent = tag;
        event_tags.appendChild(span);
    });
}

const params = new URLSearchParams(window.location.search);
const event_id = params.get('id');

if (event_id) {
    get_event(event_id)
        .then(event => render_event(event))
        .catch(err => console.error('Failed to load event:', err));
}
