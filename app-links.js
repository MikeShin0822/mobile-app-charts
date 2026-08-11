(() => {
  const COUNTRIES = [
    ['KR', '한국', '🇰🇷'],
    ['US', '미국', '🇺🇸'],
    ['JP', '일본', '🇯🇵'],
    ['CN', '중국', '🇨🇳'],
    ['FR', '프랑스', '🇫🇷'],
    ['AU', '호주', '🇦🇺'],
    ['DE', '독일', '🇩🇪'],
  ];
  const snapshots = new Map();
  let loading = null;
  let scheduled = false;
  let decorating = false;

  const safeUrl = value => {
    try {
      const url = new URL(String(value || ''));
      return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
    } catch {
      return '';
    }
  };

  const clean = value => String(value || '').replace(/\s+/g, ' ').trim();

  async function loadSnapshots() {
    if (loading) return loading;
    loading = (async () => {
      const indexResponse = await fetch('./data/index.json', { cache: 'no-store' });
      if (!indexResponse.ok) throw new Error(`data/index.json ${indexResponse.status}`);
      const index = await indexResponse.json();
      const results = await Promise.allSettled(
        (index.snapshots || []).map(async meta => {
          const response = await fetch(
            new URL(String(meta.file).replace(/^\.\//, ''), document.baseURI),
            { cache: 'no-store' },
          );
          if (!response.ok) throw new Error(`${meta.file} ${response.status}`);
          const snapshot = await response.json();
          snapshots.set(String(snapshot.date || meta.date), snapshot);
        }),
      );
      const failed = results.filter(result => result.status === 'rejected');
      if (failed.length) console.warn('Some icon/link snapshots could not be loaded.', failed);
    })().catch(error => {
      console.error('App icon/link enhancement failed to load data.', error);
    });
    return loading;
  }

  function selectedDate() {
    return document.getElementById('date')?.value || [...snapshots.keys()].sort().at(-1);
  }

  function selectedStore() {
    return document.getElementById('store')?.value || 'apple';
  }

  function selectedCountry() {
    return document.getElementById('country')?.value || 'KR';
  }

  function activeView() {
    return document.querySelector('.tabs button.active')?.dataset.view || 'country';
  }

  function recordPool() {
    const orderedDates = [...snapshots.keys()].sort().reverse();
    const selected = selectedDate();
    if (selected && orderedDates.includes(selected)) {
      orderedDates.splice(orderedDates.indexOf(selected), 1);
      orderedDates.unshift(selected);
    }
    return orderedDates.flatMap(date => snapshots.get(date)?.records || []);
  }

  function countryFromRow(row) {
    if (activeView() !== 'category') return selectedCountry();
    const text = clean(row.cells?.[3]?.textContent);
    for (const [code, name, flag] of COUNTRIES) {
      if (text.includes(flag) || text.includes(name)) return code;
    }
    return '';
  }

  function findRecord({ title, rank, country }) {
    const store = selectedStore();
    const normalizedTitle = clean(title);
    const candidates = recordPool().filter(
      record =>
        record.store === store &&
        (!country || record.country === country) &&
        clean(record.title) === normalizedTitle,
    );
    return (
      candidates.find(record => Number(record.rank) === Number(rank)) ||
      candidates[0] ||
      null
    );
  }

  function iconElement(record, size = 'normal') {
    const url = safeUrl(record?.icon);
    const title = clean(record?.title || '?');
    const initial = title.charAt(0).toUpperCase() || '?';

    if (!url) {
      const fallback = document.createElement('span');
      fallback.className = `app-icon app-icon--${size} app-icon--fallback`;
      fallback.setAttribute('aria-hidden', 'true');
      fallback.textContent = initial;
      return fallback;
    }

    const image = document.createElement('img');
    image.className = `app-icon app-icon--${size}`;
    image.src = url;
    image.alt = `${title} 앱 아이콘`;
    image.loading = 'lazy';
    image.decoding = 'async';
    image.referrerPolicy = 'no-referrer';
    image.addEventListener(
      'error',
      () => {
        const fallback = document.createElement('span');
        fallback.className = `app-icon app-icon--${size} app-icon--fallback`;
        fallback.setAttribute('aria-hidden', 'true');
        fallback.textContent = initial;
        image.replaceWith(fallback);
      },
      { once: true },
    );
    return image;
  }

  function linkTitle(node, record, className) {
    if (!node || node.dataset.storeLinked === 'true') return;
    const url = safeUrl(record?.url);
    if (!url) return;

    const title = clean(node.textContent);
    const link = document.createElement('a');
    link.className = className;
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.setAttribute('aria-label', `${title} 공식 스토어 페이지 열기`);
    link.append(document.createTextNode(title));

    const arrow = document.createElement('span');
    arrow.className = 'link-arrow';
    arrow.setAttribute('aria-hidden', 'true');
    arrow.textContent = '↗';
    link.append(arrow);

    node.replaceChildren(link);
    node.dataset.storeLinked = 'true';
  }

  function iconLink(record, icon, className = 'icon-link') {
    const url = safeUrl(record?.url);
    if (!url) return icon;
    const link = document.createElement('a');
    link.className = className;
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.setAttribute('aria-label', `${clean(record.title)} 공식 스토어 페이지 열기`);
    link.append(icon);
    return link;
  }

  function decorateTableRow(row) {
    if (row.dataset.storeDecorated === 'true') return;
    const cell = row.querySelector('td.app');
    const titleNode = cell?.querySelector('b');
    const rank = Number(clean(row.querySelector('td.rank')?.textContent).replace(/[^\d]/g, ''));
    if (!cell || !titleNode) return;

    const record = findRecord({
      title: titleNode.textContent,
      rank,
      country: countryFromRow(row),
    });
    if (!record) return;

    const copy = document.createElement('div');
    copy.className = 'app-copy';
    while (cell.firstChild) copy.append(cell.firstChild);

    const layout = document.createElement('div');
    layout.className = 'app-cell';
    layout.append(iconLink(record, iconElement(record)), copy);
    cell.append(layout);

    linkTitle(copy.querySelector('b'), record, 'app-link');
    row.dataset.storeDecorated = 'true';
  }

  function decorateTopCard(card) {
    if (card.dataset.storeDecorated === 'true') return;
    const rank = Number(clean(card.querySelector('i')?.textContent).replace(/[^\d]/g, ''));
    const titleNode = card.querySelector('b');
    const category = card.querySelector(':scope > span');
    if (!titleNode) return;

    const record = findRecord({
      title: titleNode.textContent,
      rank,
      country: selectedCountry(),
    });
    if (!record) return;

    const body = document.createElement('div');
    body.className = 'topapp-body';
    const copy = document.createElement('div');
    copy.className = 'topapp-copy';
    copy.append(titleNode);
    if (category) copy.append(category);
    body.append(iconLink(record, iconElement(record, 'featured')), copy);
    card.append(body);

    linkTitle(titleNode, record, 'topapp-link');
    card.dataset.storeDecorated = 'true';
  }

  function decorateListItem(item) {
    if (item.dataset.storeDecorated === 'true') return;
    const content = item.querySelector(':scope > div');
    const titleNode = content?.querySelector('b');
    if (!content || !titleNode || titleNode.textContent === '표시할 항목 없음') return;

    const record = findRecord({
      title: titleNode.textContent,
      country: selectedCountry(),
    });
    if (!record) return;

    const copy = document.createElement('div');
    copy.className = 'list-copy';
    while (content.firstChild) copy.append(content.firstChild);

    content.className = 'list-entry';
    content.append(iconLink(record, iconElement(record, 'small')), copy);
    linkTitle(copy.querySelector('b'), record, 'list-link');
    item.dataset.storeDecorated = 'true';
  }

  async function decorate() {
    scheduled = false;
    if (decorating) return;
    decorating = true;
    try {
      await loadSnapshots();
      document.querySelectorAll('#content tbody tr').forEach(decorateTableRow);
      document.querySelectorAll('#content .topapp').forEach(decorateTopCard);
      document.querySelectorAll('#content .list > li').forEach(decorateListItem);
    } finally {
      decorating = false;
    }
  }

  function scheduleDecorate() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(decorate);
  }

  const observer = new MutationObserver(scheduleDecorate);
  const content = document.getElementById('content');
  if (content) observer.observe(content, { childList: true, subtree: true });

  ['store', 'country', 'category', 'date'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', scheduleDecorate);
  });
  document.querySelector('.tabs')?.addEventListener('click', scheduleDecorate);

  loadSnapshots().then(scheduleDecorate);
})();
