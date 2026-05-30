const categories = {
  road: { label: 'Via pública', icon: '🕳️' },
  light: { label: 'Iluminação pública', icon: '💡' },
  waste: { label: 'Resíduos / limpeza', icon: '🗑️' },
  sign: { label: 'Sinalização', icon: '🚧' },
  tree: { label: 'Árvores / espaços verdes', icon: '🌳' },
  other: { label: 'Outros', icon: '📍' },
};
const statuses = {
  sent: { label: 'Enviado', icon: '📨', color: '#7c3aed', open: true },
  received: { label: 'Recebido', icon: '📥', color: '#2563eb', open: true },
  validating: { label: 'Em validação', icon: '🔎', color: '#f59e0b', open: true },
  resolving: { label: 'Em resolução', icon: '🛠️', color: '#a855f7', open: true },
  resolved: { label: 'Resolvido', icon: '✅', color: '#16a34a', open: false },
  rejected: { label: 'Rejeitado', icon: '⛔', color: '#ef4444', open: false },
};
const storageKey = 'cidadealerta_occurrences_v7';
const reportEmail = 'fernandobravofigueroa@gmail.com';
const povoaBounds = L.latLngBounds([41.3250, -8.8100], [41.4650, -8.7000]);
let map, selectedLatLng, selectedMarker, userMarker;
let occurrences = JSON.parse(localStorage.getItem(storageKey) || '[]');
const markers = new Map();

const $ = (id) => document.getElementById(id);
const save = () => localStorage.setItem(storageKey, JSON.stringify(occurrences));
const fmt = (n) => Number(n).toFixed(5);

function initMap() {
  map = L.map('map', { zoomControl: true, preferCanvas: false }).setView([41.3805, -8.7609], 14);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);
  L.rectangle(povoaBounds, { color: '#2374e1', weight: 1, fill: false, dashArray: '6,6' }).addTo(map);

  map.on('click', (e) => {
    if (!isInsidePovoa(e.latlng)) {
      showLimitModal();
      return;
    }
    openReportModal(e.latlng);
  });

  // Important for local/static demos and CSS grid layouts.
  setTimeout(() => map.invalidateSize(true), 100);
  setTimeout(() => map.invalidateSize(true), 600);
  window.addEventListener('resize', () => setTimeout(() => map.invalidateSize(true), 150));
}

function markerIcon(categoryKey, statusKey) {
  const cat = categories[categoryKey] || categories.other;
  const st = statuses[statusKey] || statuses.sent;
  return L.divIcon({
    className: '',
    html: `<div class="marker-pin" style="background:${st.color}"><span>${cat.icon}</span></div>`,
    iconSize: [42, 42],
    iconAnchor: [21, 42],
    popupAnchor: [0, -40],
  });
}
function userIcon() {
  return L.divIcon({ className: '', html: '<div class="user-dot"></div>', iconSize: [18,18], iconAnchor: [9,9] });
}

function renderMarkers() {
  for (const marker of markers.values()) marker.remove();
  markers.clear();
  occurrences.forEach((o) => {
    const marker = L.marker([o.lat, o.lng], { icon: markerIcon(o.category, o.status) }).addTo(map);
    marker.bindPopup(`<strong>${categories[o.category]?.icon || '📍'} ${categories[o.category]?.label || 'Ocorrência'}</strong><br>${o.description}<br><small>${statuses[o.status]?.icon} ${statuses[o.status]?.label}</small>`);
    markers.set(o.id, marker);
  });
}

function renderLegend() {
  $('legend').innerHTML = Object.values(statuses).map(s => `<span style="color:${s.color}">${s.icon} ${s.label}</span>`).join('');
}

function renderSelects() {
  $('category').innerHTML = '<option value="">Selecionar...</option>' + Object.entries(categories).map(([k,c]) => `<option value="${k}">${c.icon} ${c.label}</option>`).join('');
  $('statusFilter').innerHTML = '<option value="all">Todos os estados</option>' + Object.entries(statuses).map(([k,s]) => `<option value="${k}">${s.icon} ${s.label}</option>`).join('');
  $('categoryFilter').innerHTML = '<option value="all">Todos os tipos</option>' + Object.entries(categories).map(([k,c]) => `<option value="${k}">${c.icon} ${c.label}</option>`).join('');
}

function renderAdmin() {
  const statusFilter = $('statusFilter').value || 'all';
  const categoryFilter = $('categoryFilter').value || 'all';
  const filtered = occurrences.filter(o =>
    (statusFilter === 'all' || o.status === statusFilter) &&
    (categoryFilter === 'all' || o.category === categoryFilter)
  );
  $('totalCount').textContent = occurrences.length;
  $('openCount').textContent = occurrences.filter(o => statuses[o.status]?.open).length;
  $('doneCount').textContent = occurrences.filter(o => o.status === 'resolved').length;
  $('rejectedCount').textContent = occurrences.filter(o => o.status === 'rejected').length;
  $('avgResolutionTime').textContent = getAverageResolutionTime();

  if (!filtered.length) {
    $('occurrenceList').innerHTML = '<div class="empty">Ainda não existem ocorrências para este filtro.</div>';
    return;
  }

  $('occurrenceList').innerHTML = filtered.map(o => {
    const c = categories[o.category] || categories.other;
    const s = statuses[o.status] || statuses.sent;
    const closedClass = o.status === 'resolved' ? 'resolved' : (o.status === 'rejected' ? 'rejected' : '');
    const resolutionLine = o.status === 'resolved' ? `<br><strong>Tempo de resolução:</strong> ${getResolutionTime(o)}` : '';
    return `<article class="occ-card ${closedClass}">
      <div class="occ-title"><span>${c.icon} ${c.label}</span><span class="status-pill" style="color:${s.color}">${s.icon} ${s.label}</span></div>
      <p>${escapeHtml(o.description)}</p>
      <div class="occ-meta">
        Recebimento: ${o.createdAt || '—'}<br>
        <span class="updated-line">Última atualização: ${o.updatedAt || o.createdAt || '—'}</span>${resolutionLine}<br>
        Local: ${fmt(o.lat)}, ${fmt(o.lng)}<br>
        ${o.attachments?.length ? 'Anexos: ' + o.attachments.join(', ') : 'Sem anexos'}
      </div>
      <div class="occ-actions">
        <select data-id="${o.id}" class="status-select">${Object.entries(statuses).map(([k,st]) => `<option value="${k}" ${k===o.status?'selected':''}>${st.icon} ${st.label}</option>`).join('')}</select>
        <button class="btn small confirm-status-btn" data-id="${o.id}" type="button" disabled>Confirmar</button>
        <button class="btn small view-btn" data-id="${o.id}" type="button">Ver</button>
      </div>
    </article>`;
  }).join('');

  document.querySelectorAll('.status-select').forEach(sel => sel.addEventListener('change', (e) => {
    const btn = e.target.closest('.occ-actions')?.querySelector('.confirm-status-btn');
    const item = occurrences.find(o => o.id === e.target.dataset.id);
    if (btn && item) btn.disabled = e.target.value === item.status;
  }));
  document.querySelectorAll('.confirm-status-btn').forEach(btn => btn.addEventListener('click', (e) => {
    const item = occurrences.find(o => o.id === e.target.dataset.id);
    const select = e.target.closest('.occ-actions')?.querySelector('.status-select');
    if (!item || !select || select.value === item.status) return;
    const next = select.value;
    const nextLabel = statuses[next]?.label || next;
    if (!confirm(`Confirmar alteração do status para "${nextLabel}"?`)) {
      select.value = item.status;
      e.target.disabled = true;
      return;
    }
    const now = new Date();
    item.status = next;
    item.updatedAt = formatDateTime(now);
    item.updatedAtIso = toIso(now);
    if (next === 'resolved') {
      item.resolvedAt = item.updatedAt;
      item.resolvedAtIso = item.updatedAtIso;
    }
    if (next !== 'resolved') {
      delete item.resolvedAt;
      delete item.resolvedAtIso;
    }
    save(); renderMarkers(); renderAdmin();
  }));
  document.querySelectorAll('.view-btn').forEach(btn => btn.addEventListener('click', (e) => {
    const o = occurrences.find(x => x.id === e.target.dataset.id);
    if (!o) return;
    map.setView([o.lat, o.lng], 17);
    setTimeout(() => markers.get(o.id)?.openPopup(), 250);
  }));
}

function openReportModal(latlng) {
  selectedLatLng = latlng;
  $('coordBadge').textContent = `${fmt(latlng.lat)}, ${fmt(latlng.lng)}`;
  $('modalCoords').textContent = `${fmt(latlng.lat)}, ${fmt(latlng.lng)}`;
  if (selectedMarker) selectedMarker.remove();
  selectedMarker = L.marker([latlng.lat, latlng.lng]).addTo(map);
  $('reportDialog').showModal();
}

function isInsidePovoa(latlng) {
  return povoaBounds.contains(latlng);
}
function showLimitModal() {
  $('limitDialog').showModal();
}
function closeLimitModal() {
  $('limitDialog').close();
}
function formatDateTime(date) {
  return date.toLocaleString('pt-PT', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
}
function toIso(date) {
  return date.toISOString();
}
function dateFromOccurrence(value, fallbackText) {
  if (value) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  if (fallbackText) {
    const match = String(fallbackText).match(/(\d{2})\/(\d{2})\/(\d{4}),?\s+(\d{2}):(\d{2})/);
    if (match) {
      const [, dd, mm, yyyy, hh, min] = match;
      return new Date(Number(yyyy), Number(mm) - 1, Number(dd), Number(hh), Number(min));
    }
  }
  return null;
}
function durationLabel(start, end) {
  if (!start || !end) return '—';
  const diffMs = Math.max(0, end - start);
  const totalMinutes = Math.round(diffMs / 60000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}min`;
  return `${minutes}min`;
}
function getResolutionTime(o) {
  if (o.status !== 'resolved') return '';
  const start = dateFromOccurrence(o.createdAtIso, o.createdAt);
  const end = dateFromOccurrence(o.resolvedAtIso || o.updatedAtIso, o.resolvedAt || o.updatedAt);
  return durationLabel(start, end);
}
function getAverageResolutionTime() {
  const resolved = occurrences
    .filter(o => o.status === 'resolved')
    .map(o => {
      const start = dateFromOccurrence(o.createdAtIso, o.createdAt);
      const end = dateFromOccurrence(o.resolvedAtIso || o.updatedAtIso, o.resolvedAt || o.updatedAt);
      return start && end ? Math.max(0, end - start) : null;
    })
    .filter(v => v !== null);
  if (!resolved.length) return '—';
  const avgMs = resolved.reduce((a,b) => a+b, 0) / resolved.length;
  return durationLabel(new Date(0), new Date(avgMs));
}

function closeModal() {
  $('reportDialog').close();
  $('reportForm').reset();
}

function useGps() {
  if (!navigator.geolocation) {
    alert('O navegador não suporta geolocalização.'); return;
  }
  navigator.geolocation.getCurrentPosition((pos) => {
    const latlng = L.latLng(pos.coords.latitude, pos.coords.longitude);
    if (userMarker) userMarker.remove();
    userMarker = L.marker(latlng, { icon: userIcon() }).addTo(map).bindPopup('A sua localização aproximada');
    if (!isInsidePovoa(latlng)) showLimitModal();
    map.setView(latlng, 16);
    $('coordBadge').textContent = `${fmt(latlng.lat)}, ${fmt(latlng.lng)}`;
  }, () => alert('Não foi possível obter a localização. Autorize o GPS no navegador.'), { enableHighAccuracy: true, timeout: 10000 });
}

function addOccurrence(e) {
  e.preventDefault();
  if (!selectedLatLng) { alert('Selecione um ponto no mapa.'); return; }
  const files = Array.from($('attachments').files || []);
  if (files.length > 3) { alert('Envie no máximo 3 ficheiros.'); return; }
  const now = new Date();
  const occurrence = {
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    name: $('name').value.trim(), phone: $('phone').value.trim(),
    category: $('category').value, description: $('description').value.trim(),
    lat: selectedLatLng.lat, lng: selectedLatLng.lng,
    status: 'sent',
    attachments: files.map(f => f.name),
    createdAt: formatDateTime(now),
    updatedAt: formatDateTime(now),
    createdAtIso: toIso(now),
    updatedAtIso: toIso(now),
  };
  occurrences.unshift(occurrence);
  save();
  //if ($('sendEmail').checked) openMailClient(occurrence);
  if (selectedMarker) { selectedMarker.remove(); selectedMarker = null; }
  closeModal(); renderMarkers(); renderAdmin();
}

function loadDemo() {
  occurrences = [
    {id:'demo1', category:'road', status:'sent', description:'Buraco grande junto à passadeira.', lat:41.38020, lng:-8.76140, attachments:['foto-demo-1.jpg'], createdAt:'30/05/2026, 10:12', updatedAt:'30/05/2026, 10:12', createdAtIso:'2026-05-30T10:12:00.000Z', updatedAtIso:'2026-05-30T10:12:00.000Z'},
    {id:'demo2', category:'light', status:'resolving', description:'Candeeiro sem iluminação há vários dias.', lat:41.38220, lng:-8.75590, attachments:[], createdAt:'30/05/2026, 11:40', updatedAt:'30/05/2026, 14:18', createdAtIso:'2026-05-30T11:40:00.000Z', updatedAtIso:'2026-05-30T14:18:00.000Z'},
    {id:'demo3', category:'waste', status:'resolved', description:'Resíduos abandonados junto ao contentor.', lat:41.37590, lng:-8.76620, attachments:['foto-demo-2.jpg'], createdAt:'30/05/2026, 13:05', updatedAt:'30/05/2026, 16:32', resolvedAt:'30/05/2026, 16:32', createdAtIso:'2026-05-30T13:05:00.000Z', updatedAtIso:'2026-05-30T16:32:00.000Z', resolvedAtIso:'2026-05-30T16:32:00.000Z'},
    {id:'demo4', category:'sign', status:'received', description:'Sinal de trânsito danificado junto ao cruzamento.', lat:41.38340, lng:-8.76320, attachments:['sinal.jpg'], createdAt:'30/05/2026, 15:21', updatedAt:'30/05/2026, 15:44', createdAtIso:'2026-05-30T15:21:00.000Z', updatedAtIso:'2026-05-30T15:44:00.000Z'},
    {id:'demo5', category:'tree', status:'validating', description:'Ramo partido com risco de queda sobre o passeio.', lat:41.38610, lng:-8.75810, attachments:['arvore.jpg'], createdAt:'30/05/2026, 17:03', updatedAt:'30/05/2026, 17:03', createdAtIso:'2026-05-30T17:03:00.000Z', updatedAtIso:'2026-05-30T17:03:00.000Z'},
    {id:'demo6', category:'other', status:'rejected', description:'Pedido sem informação suficiente para validação.', lat:41.37760, lng:-8.75280, attachments:[], createdAt:'29/05/2026, 18:27', updatedAt:'30/05/2026, 09:10', createdAtIso:'2026-05-29T18:27:00.000Z', updatedAtIso:'2026-05-30T09:10:00.000Z'},
    {id:'demo7', category:'waste', status:'sent', description:'Contentor cheio e resíduos fora do local.', lat:41.37270, lng:-8.76740, attachments:['contentor.jpg'], createdAt:'30/05/2026, 18:05', updatedAt:'30/05/2026, 18:05', createdAtIso:'2026-05-30T18:05:00.000Z', updatedAtIso:'2026-05-30T18:05:00.000Z'},
    {id:'demo8', category:'road', status:'resolved', description:'Passeio com pedra solta junto à entrada da escola.', lat:41.37910, lng:-8.75890, attachments:['passeio.jpg'], createdAt:'28/05/2026, 09:12', updatedAt:'29/05/2026, 12:35', resolvedAt:'29/05/2026, 12:35', createdAtIso:'2026-05-28T09:12:00.000Z', updatedAtIso:'2026-05-29T12:35:00.000Z', resolvedAtIso:'2026-05-29T12:35:00.000Z'},
    {id:'demo9', category:'light', status:'received', description:'Iluminação intermitente junto ao jardim.', lat:41.38470, lng:-8.76010, attachments:['luz.jpg'], createdAt:'30/05/2026, 19:22', updatedAt:'30/05/2026, 19:40', createdAtIso:'2026-05-30T19:22:00.000Z', updatedAtIso:'2026-05-30T19:40:00.000Z'},
    {id:'demo10', category:'tree', status:'resolved', description:'Relva e arbustos a invadir passagem pedonal.', lat:41.37390, lng:-8.75860, attachments:[], createdAt:'27/05/2026, 08:50', updatedAt:'30/05/2026, 10:05', resolvedAt:'30/05/2026, 10:05', createdAtIso:'2026-05-27T08:50:00.000Z', updatedAtIso:'2026-05-30T10:05:00.000Z', resolvedAtIso:'2026-05-30T10:05:00.000Z'},
  ];
  save(); renderMarkers(); renderAdmin();
  map.setView([41.379, -8.761], 15);
  setTimeout(() => map.invalidateSize(true), 100);
}

function exportCsv() {
  const rows = [['id','categoria','estado','descricao','lat','lng','recebido_em','ultima_atualizacao','tempo_resolucao','anexos']].concat(
    occurrences.map(o => [o.id, categories[o.category]?.label, statuses[o.status]?.label, o.description, o.lat, o.lng, o.createdAt, o.updatedAt || o.createdAt, getResolutionTime(o), (o.attachments||[]).join('|')])
  );
  const csv = rows.map(r => r.map(v => `"${String(v ?? '').replaceAll('"','""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type:'text/csv;charset=utf-8' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'cidadealerta-ocorrencias.csv'; a.click(); URL.revokeObjectURL(a.href);
}
function openMailClient(o) {
  const cat = categories[o.category] || categories.other;
  const st = statuses[o.status] || statuses.sent;
  const subject = `CidadeAlerta - Nova ocorrência: ${cat.label}`;
  const body = [
    'Nova ocorrência registada no MVP CidadeAlerta',
    '',
    `Nome: ${o.name}`,
    `Telefone: ${o.phone}`,
    `Categoria: ${cat.icon} ${cat.label}`,
    `Estado inicial: ${st.icon} ${st.label}`,
    `Recebimento: ${o.createdAt}`,
    `Local: ${fmt(o.lat)}, ${fmt(o.lng)}`,
    `Google Maps: https://www.google.com/maps?q=${o.lat},${o.lng}`,
    '',
    'Descrição:',
    o.description,
    '',
    `Anexos informados: ${o.attachments?.length ? o.attachments.join(', ') : 'Sem anexos'}`,
    '',
    'Nota: nesta versão sem backend, os ficheiros não são anexados automaticamente. O envio real deve ser implementado no backend ou por integração externa.'
  ].join('\n');
  window.location.href = `mailto:${reportEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

function escapeHtml(str){ return String(str).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }

window.addEventListener('DOMContentLoaded', () => {
  initMap(); renderSelects(); renderLegend(); renderMarkers(); renderAdmin();
  $('gpsBtn').addEventListener('click', useGps);
  $('demoBtn').addEventListener('click', loadDemo);
  $('clearBtn').addEventListener('click', () => { if(confirm('Limpar todas as ocorrências?')){ occurrences=[]; save(); renderMarkers(); renderAdmin(); } });
  $('exportBtn').addEventListener('click', exportCsv);
  $('statusFilter').addEventListener('change', renderAdmin);
  $('categoryFilter').addEventListener('change', renderAdmin);
  $('reportForm').addEventListener('submit', addOccurrence);
  $('closeModal').addEventListener('click', closeModal);
  $('cancelModal').addEventListener('click', closeModal);
  $('closeLimitModal').addEventListener('click', closeLimitModal);
  $('okLimitModal').addEventListener('click', closeLimitModal);
});
