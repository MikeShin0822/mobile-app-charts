const COUNTRY_NAMES = {KR:"한국",US:"미국",JP:"일본",CN:"중국",FR:"프랑스",AU:"호주",DE:"독일"};
let snapshots = [];
let currentView = "country";

const $ = (id) => document.getElementById(id);
const storeFilter = $("storeFilter");
const countryFilter = $("countryFilter");
const categoryFilter = $("categoryFilter");
const dateFilter = $("dateFilter");

async function loadData() {
  const index = await fetch("data/index.json").then(r => r.json());
  snapshots = await Promise.all(index.snapshots.map(s => fetch(s.file).then(r => r.json())));
  snapshots.sort((a,b) => a.date.localeCompare(b.date));
  initializeFilters();
  render();
}

function initializeFilters() {
  countryFilter.innerHTML = Object.entries(COUNTRY_NAMES).map(([k,v]) => `<option value="${k}">${v}</option>`).join("");
  dateFilter.innerHTML = [...snapshots].reverse().map(s => `<option value="${s.date}">${s.date}</option>`).join("");
  dateFilter.value = snapshots.at(-1).date;
  document.querySelectorAll(".tab").forEach(btn => btn.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    currentView = btn.dataset.view;
    render();
  }));
  [storeFilter,countryFilter,categoryFilter,dateFilter].forEach(el => el.addEventListener("change", render));
}

function selectedSnapshot() {
  return snapshots.find(s => s.date === dateFilter.value) || snapshots.at(-1);
}

function storeRecords(snapshot, store, country) {
  return snapshot.records.filter(r => r.store === store && (!country || r.country === country));
}

function refreshCategories(snapshot) {
  const rows = snapshot.records.filter(r => r.store === storeFilter.value && r.country === countryFilter.value);
  const current = categoryFilter.value;
  const cats = [...new Set(rows.map(r => r.category))].sort();
  categoryFilter.innerHTML = `<option value="all">전체</option>` + cats.map(c => `<option>${c}</option>`).join("");
  if (cats.includes(current)) categoryFilter.value = current; else categoryFilter.value = "all";
}

function renderMetrics(snapshot, rows) {
  const countries = new Set(snapshot.records.filter(r => r.store === storeFilter.value).map(r => r.country)).size;
  const cats = new Set(rows.map(r => r.category)).size;
  const top = [...rows].sort((a,b)=>a.rank-b.rank)[0];
  const coverage = rows.length ? `${rows.length}/25` : "0/25";
  $("metrics").innerHTML = [
    ["공식 수집 국가", `${countries}/7`],
    ["현재 표본", coverage],
    ["카테고리 수", String(cats)],
    ["1위", top ? top.title : "확인 불가"]
  ].map(([l,v]) => `<div class="metric"><div class="label">${l}</div><div class="value">${escapeHtml(v)}</div></div>`).join("");
}

function renderNotice(snapshot) {
  const store = storeFilter.value;
  const sources = Object.values(snapshot.sources).filter(s => s.store === store);
  const ok = sources.filter(s => s.status === "verified").length;
  const unavailable = sources.length - ok;
  $("coverageNotice").innerHTML = store === "apple"
    ? `<strong>Apple 공식 차트:</strong> ${ok}/7개국 TOP 25 확인. 카테고리 보기는 현재 TOP 25 항목의 공식/정규화 카테고리로 구성됩니다.`
    : `<strong>Google Play 공식 차트:</strong> 이번 시험 실행에서는 정확한 TOP 25 목록을 공개 페이지에서 기계적으로 검증하지 못했습니다. 제3자 순위로 보완하지 않았습니다. (${unavailable}/7 미수집)`;
}

function filteredRows(snapshot) {
  let rows = storeRecords(snapshot, storeFilter.value, countryFilter.value);
  if (categoryFilter.value !== "all") rows = rows.filter(r => r.category === categoryFilter.value);
  return rows.sort((a,b)=>a.rank-b.rank);
}

function tableCard(title, subtitle, rows) {
  const body = rows.length ? `
    <div class="table-wrap"><table>
      <thead><tr><th>Rank</th><th>App</th><th>Category</th><th>Country</th></tr></thead>
      <tbody>${rows.map(r => `<tr>
        <td class="rank">#${r.rank}</td>
        <td class="app"><strong>${escapeHtml(r.title)}</strong><span>${escapeHtml(r.description)}</span></td>
        <td><span class="category-chip">${escapeHtml(r.category)}</span></td>
        <td>${COUNTRY_NAMES[r.country] || r.country}</td>
      </tr>`).join("")}</tbody>
    </table></div>` : `<div class="empty">공식 공개 차트에서 확인 가능한 데이터가 없습니다.</div>`;
  return `<section class="card"><div class="card-head"><div><h2>${escapeHtml(title)}</h2><p>${escapeHtml(subtitle)}</p></div></div>${body}</section>`;
}

function renderCountry(snapshot) {
  refreshCategories(snapshot);
  const rows = filteredRows(snapshot);
  renderMetrics(snapshot, rows);
  return tableCard(`${COUNTRY_NAMES[countryFilter.value]} · ${storeFilter.value === "apple" ? "Apple App Store" : "Google Play"}`,
    `${snapshot.date} · 공식 무료 앱 TOP 25`, rows);
}

function renderWeekly(snapshot) {
  refreshCategories(snapshot);
  const rows = filteredRows(snapshot);
  const idx = snapshots.findIndex(s => s.date === snapshot.date);
  const prev = idx > 0 ? snapshots[idx-1] : null;
  const prevMap = new Map((prev ? storeRecords(prev, storeFilter.value, countryFilter.value) : []).map(r => [r.title,r.rank]));
  const enriched = rows.map(r => ({...r, movement: prevMap.has(r.title) ? prevMap.get(r.title)-r.rank : null}));
  renderMetrics(snapshot, rows);
  const items = enriched.length ? enriched.map(r => `<li><span>#${r.rank} ${escapeHtml(r.title)}</span><strong>${r.movement === null ? "기준점" : r.movement > 0 ? `▲${r.movement}` : r.movement < 0 ? `▼${Math.abs(r.movement)}` : "—"}</strong></li>`).join("") : `<li><span>공식 데이터 없음</span><strong>—</strong></li>`;
  return `<div class="grid">
    ${tableCard("주간 현재 순위", `${snapshot.date} 기준`, rows)}
    <section class="card"><div class="card-head"><div><h2>주간 등락</h2><p>${prev ? `${prev.date} 대비` : "첫 스냅샷 — 다음 실행부터 등락 계산"}</p></div></div><div style="padding:0 18px 14px"><ul class="stat-list">${items}</ul></div></section>
  </div>`;
}

function renderMonthly(snapshot) {
  refreshCategories(snapshot);
  const month = snapshot.date.slice(0,7);
  const monthSnaps = snapshots.filter(s => s.date.startsWith(month));
  const bucket = new Map();
  monthSnaps.forEach(s => storeRecords(s, storeFilter.value, countryFilter.value).forEach(r => {
    if (categoryFilter.value !== "all" && r.category !== categoryFilter.value) return;
    const x = bucket.get(r.title) || {title:r.title, category:r.category, description:r.description, ranks:[]};
    x.ranks.push(r.rank); bucket.set(r.title,x);
  }));
  const rows = [...bucket.values()].map(x => ({...x, avg: x.ranks.reduce((a,b)=>a+b,0)/x.ranks.length, appearances:x.ranks.length}))
    .sort((a,b)=>a.avg-b.avg);
  renderMetrics(snapshot, filteredRows(snapshot));
  return `<section class="card"><div class="card-head"><div><h2>${month} 월간</h2><p>스냅샷 ${monthSnaps.length}회 기준 평균 순위</p></div></div>
    ${rows.length ? `<div class="table-wrap"><table><thead><tr><th>Avg</th><th>App</th><th>Category</th><th>Appearances</th></tr></thead><tbody>
    ${rows.map(r=>`<tr><td class="rank">${r.avg.toFixed(1)}</td><td class="app"><strong>${escapeHtml(r.title)}</strong><span>${escapeHtml(r.description)}</span></td><td><span class="category-chip">${escapeHtml(r.category)}</span></td><td>${r.appearances}</td></tr>`).join("")}
    </tbody></table></div>` : `<div class="empty">월간 데이터가 없습니다.</div>`}
  </section>`;
}

function renderCategory(snapshot) {
  const rowsAll = snapshot.records.filter(r => r.store === storeFilter.value);
  const counts = new Map();
  rowsAll.forEach(r => counts.set(r.category, (counts.get(r.category)||0)+1));
  const cats = [...counts.entries()].sort((a,b)=>b[1]-a[1]);
  renderMetrics(snapshot, filteredRows(snapshot));
  const list = cats.map(([c,n]) => `<li><span>${escapeHtml(c)}</span><strong>${n}</strong></li>`).join("");
  const chosen = categoryFilter.value === "all" ? (cats[0]?.[0] || "all") : categoryFilter.value;
  const rows = rowsAll.filter(r => chosen === "all" || r.category === chosen).sort((a,b)=>a.rank-b.rank);
  return `<div class="grid">
    <section class="card"><div class="card-head"><div><h2>카테고리 점유</h2><p>7개국 TOP 25에 등장한 항목 수</p></div></div><div style="padding:0 18px 14px"><ul class="stat-list">${list || "<li>데이터 없음</li>"}</ul></div></section>
    ${tableCard(chosen === "all" ? "카테고리 앱" : chosen, "국가별 TOP 25 안에서 해당 카테고리만 보기", rows)}
  </div>`;
}

function renderCoverage(snapshot) {
  const items = Object.values(snapshot.sources).sort((a,b)=>a.store.localeCompare(b.store)||a.country.localeCompare(b.country));
  renderMetrics(snapshot, filteredRows(snapshot));
  return `<section class="card"><div class="card-head"><div><h2>공식 소스 수집 상태</h2><p>제3자 랭킹 사이트 사용 안 함</p></div></div>
  <div class="table-wrap"><table><thead><tr><th>Store</th><th>Country</th><th>Status</th><th>Official source</th></tr></thead><tbody>
  ${items.map(s => `<tr><td>${s.store}</td><td>${COUNTRY_NAMES[s.country]}</td><td class="${s.status==="verified"?"status-ok":"status-warn"}">${s.status}</td><td class="source"><a href="${s.url}" target="_blank" rel="noreferrer">${s.url}</a>${s.note?`<div class="muted">${escapeHtml(s.note)}</div>`:""}</td></tr>`).join("")}
  </tbody></table></div></section>`;
}

function render() {
  const snapshot = selectedSnapshot();
  renderNotice(snapshot);
  let html = "";
  if (currentView === "country") html = renderCountry(snapshot);
  if (currentView === "weekly") html = renderWeekly(snapshot);
  if (currentView === "monthly") html = renderMonthly(snapshot);
  if (currentView === "category") html = renderCategory(snapshot);
  if (currentView === "coverage") html = renderCoverage(snapshot);
  $("content").innerHTML = html;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[ch]));
}

loadData().catch(err => {
  $("coverageNotice").innerHTML = `<strong>데이터 로드 실패:</strong> ${escapeHtml(err.message)}`;
});
