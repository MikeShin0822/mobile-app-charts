const COUNTRIES = [
  ['KR', '한국', '🇰🇷'], ['US', '미국', '🇺🇸'], ['JP', '일본', '🇯🇵'],
  ['CN', '중국', '🇨🇳'], ['FR', '프랑스', '🇫🇷'], ['AU', '호주', '🇦🇺'], ['DE', '독일', '🇩🇪'],
];
const COUNTRY = Object.fromEntries(COUNTRIES.map(([code, name, flag]) => [code, { code, name, flag }]));
const STORE_LABEL = { apple: 'Apple App Store', google: 'Google Play' };
const STORE_SHORT = { apple: 'App Store', google: 'Google Play' };
const $ = id => document.getElementById(id);
const D = {
  store: $('store'), country: $('country'), category: $('category'), date: $('date'),
  metrics: $('metrics'), content: $('content'), notice: $('notice'), updated: $('updated'),
};
let snapshots = [];
let view = 'country';

const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[char]));
const attr = value => esc(value).replace(/`/g, '&#96;');
const formatDate = value => {
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric', month: 'long', day: 'numeric',
  }).format(date);
};
const verified = source => source?.status === 'verified';

function normalize(raw, metadata = {}) {
  const records = Array.isArray(raw.records) ? raw.records.map(record => ({
    ...record,
    chartType: 'games',
    store: String(record.store || '').toLowerCase(),
    country: String(record.country || '').toUpperCase(),
    rank: Number(record.rank),
    title: String(record.title || record.originalTitle || '').trim(),
    originalTitle: String(record.originalTitle || record.title || '').trim(),
    category: String(record.category || (record.store === 'apple' ? '미확인' : '게임')).trim(),
    description: String(record.description || '공식 설명 미확인').trim(),
    appId: String(record.appId || '').trim(),
    url: String(record.url || '').trim(),
    icon: String(record.icon || '').trim(),
  })).filter(record => record.title && ['apple', 'google'].includes(record.store) &&
    COUNTRY[record.country] && Number.isFinite(record.rank)) : [];
  return { ...raw, date: String(raw.date || metadata.date || ''), records, sources: raw.sources || {} };
}

async function load() {
  try {
    const response = await fetch('./data/games/index.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(`게임 스냅샷 목록 ${response.status}`);
    const index = await response.json();
    const loaded = await Promise.allSettled((index.snapshots || []).map(async metadata => {
      const file = new URL(String(metadata.file).replace(/^\.\//, ''), document.baseURI);
      const result = await fetch(file, { cache: 'no-store' });
      if (!result.ok) throw new Error(`${metadata.file} ${result.status}`);
      return normalize(await result.json(), metadata);
    }));
    snapshots = loaded.filter(result => result.status === 'fulfilled')
      .map(result => result.value)
      .sort((a, b) => a.date.localeCompare(b.date));
    if (!snapshots.length) throw new Error('유효한 게임 스냅샷이 없습니다.');
    initialize();
    render();
  } catch (error) {
    console.error(error);
    D.updated.textContent = '데이터 로드 실패';
    D.notice.innerHTML = `<strong>게임 차트를 불러오지 못했습니다.</strong> ${esc(error.message)}`;
    D.content.innerHTML = empty('게임 데이터 로드 실패', 'data/games/index.json과 스냅샷 경로를 확인해 주세요.');
  }
}

function initialize() {
  D.country.innerHTML = COUNTRIES.map(([code, name, flag]) =>
    `<option value="${code}">${flag} ${name}</option>`).join('');
  D.date.innerHTML = [...snapshots].reverse().map(snapshot =>
    `<option value="${snapshot.date}">${formatDate(snapshot.date)}</option>`).join('');
  D.date.value = snapshots.at(-1).date;
  const query = new URLSearchParams(location.search);
  if (['country', 'weekly', 'monthly', 'category', 'coverage'].includes(query.get('view'))) view = query.get('view');
  if (['apple', 'google'].includes(query.get('store'))) D.store.value = query.get('store');
  if (COUNTRY[query.get('country')]) D.country.value = query.get('country');
  if (snapshots.some(snapshot => snapshot.date === query.get('date'))) D.date.value = query.get('date');
  document.querySelectorAll('.tabs button').forEach(button => button.addEventListener('click', () => {
    view = button.dataset.view;
    render();
    D.content.focus({ preventScroll: true });
  }));
  [D.store, D.country, D.category, D.date].forEach(control => control.addEventListener('change', render));
}

const currentSnapshot = () => snapshots.find(snapshot => snapshot.date === D.date.value) || snapshots.at(-1);
const source = (snapshot, store = D.store.value, country = D.country.value) =>
  snapshot.sources?.[`${store}-${country}`];
const stableKey = record => `${record.store}|${record.country}|${record.appId || record.originalTitle.toLowerCase()}`;

function rows(snapshot, {
  store = D.store.value,
  country = D.country.value,
  category = 'all',
} = {}) {
  let result = snapshot.records.filter(record => record.store === store);
  if (country) result = result.filter(record => record.country === country);
  if (category !== 'all') result = result.filter(record => record.category === category);
  return result.sort((a, b) => a.rank - b.rank || a.title.localeCompare(b.title));
}

function categoryCounts(records) {
  const counts = new Map();
  records.forEach(record => counts.set(record.category, (counts.get(record.category) || 0) + 1));
  return [...counts].map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'ko'));
}

function refreshCategories(snapshot) {
  const country = ['category', 'coverage'].includes(view) ? null : D.country.value;
  const categories = [...new Set(rows(snapshot, { country }).map(record => record.category))]
    .sort((a, b) => a.localeCompare(b, 'ko'));
  const previous = D.category.value;
  D.category.innerHTML = '<option value="all">전체</option>' + categories.map(category =>
    `<option value="${attr(category)}">${esc(category)}</option>`).join('');
  D.category.value = categories.includes(previous) ? previous : 'all';
}

function render() {
  const snapshot = currentSnapshot();
  refreshCategories(snapshot);
  document.querySelectorAll('.tabs button').forEach(button =>
    button.classList.toggle('active', button.dataset.view === view));
  D.country.disabled = ['category', 'coverage'].includes(view);
  D.category.disabled = view === 'coverage';
  D.updated.textContent = `${formatDate(snapshot.date)} · 게임 ${snapshot.records.length.toLocaleString('ko-KR')}개`;
  showNotice(snapshot);
  D.content.innerHTML = view === 'weekly' ? weeklyView(snapshot)
    : view === 'monthly' ? monthlyView(snapshot)
      : view === 'category' ? categoryView(snapshot)
        : view === 'coverage' ? coverageView(snapshot)
          : countryView(snapshot);
  const query = new URLSearchParams({
    view, store: D.store.value, country: D.country.value, date: D.date.value,
  });
  if (D.category.value !== 'all') query.set('category', D.category.value);
  history.replaceState(null, '', `${location.pathname}?${query}`);
}

function showNotice(snapshot) {
  const country = COUNTRY[D.country.value];
  const selectedSource = source(snapshot);
  const verifiedCountries = Object.values(snapshot.sources || {})
    .filter(item => item.store === D.store.value && verified(item)).length;
  if (verified(selectedSource)) {
    D.notice.innerHTML = `<strong>${country.flag} ${country.name} ${STORE_SHORT[D.store.value]} 공식 무료 게임 TOP 25 수집 완료.</strong> ${formatDate(snapshot.date)} 스냅샷이며 ${verifiedCountries}/7개국 게임 차트가 검증되었습니다.`;
  } else {
    D.notice.innerHTML = `<strong>${country.flag} ${country.name} ${STORE_SHORT[D.store.value]} 게임 차트 확인 불가.</strong> ${esc(selectedSource?.note || '공식 페이지에서 정확한 순위를 확인하지 못했습니다.')} 추정값으로 보완하지 않았습니다.`;
  }
}

function metricCards(snapshot, records, options = {}) {
  const verifiedCountries = Object.values(snapshot.sources || {})
    .filter(item => item.store === D.store.value && verified(item)).length;
  const allStoreRows = rows(snapshot, { country: null });
  const categories = new Set(records.map(record => record.category)).size;
  const top = records[0];
  const metrics = [
    ['공식 수집 국가', `${verifiedCountries} / 7`, `${STORE_SHORT[D.store.value]} 무료 게임 차트`],
    [options.countLabel || '수집된 순위', String(options.count ?? records.length), options.countHint || `전체 ${allStoreRows.length}개 게임`],
    ['게임 장르', String(categories), D.category.value === 'all' ? '현재 선택 범위' : D.category.value],
    [options.topLabel || '현재 1위', options.top || top?.title || '확인 불가', options.topHint || top?.category || '공식 데이터 없음'],
  ];
  D.metrics.innerHTML = metrics.map(metric => `<article class="metric"><small>${esc(metric[0])}</small><b title="${attr(metric[1])}">${esc(metric[1])}</b><em>${esc(metric[2])}</em></article>`).join('');
}

function countryView(snapshot) {
  const all = rows(snapshot);
  const filtered = rows(snapshot, { category: D.category.value });
  const selectedSource = source(snapshot);
  const country = COUNTRY[D.country.value];
  metricCards(snapshot, filtered);
  if (!filtered.length) return empty(`${country.name} ${STORE_SHORT[D.store.value]} 게임 순위를 확인할 수 없습니다.`, '공식 게임 차트에서 검증 가능한 TOP 25 데이터가 없습니다.');
  return `<div class="main-grid"><section class="card"><div class="card-head"><div><h2>${country.flag} ${country.name} · ${STORE_LABEL[D.store.value]}</h2><p>${formatDate(snapshot.date)} · 공식 무료 게임 TOP 25</p></div><span class="status ${verified(selectedSource) ? 'ok' : 'warn'}">${verified(selectedSource) ? '검증 완료' : '확인 불가'}</span></div>${topThree(filtered)}${gameTable(filtered)}</section><aside class="stack"><section class="card"><div class="card-head"><div><h2>게임 장르 분포</h2><p>현재 TOP 25 구성</p></div></div><div class="body">${bars(all)}</div></section>${sourceCard(selectedSource, country, snapshot)}</aside></div>`;
}

function weeklyView(snapshot) {
  const current = rows(snapshot, { category: D.category.value });
  const index = snapshots.findIndex(item => item.date === snapshot.date);
  const previous = index > 0 ? snapshots[index - 1] : null;
  const previousRanks = new Map((previous ? rows(previous, { category: 'all' }) : [])
    .map(record => [stableKey(record), record.rank]));
  const changes = new Map(current.map(record => [
    stableKey(record), previousRanks.has(stableKey(record)) ? previousRanks.get(stableKey(record)) - record.rank : null,
  ]));
  const rising = current.map(record => ({ ...record, change: changes.get(stableKey(record)) }))
    .filter(record => record.change > 0).sort((a, b) => b.change - a.change).slice(0, 8);
  const fresh = current.filter(record => changes.get(stableKey(record)) == null).slice(0, 8);
  metricCards(snapshot, current, {
    countLabel: '비교 게임', count: current.length,
    countHint: previous ? `${formatDate(previous.date)} 대비` : '첫 게임 스냅샷',
    topLabel: '최대 상승', top: rising[0]?.title || (previous ? '상승 없음' : '기준점'),
    topHint: rising[0] ? `▲${rising[0].change}계단` : '다음 수집부터 계산',
  });
  if (!current.length) return empty('주간 게임 비교 데이터가 없습니다.', '선택한 국가와 스토어의 공식 게임 순위를 먼저 수집해야 합니다.');
  return `<div class="two-grid"><section class="card"><div class="card-head"><div><h2>주간 게임 순위</h2><p>${previous ? `${formatDate(previous.date)} 대비` : '첫 게임 스냅샷'}</p></div></div>${gameTable(current, { changes })}</section><div class="stack">${listCard('상승 게임', '지난 스냅샷보다 오른 게임', rising.map(record => [record.title, `#${record.rank} · ${record.category}`, `▲${record.change}`]))}${listCard('신규·재진입', '이전 TOP 25에 없던 게임', fresh.map(record => [record.title, `#${record.rank} · ${record.category}`, 'NEW']))}</div></div>`;
}

function monthlyView(snapshot) {
  const month = snapshot.date.slice(0, 7);
  const monthSnapshots = snapshots.filter(item => item.date.startsWith(month) && item.date <= snapshot.date);
  const aggregate = new Map();
  monthSnapshots.forEach(item => rows(item, { category: D.category.value }).forEach(record => {
    const key = stableKey(record);
    const value = aggregate.get(key) || { ...record, ranks: [] };
    value.ranks.push(record.rank);
    value.latestRank = record.rank;
    aggregate.set(key, value);
  }));
  const result = [...aggregate.values()].map(record => ({
    ...record,
    rank: record.latestRank,
    average: record.ranks.reduce((sum, rank) => sum + rank, 0) / record.ranks.length,
  })).sort((a, b) => a.average - b.average);
  metricCards(snapshot, result, {
    countLabel: '월간 표본', count: monthSnapshots.length,
    countHint: `${month} 누적 게임 스냅샷`,
    topLabel: '월 평균 1위', top: result[0]?.title || '확인 불가',
    topHint: result[0] ? `평균 ${result[0].average.toFixed(1)}위` : '월간 데이터 없음',
  });
  if (!result.length) return empty('월간 게임 데이터가 없습니다.', '해당 월에 공식 게임 스냅샷이 없습니다.');
  return `<div class="two-grid"><section class="card"><div class="card-head"><div><h2>${month} 월간 게임 순위</h2><p>${monthSnapshots.length}개 스냅샷 평균</p></div></div>${gameTable(result, { averages: true, trends: true })}</section>${listCard('월간 지속 노출', 'TOP 25에 자주 등장한 게임', [...result].sort((a, b) => b.ranks.length - a.ranks.length || a.average - b.average).slice(0, 10).map(record => [record.title, `평균 ${record.average.toFixed(1)}위`, `${record.ranks.length}회`]))}</div>`;
}

function categoryView(snapshot) {
  const all = rows(snapshot, { country: null, category: D.category.value });
  const distribution = categoryCounts(rows(snapshot, { country: null }));
  const selected = D.category.value;
  metricCards(snapshot, all, {
    countLabel: '7개국 게임', count: all.length,
    countHint: selected === 'all' ? '전체 장르' : selected,
    topLabel: '최대 장르', top: distribution[0]?.name || '확인 불가',
    topHint: distribution[0] ? `${distribution[0].count}개 차트 슬롯` : '데이터 없음',
  });
  return `<div class="two-grid"><section class="card"><div class="card-head"><div><h2>7개국 게임 장르 구성</h2><p>${STORE_LABEL[D.store.value]} · ${formatDate(snapshot.date)}</p></div></div><div class="body">${bars(rows(snapshot, { country: null }))}</div></section><section class="card"><div class="card-head"><div><h2>${selected === 'all' ? '전체 장르 게임' : esc(selected)}</h2><p>국가별 TOP 25 차트 슬롯</p></div></div>${all.length ? gameTable(all.slice(0, 100), { country: true }) : empty('표시할 게임 없음', '선택한 장르의 게임이 없습니다.')}</section></div>`;
}

function coverageView(snapshot) {
  const sources = Object.values(snapshot.sources || {}).filter(item => item.store === D.store.value);
  const verifiedCount = sources.filter(verified).length;
  const collected = rows(snapshot, { country: null }).length;
  const descriptions = sources.reduce((sum, item) => sum + Number(item.descriptionQuality?.verified || 0), 0);
  metricCards(snapshot, rows(snapshot, { country: null }), {
    countLabel: '검증 게임', count: collected, countHint: `${verifiedCount}/7개국 차트`,
    topLabel: '공식 설명', top: `${descriptions} / ${collected}`, topHint: '상세 페이지 기준',
  });
  return `<section class="card"><div class="card-head"><div><h2>${STORE_LABEL[D.store.value]} 게임 수집 상태</h2><p>${formatDate(snapshot.date)} · 공식 게임 차트와 상세정보</p></div></div><div class="coverage-grid">${COUNTRIES.map(([code]) => {
    const item = snapshot.sources?.[`${D.store.value}-${code}`];
    const country = COUNTRY[code];
    return `<article class="source"><div><b>${country.flag} ${country.name}</b><span class="status ${verified(item) ? 'ok' : 'warn'}">${verified(item) ? 'verified' : 'unavailable'}</span></div><p>${esc(item?.note || '공식 게임 차트 확인 불가')}</p><p class="quality-note">설명 ${item?.descriptionQuality?.verified ?? 0}/25${item?.categoryQuality ? ` · 장르 ${item.categoryQuality.verified}/25` : ''}</p>${item?.url ? `<a href="${attr(item.url)}" target="_blank" rel="noreferrer">공식 출처 ↗</a>` : ''}</article>`;
  }).join('')}</div></section>`;
}

function topThree(records) {
  return `<div class="top3">${records.slice(0, 3).map(record => `<article class="topapp"><i>#${record.rank}</i><b>${esc(record.title)}</b><span>${esc(record.category)}</span></article>`).join('')}</div>`;
}

function gameTable(records, { changes = null, country = false, averages = false, trends = false } = {}) {
  return `<div class="table-wrap"><table><thead><tr><th>순위</th><th>게임</th><th>장르</th>${country ? '<th>국가</th>' : ''}${changes ? '<th>등락</th>' : ''}${averages ? '<th>월 평균</th>' : ''}${trends ? '<th>추이</th>' : ''}</tr></thead><tbody>${records.map(record => `<tr><td class="rank">#${record.rank ?? record.latestRank}</td><td class="app"><a class="game-app-link" href="${attr(record.url)}" target="_blank" rel="noreferrer"><img class="game-icon" src="${attr(record.icon)}" alt="" loading="lazy"><span class="game-copy"><b>${esc(record.title)}</b><small>${esc(record.description)}</small></span></a></td><td><span class="chip">${esc(record.category)}</span></td>${country ? `<td>${COUNTRY[record.country]?.flag || ''} ${COUNTRY[record.country]?.name || record.country}</td>` : ''}${changes ? `<td>${delta(changes.get(stableKey(record)))}</td>` : ''}${averages ? `<td class="rank">${record.average.toFixed(1)}</td>` : ''}${trends ? `<td>${spark(record.ranks)}</td>` : ''}</tr>`).join('')}</tbody></table></div>`;
}

function delta(value) {
  return value == null ? '<span class="delta new">NEW</span>'
    : value > 0 ? `<span class="delta up">▲ ${value}</span>`
      : value < 0 ? `<span class="delta down">▼ ${Math.abs(value)}</span>`
        : '<span class="delta">—</span>';
}

function spark(ranks) {
  if (!ranks?.length) return '—';
  return ranks.map(rank => `#${rank}`).join(' → ');
}

function bars(records) {
  const categories = categoryCounts(records);
  const max = Math.max(...categories.map(item => item.count), 1);
  if (!categories.length) return '<p>장르 데이터가 없습니다.</p>';
  return `<div class="bars">${categories.map(item => `<div class="bar"><div><b>${esc(item.name)}</b><span>${item.count}</span></div><i><em style="width:${Math.round(item.count / max * 100)}%"></em></i></div>`).join('')}</div>`;
}

function sourceCard(item, country, snapshot) {
  return `<section class="card"><div class="card-head"><div><h2>공식 출처</h2><p>${country.flag} ${country.name} · ${formatDate(snapshot.date)}</p></div></div><div class="body"><p>${esc(item?.note || '공식 게임 차트 확인 불가')}</p><p class="quality-note">설명 ${item?.descriptionQuality?.verified ?? 0}/25${item?.categoryQuality ? ` · 장르 ${item.categoryQuality.verified}/25` : ''}</p>${item?.url ? `<a href="${attr(item.url)}" target="_blank" rel="noreferrer">공식 게임 차트 열기 ↗</a>` : ''}</div></section>`;
}

function listCard(title, subtitle, items) {
  return `<section class="card"><div class="card-head"><div><h2>${esc(title)}</h2><p>${esc(subtitle)}</p></div></div><ul class="list">${items.length ? items.map(item => `<li><div><b>${esc(item[0])}</b><span>${esc(item[1])}</span></div><strong>${esc(item[2])}</strong></li>`).join('') : '<li><div><b>표시할 항목 없음</b><span>다음 게임 스냅샷에서 자동 계산됩니다.</span></div><strong>—</strong></li>'}</ul></section>`;
}

function empty(title, message) {
  return `<section class="empty"><h2>${esc(title)}</h2><p>${esc(message)}</p></section>`;
}

load();
