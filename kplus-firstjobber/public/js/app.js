/* K PLUS First Jobber - front-end (vanilla, no build step) */
'use strict';

const App = {
  meta: null, users: [], userId: localStorage.getItem('kp_user') || null,
  data: null, tab: 'home', sheet: null, sheetData: null, busy: false,
};

/* ------------------------------------------------------------------ */
/* utils                                                               */
/* ------------------------------------------------------------------ */
const $ = (s, r = document) => r.querySelector(s);
const el = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const B = (n) => (Number(n) || 0).toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const B2 = (n) => (Number(n) || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const day = (s) => new Date(s).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
const dayTime = (s) => new Date(s).toLocaleString('th-TH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

async function api(path, body, method) {
  const res = await fetch(path, {
    method: method || (body ? 'POST' : 'GET'),
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'เกิดข้อผิดพลาด');
  return json;
}

let toastTimer = null;
function toast(msg, kind = '') {
  const old = $('.toast'); if (old) old.remove();
  const t = document.createElement('div');
  t.className = `toast ${kind}`;
  t.innerHTML = esc(msg);
  el('phone').appendChild(t);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.remove(), 3200);
}

const ICON = {
  home: '<path d="M3 11l9-8 9 8v9a2 2 0 0 1-2 2h-4v-7H9v7H5a2 2 0 0 1-2-2z"/>',
  wallet: '<rect x="3" y="6" width="18" height="13" rx="3"/><path d="M16 12.5h2"/>',
  send: '<path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4z"/>',
  star: '<path d="M12 3l2.6 5.5 6 .9-4.3 4.2 1 6-5.3-2.8L6.7 19.6l1-6L3.4 9.4l6-.9z"/>',
  tax: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h5M8 16h3"/>',
  shield: '<path d="M12 3l8 3v6c0 5-3.4 8.4-8 9-4.6-.6-8-4-8-9V6z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  piggy: '<path d="M4 12a7 7 0 0 1 7-7h3a7 7 0 0 1 7 7v3h-2l-1 3h-3l-.5-2h-4L10 21H7l-.5-3H5z"/>',
  alert: '<path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17.5v.5"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
};
const svg = (k, w = 22) => `<svg viewBox="0 0 24 24" width="${w}" height="${w}" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${ICON[k] || ''}</svg>`;

const CAT_ICON = { food: '🍜', transport: '🚌', shopping: '🛍️', entertain: '🎬', health: '💊', bill: '🧾', transfer: '↗️', other: '💠' };

function ring(pct, color, size = 78) {
  const r = 32, c = 2 * Math.PI * r, v = Math.max(0, Math.min(100, pct));
  return `<svg class="ring" viewBox="0 0 78 78" width="${size}" height="${size}">
    <circle cx="39" cy="39" r="${r}" fill="none" stroke="#edf1f4" stroke-width="8"/>
    <circle cx="39" cy="39" r="${r}" fill="none" stroke="${color}" stroke-width="8" stroke-linecap="round"
      stroke-dasharray="${(c * v) / 100} ${c}" transform="rotate(-90 39 39)"/>
    <text x="39" y="43" text-anchor="middle" font-size="16" font-weight="700" fill="#16202a">${Math.round(v)}%</text></svg>`;
}

function spark(points, color = '#00a950', w = 300, h = 54) {
  if (!points.length) return '';
  const max = Math.max(...points, 1);
  const step = w / Math.max(1, points.length - 1);
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${(i * step).toFixed(1)},${(h - (p / max) * (h - 8) - 4).toFixed(1)}`).join(' ');
  return `<svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}" preserveAspectRatio="none">
    <path d="${d}" fill="none" stroke="${color}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
}

/* ------------------------------------------------------------------ */
/* boot                                                                */
/* ------------------------------------------------------------------ */
async function boot() {
  App.meta = await api('/api/meta');
  App.users = await api('/api/users');
  if (App.userId && !App.users.some((u) => u.id === App.userId)) App.userId = null;
  if (App.userId) await loadState(); else render();
}

async function loadState() {
  App.data = await api(`/api/state?userId=${encodeURIComponent(App.userId)}`);
  render();
}

async function act(fn, okMsg) {
  if (App.busy) return;
  App.busy = true;
  try {
    const r = await fn();
    if (r && r.state) { App.data = r.state; render(); }
    else if (r && r.user && r.pockets) { App.data = r; render(); }
    else await loadState();
    if (okMsg) toast(okMsg, 'good');
    return r;
  } catch (e) { toast(e.message, 'bad'); throw e; }
  finally { App.busy = false; }
}

/* ------------------------------------------------------------------ */
/* render                                                              */
/* ------------------------------------------------------------------ */
function render() {
  const root = el('app');
  if (!App.userId || !App.data) { root.innerHTML = loginView(); return; }
  const screens = { home: homeView, pockets: pocketsView, transfer: transferView, score: scoreView, tax: taxView };
  root.innerHTML = `<div class="screen" id="screen">${screens[App.tab]()}</div>${tabbar()}${App.sheet ? sheetView() : ''}`;
  const sc = el('screen');
  if (sc) sc.scrollTop = App._scroll && App._scroll[App.tab] || 0;
  if (sc) sc.addEventListener('scroll', () => { App._scroll = App._scroll || {}; App._scroll[App.tab] = sc.scrollTop; });
}

function go(tab) { App.sheet = null; App.tab = tab; render(); }
function openSheet(name, data) { App.sheet = name; App.sheetData = data || {}; render(); }
function closeSheet() { App.sheet = null; App.sheetData = null; render(); }

function tabbar() {
  const tabs = [['home', 'หน้าแรก', 'home'], ['pockets', 'ซองเงิน', 'wallet'], ['transfer', 'โอน/ตรวจ', 'send'], ['score', 'คะแนน', 'star'], ['tax', 'ภาษี', 'tax']];
  return `<nav class="tabbar">${tabs.map(([k, label, ic]) =>
    `<button class="${App.tab === k ? 'on' : ''}" onclick="go('${k}')">${svg(ic)}<span>${label}</span></button>`).join('')}</nav>`;
}

/* ---------------------------- login ------------------------------- */
function loginView() {
  return `<div class="login">
    <div class="logo">K PLUS <span style="opacity:.75;font-weight:600">First Jobber</span></div>
    <div class="tagline">เลือกโปรไฟล์เพื่อทดลองใช้งานต้นแบบ · ข้อมูลถูกบันทึกจริงบนเซิร์ฟเวอร์</div>
    ${App.users.map((u) => `<button class="u-card" onclick="pickUser('${u.id}')">
      <div class="avatar">${esc(u.avatar)}</div>
      <div style="flex:1"><b>${esc(u.name)}</b><small>${esc(u.jobTitle)} · เงินเดือน ${B(u.salary)} บาท</small></div>
      <span style="opacity:.7">›</span></button>`).join('')}
    <div style="margin-top:18px;font-size:12px;opacity:.85">หลังบ้านสำหรับเจ้าหน้าที่: <a href="/admin" target="_blank" style="color:#fff;text-decoration:underline">/admin</a></div>
  </div>`;
}
async function pickUser(id) {
  App.userId = id; localStorage.setItem('kp_user', id);
  App.tab = 'home';
  await loadState();
}
function logout() { localStorage.removeItem('kp_user'); App.userId = null; App.data = null; render(); }

/* ---------------------------- home -------------------------------- */
function homeView() {
  const d = App.data, s = d.safeToSpend, u = d.user;
  const statusPill = { ahead: ['green', 'ใช้น้อยกว่าแผน เก่งมาก'], onTrack: ['green', 'ใช้จ่ายตามแผน'], over: ['red', 'ใช้เร็วกว่าแผน'] }[s.status];
  const usedPct = s.weekAllocated ? (s.weekSpent / s.weekAllocated) * 100 : 0;

  return `
  <div class="topbar">
    <div class="row">
      <div class="avatar">${esc(u.avatar)}</div>
      <div class="hello"><small>สวัสดี ${new Date().getHours() < 12 ? 'ตอนเช้า' : new Date().getHours() < 18 ? 'ตอนบ่าย' : 'ตอนค่ำ'}</small><b>${esc(u.nickname)} · ${esc(u.jobTitle)}</b></div>
      <button class="icon-btn" onclick="openSheet('settings')">⚙</button>
    </div>
  </div>

  <div class="hero ${s.status === 'over' ? 'over' : ''}">
    <div style="display:flex;justify-content:space-between;align-items:flex-start">
      <div><div class="lbl">ยอดคงเหลือในบัญชี</div><div class="bal">฿${B2(s.balance)}</div></div>
      <div style="text-align:right"><div class="lbl">ใช้ได้จริง (Safe-to-Spend)</div><div class="bal" style="color:var(--green-d)">฿${B2(s.safeToSpend)}</div></div>
    </div>
    <div class="today">
      ${ring(Math.min(100, usedPct), usedPct > 100 ? '#e0322f' : usedPct > 80 ? '#f5a623' : '#00a950')}
      <div style="flex:1">
        <div class="lbl">วันนี้ควรใช้ได้ไม่เกิน</div>
        <div class="big">฿${B2(s.today)}</div>
        <div style="margin-top:6px"><span class="pill ${statusPill[0]}">${statusPill[1]}</span></div>
        <div class="small muted" style="margin-top:5px">สัปดาห์ที่ ${s.week} · เหลือ ฿${B(s.weekRemaining)} อีก ${s.daysLeftInWeek} วัน</div>
      </div>
    </div>
    ${s.unpaidBills > 0 ? `<div class="note warn" style="margin:12px 0 0">หักบิลที่ยังไม่ตัดอีก ฿${B(s.unpaidBills)} (${s.unpaidBillList.length} รายการ) และกันเงินสัปดาห์ถัดไป ฿${B(s.futureReserved)} ไว้แล้ว</div>`
      : `<div class="note ok" style="margin:12px 0 0">บิลประจำรอบนี้ตัดครบแล้ว · กันเงินสัปดาห์ถัดไปไว้ ฿${B(s.futureReserved)}</div>`}
  </div>

  <div class="wrap">
    <div class="qa">
      <button onclick="openSheet('expense')"><span class="ic" style="background:var(--green-l);color:var(--green-d)">${svg('plus', 17)}</span>บันทึกจ่าย</button>
      <button onclick="go('transfer')"><span class="ic" style="background:var(--blue-l);color:var(--blue)">${svg('send', 17)}</span>โอนเงิน</button>
      <button onclick="openSheet('save')"><span class="ic" style="background:var(--violet-l);color:var(--violet)">${svg('piggy', 17)}</span>ออมเพิ่ม</button>
      <button onclick="openSheet('report')"><span class="ic" style="background:var(--red-l);color:var(--red)">${svg('alert', 17)}</span>รายงานบัญชี</button>
    </div>

    ${billsCard()}
    ${pocketStrip()}
    ${roundupCard()}
    ${scoreMini()}

    <div class="card">
      <div class="hd"><h3>รายการล่าสุด</h3><button class="lnk" onclick="openSheet('allTx')">ดูทั้งหมด</button></div>
      ${d.transactions.slice(0, 6).map(txRow).join('') || '<div class="empty">ยังไม่มีรายการ</div>'}
    </div>

    <div class="card tight" style="display:flex;gap:10px;align-items:center">
      <div style="flex:1"><b style="font-size:13.5px">Scam Radar พร้อมใช้งาน</b><div class="small muted">ตรวจบัญชีปลายทางก่อนโอนทุกครั้ง ใช้เวลา 2 วินาที</div></div>
      <button class="btn sm" style="width:auto;padding:9px 14px" onclick="go('transfer')">ตรวจเลย</button>
    </div>
  </div>`;
}

function billsCard() {
  const d = App.data;
  const unpaid = d.bills.filter((b) => !b.paid);
  if (!unpaid.length) return '';
  return `<div class="card">
    <div class="hd"><h3>บิลที่ยังไม่ตัดรอบนี้</h3><span class="pill amber">${unpaid.length} รายการ</span></div>
    ${unpaid.map((b) => `<div class="row-item">
      <div class="ic">🧾</div>
      <div class="t"><b>${esc(b.name)}</b><small>ครบกำหนดวันที่ ${b.dueDay} ${b.autoDebit ? '· ตัดอัตโนมัติ' : ''}</small></div>
      <button class="btn sm" style="width:auto;padding:8px 12px" onclick="payBill('${b.id}')">จ่าย ฿${B(b.amount)}</button>
    </div>`).join('')}
  </div>`;
}
const payBill = (billId) => act(() => api('/api/bills/pay', { userId: App.userId, billId }), 'จ่ายบิลเรียบร้อย ตัดจากซอง Fix Cost');

function pocketStrip() {
  const d = App.data, cur = `week${d.safeToSpend.week}`;
  return `<div class="card">
    <div class="hd"><h3>K Pockets รอบนี้</h3><button class="lnk" onclick="go('pockets')">จัดการซอง</button></div>
    ${d.pockets.map((p) => pocketRow(p, p.code === cur)).join('')}
  </div>`;
}

function pocketRow(p, active) {
  const pct = Math.min(100, p.percent);
  const cls = p.percent > 100 ? 'over' : p.percent > 85 ? 'warn' : '';
  const color = p.code === 'fix' ? 'background:#eef1f4;color:#48566a' : 'background:var(--green-l);color:var(--green-d)';
  return `<div class="pocket ${active ? 'active' : ''}">
    <div class="tag" style="${color}">${p.code === 'fix' ? 'FIX' : 'W' + p.week}</div>
    <div class="info">
      <div style="display:flex;justify-content:space-between"><b>${esc(p.name)}${active ? ' <span class="pill green" style="margin-left:4px">สัปดาห์นี้</span>' : ''}</b>
      <span class="n">฿${B(p.remaining)} / ${B(p.allocated)}</span></div>
      <div class="bar"><i class="${cls}" style="width:${pct}%"></i></div>
    </div></div>`;
}

function roundupCard() {
  const r = App.data.roundup;
  return `<div class="card">
    <div class="hd"><h3>Round-up กองทุนเศษสตางค์</h3>
      <div class="switch ${r.enabled ? 'on' : ''}" onclick="toggleRoundup()"><i></i></div></div>
    <div style="display:flex;align-items:flex-end;gap:12px">
      <div><div class="small muted">เงินออมสะสมทั้งหมด</div><div style="font-size:26px;font-weight:800;color:var(--violet)">฿${B2(r.fund)}</div></div>
      <div style="flex:1;text-align:right"><div class="small muted">รอบนี้ปัดเศษไปแล้ว</div><b>฿${B2(r.thisCycle)}</b><div class="small muted">${r.count} ครั้ง · ปัดขึ้นทีละ ${r.step} บาท</div></div>
    </div>
    ${r.recent.length ? `<div style="margin-top:10px;border-top:1px solid var(--line);padding-top:8px">
      ${r.recent.slice(0, 3).map((x) => `<div class="kv"><span>${esc(x.merchant)} · จ่าย ${B(x.amount)} ปัดเป็น ${B(x.rounded)}</span><b style="color:var(--violet)">+${B2(x.diff)}</b></div>`).join('')}
    </div>` : `<div class="note" style="margin:10px 0 0">${r.enabled ? 'ยังไม่มีการปัดเศษในรอบนี้ ลองบันทึกค่าใช้จ่ายที่มีเศษ เช่น 48 บาท' : 'เปิดใช้งานเพื่อให้ทุกการจ่ายถูกปัดขึ้นและเก็บส่วนต่างอัตโนมัติ'}</div>`}
    <button class="btn ghost sm" style="margin-top:10px" onclick="openSheet('roundupSet')">ตั้งค่าการปัดเศษ</button>
  </div>`;
}
const toggleRoundup = () => act(() => api('/api/roundup', { userId: App.userId, enabled: !App.data.roundup.enabled }), 'อัปเดตการตั้งค่า Round-up แล้ว');

function scoreMini() {
  const s = App.data.score;
  const color = s.total >= 85 ? '#00a950' : s.total >= 70 ? '#19b45f' : s.total >= 55 ? '#f5a623' : '#f2751a';
  return `<div class="card" onclick="go('score')" style="cursor:pointer">
    <div class="hd"><h3>First Jobber Score</h3><span class="lnk">ดูรายละเอียด ›</span></div>
    <div style="display:flex;align-items:center;gap:14px">
      ${ring(s.total, color, 66)}
      <div style="flex:1">
        <div style="font-size:19px;font-weight:800">${s.total} <span class="small muted" style="font-weight:500">/ 100</span> <span class="pill ${s.tier === 'Platinum' || s.tier === 'Gold' ? 'green' : 'amber'}">${s.tier}</span></div>
        <div class="small muted" style="margin-top:3px">${esc(s.benefit.label)}</div>
      </div>
    </div></div>`;
}

function txRow(t) {
  const sign = t.type === 'income' ? '+' : t.type === 'save' ? '→' : t.type === 'invest' ? '→' : '-';
  const cls = t.type === 'income' ? 'in' : t.type === 'save' || t.type === 'invest' ? 'save' : '';
  const ic = t.type === 'income' ? '💰' : t.type === 'save' ? '🐷' : t.type === 'invest' ? '📈' : CAT_ICON[t.category] || '💠';
  return `<div class="row-item">
    <div class="ic">${ic}</div>
    <div class="t"><b>${esc(t.merchant)}</b><small>${dayTime(t.createdAt)}${t.pocketCode ? ' · ' + (t.pocketCode === 'fix' ? 'Fix Cost' : 'Week ' + t.pocketCode.slice(-1)) : ''}${t.riskLevel && t.riskLevel !== 'safe' ? ' · <span style="color:var(--orange)">ผ่านการเตือน</span>' : ''}</small></div>
    <div class="amt ${cls}">${sign}฿${B2(t.amount)}</div></div>`;
}

/* --------------------------- pockets ------------------------------ */
function pocketsView() {
  const d = App.data, s = d.safeToSpend, u = d.user;
  const alloc = d.pockets.reduce((a, p) => a + p.allocated, 0);
  const spent = d.pockets.reduce((a, p) => a + p.spent, 0);
  return `
  <div class="page-title"><h2>K Pockets</h2><p>วันเงินเดือนเข้า ระบบตัดอัตโนมัติเป็น 2 ซอง แล้วแตกเงินที่ใช้ได้เป็น 4 สัปดาห์</p></div>
  <div class="wrap" style="padding-top:12px">
    <div class="card">
      <div class="hd"><h3>แผนรอบ ${esc(d.cycle.key)}</h3><button class="lnk" onclick="openSheet('plan')">แก้ไขแผน</button></div>
      <div class="kv"><span>เงินเดือน</span><b>฿${B(u.salary)}</b></div>
      <div class="kv"><span>ซอง 1 · Fix Cost (ค่าคงที่)</span><b>฿${B(u.fixCost)}</b></div>
      <div class="kv"><span>ซอง 2 · เงินที่ใช้ได้ แตกเป็น 4 สัปดาห์</span><b>฿${B(u.salary - u.fixCost)}</b></div>
      <div class="bar" style="height:11px;margin-top:10px;display:flex">
        <i style="width:${(u.fixCost / u.salary) * 100}%;background:#48566a;border-radius:99px 0 0 99px"></i>
        <i style="width:${100 - (u.fixCost / u.salary) * 100}%;background:var(--green);border-radius:0 99px 99px 0"></i>
      </div>
      <div class="small muted" style="margin-top:6px">เงินเดือนออกทุกวันที่ ${u.paydayDay} · รอบถัดไป ${day(d.cycle.nextPayday)} (อีก ${d.cycle.daysLeft} วัน)</div>
    </div>

    <div class="card">
      <div class="hd"><h3>ซองทั้งหมด</h3><span class="small muted">ใช้ไป ฿${B(spent)} / ${B(alloc)}</span></div>
      ${d.pockets.map((p) => pocketRow(p, p.code === `week${s.week}`)).join('')}
      <button class="btn ghost sm" style="margin-top:12px" onclick="openSheet('move')">ย้ายเงินระหว่างซอง</button>
    </div>

    ${moveHistoryCard()}

    <div class="card">
      <h3>ทำไมต้องแบ่ง 4 สัปดาห์</h3>
      <p class="sub mb0">เด็กจบใหม่ส่วนใหญ่ใช้เงินหมดใน 10 วันแรก เพราะเห็นยอดคงเหลือก้อนใหญ่แล้วคิดว่าใช้ได้ทั้งหมด
      การกันเงินไว้ล่วงหน้าทำให้ยอด "ใช้ได้จริง" ลดลงเหลือเฉพาะสัปดาห์นี้ และรู้ทันทีว่าวันนี้ใช้ได้เท่าไหร่</p>
      <div class="kv" style="margin-top:10px"><span>ใช้ไปแล้วรอบนี้</span><b>${alloc ? Math.round((spent / alloc) * 100) : 0}% ของแผน</b></div>
      <div class="kv"><span>ผ่านมาแล้ว</span><b>${d.cycle.dayIndex + 1} / ${d.cycle.totalDays} วัน</b></div>
    </div>

    <div class="card">
      <div class="hd"><h3>รายการในซองนี้ (สัปดาห์ ${s.week})</h3></div>
      ${d.transactions.filter((t) => t.pocketCode === `week${s.week}`).slice(0, 8).map(txRow).join('') || '<div class="empty">ยังไม่มีรายการในสัปดาห์นี้</div>'}
    </div>
  </div>`;
}

/** ป้ายกำกับซอง: fix -> FIX, week2 -> W2 */
const pocketTag = (code) => (code === 'fix' ? 'FIX' : 'W' + String(code).slice(-1));

function moveRow(m, cycleKey) {
  const tagStyle = (c) => (c === 'fix' ? 'background:#eef1f4;color:#48566a' : 'background:var(--green-l);color:var(--green-d)');
  return `<div class="row-item">
    <div style="display:flex;align-items:center;gap:5px;flex:none">
      <span class="tag-sm" style="${tagStyle(m.from)}">${pocketTag(m.from)}</span>
      <span class="muted" style="font-size:13px">→</span>
      <span class="tag-sm" style="${tagStyle(m.to)}">${pocketTag(m.to)}</span>
    </div>
    <div class="t" style="margin-left:4px">
      <b>${esc(m.fromName)} → ${esc(m.toName)}</b>
      <small>${dayTime(m.createdAt)}${m.cycleKey !== cycleKey ? ' · รอบ ' + esc(m.cycleKey) : ''}${m.note ? ' · ' + esc(m.note) : ''}</small>
    </div>
    <div class="amt">฿${B(m.amount)}</div></div>`;
}

function moveHistoryCard() {
  const d = App.data;
  const moves = d.pocketMoves || [];
  const thisCycle = moves.filter((m) => m.cycleKey === d.cycle.key);
  const total = thisCycle.reduce((s, m) => s + m.amount, 0);
  return `<div class="card">
    <div class="hd"><h3>ประวัติการย้ายเงินระหว่างซอง</h3>
      ${moves.length > 6 ? '<button class="lnk" onclick="openSheet(\'allMoves\')">ดูทั้งหมด</button>' : ''}</div>
    ${moves.length ? `
      <p class="sub">รอบนี้ย้ายไปแล้ว ${thisCycle.length} ครั้ง รวม ฿${B(total)} · ทุกครั้งที่ยืมจากสัปดาห์หน้า ยอด "วันนี้ควรใช้" จะถูกคำนวณใหม่ให้ทันที</p>
      ${moves.slice(0, 6).map((m) => moveRow(m, d.cycle.key)).join('')}`
      : `<p class="sub mb0">ยังไม่เคยย้ายเงินระหว่างซองในรอบนี้ — ถ้าสัปดาห์ไหนมีรายจ่ายพิเศษ ย้ายเงินมาก่อนได้ แล้วระบบจะบันทึกไว้ให้ตรวจย้อนหลัง</p>`}
  </div>`;
}

/* --------------------------- transfer ----------------------------- */
function transferView() {
  const banks = App.meta.banks;
  const demo = [
    ['9876543210', 'KBank', 'บัญชีเปิดใหม่ 3 วัน'],
    ['6789012345', 'KTB', 'อยู่ใน blacklist'],
    ['3216549870', 'KBank', 'ร้านค้ายืนยันตัวตน'],
    ['7412589630', 'TTB', 'บัญชีปกติ'],
  ];
  return `
  <div class="page-title"><h2>โอนเงิน · Scam Radar</h2><p>ก่อนโอนทุกครั้ง เราจะบอกอายุบัญชีปลายทางและประวัติการถูกรายงาน</p></div>
  <div class="wrap" style="padding-top:12px">
    <div class="card">
      <div class="field"><label>ธนาคารปลายทาง</label>
        <select class="input" id="tf-bank">${banks.map((b) => `<option value="${b.code}">${esc(b.name)} (${b.code})</option>`).join('')}</select></div>
      <div class="field"><label>เลขที่บัญชี / พร้อมเพย์</label>
        <input class="input" id="tf-acc" inputmode="numeric" placeholder="เช่น 9876543210"></div>
      <div class="field"><label>จำนวนเงิน (บาท)</label>
        <input class="input" id="tf-amt" inputmode="decimal" placeholder="0.00"></div>
      <div class="field mb0"><label>บันทึกช่วยจำ</label>
        <input class="input" id="tf-note" placeholder="เช่น ค่าเสื้อจากเพจ"></div>
      <button class="btn" style="margin-top:14px" onclick="runCheck()">${svg('shield', 18)} ตรวจสอบบัญชีก่อนโอน</button>
      <div class="small muted center" style="margin-top:8px">ยอดคงเหลือ ฿${B2(App.data.user.balance)}</div>
    </div>

    <div class="card">
      <div class="hd"><h3>ลองเลขบัญชีตัวอย่าง</h3></div>
      <div class="chips">${demo.map(([no, bank, label]) =>
        `<button class="chip" onclick="fillDemo('${no}','${bank}')">${no.slice(0, 4)}···${no.slice(-4)} · ${label}</button>`).join('')}</div>
      <div class="small muted">ข้อมูลบัญชีและประวัติการรายงานทั้งหมดมาจากฐานข้อมูลจริงของระบบ ไม่ใช่ข้อความตายตัว</div>
    </div>

    <div class="card">
      <div class="hd"><h3>รายงานบัญชีมิจฉาชีพ</h3><button class="lnk" onclick="openSheet('myReports')">เคสของฉัน</button></div>
      <p class="sub">ทุกครั้งที่เราโอนเงิน สามารถทำการรายงานได้ ให้กับทางเจ้าหน้าที่หรือระบบตรวจสอบ และจะเก็บเป็นประวัติแสดงใน Scam Radar ของผู้ใช้คนอื่น</p>
      <button class="btn ghost" onclick="openSheet('report')">${svg('alert', 17)} แจ้งรายงานบัญชี</button>
    </div>

    <div class="card">
      <div class="hd"><h3>ประวัติการตรวจของฉัน</h3></div>
      <div id="radar-hist" class="empty">กำลังโหลด...</div>
    </div>
  </div>`;
}

function fillDemo(no, bank) { el('tf-acc').value = no; el('tf-bank').value = bank; if (!el('tf-amt').value) el('tf-amt').value = '1500'; }

async function runCheck() {
  const bank = el('tf-bank').value, accountNo = el('tf-acc').value.trim(), amount = Number(el('tf-amt').value || 0);
  const note = el('tf-note').value;
  if (accountNo.replace(/\D/g, '').length < 6) return toast('กรุณากรอกเลขบัญชีให้ครบ', 'bad');
  if (!(amount > 0)) return toast('กรุณากรอกจำนวนเงิน', 'bad');
  try {
    const r = await api('/api/radar/check', { userId: App.userId, bank, accountNo, amount });
    openSheet('radar', { ...r, note });
  } catch (e) { toast(e.message, 'bad'); }
}

async function loadRadarHistory() {
  const box = el('radar-hist'); if (!box) return;
  try {
    const rows = await api(`/api/radar/history?userId=${App.userId}`);
    box.className = '';
    box.innerHTML = rows.length ? rows.slice(0, 6).map((c) => {
      const cl = { safe: 'green', watch: 'amber', warn: 'amber', danger: 'red' }[c.riskLevel];
      return `<div class="row-item"><div class="ic">${c.aborted ? '🛑' : c.proceeded ? '✅' : '🔍'}</div>
      <div class="t"><b>${esc(c.bank)} ${esc(c.accountNo)}</b><small>${dayTime(c.createdAt)} · ${c.aborted ? 'ยกเลิกการโอนหลังเห็นคำเตือน' : c.proceeded ? 'โอนสำเร็จ' : 'ตรวจอย่างเดียว'}</small></div>
      <span class="pill ${cl}">เสี่ยง ${c.risk}</span></div>`;
    }).join('') : '<div class="empty">ยังไม่มีประวัติการตรวจ</div>';
  } catch (e) { box.textContent = 'โหลดประวัติไม่สำเร็จ'; }
}

/* ---------------------------- score ------------------------------- */
function scoreView() {
  const s = App.data.score;
  const color = s.total >= 85 ? '#00a950' : s.total >= 70 ? '#19b45f' : s.total >= 55 ? '#f5a623' : '#f2751a';
  const tiers = App.meta.tiers;
  return `
  <div class="page-title"><h2>First Jobber Score</h2><p>วัดสุขภาพการเงิน 5 ด้าน คะแนนสูงขึ้น = ดอกเบี้ยเงินฝากขั้นบันไดและวงเงินสินเชื่อที่ดีขึ้น</p></div>
  <div class="wrap" style="padding-top:12px">
    <div class="card gauge-wrap">
      ${ring(s.total, color, 132)}
      <div style="margin-top:8px"><span class="pill ${s.total >= 70 ? 'green' : 'amber'}" style="font-size:13px;padding:6px 14px">ระดับ ${s.tier}</span></div>
      <div class="note ok" style="margin-top:12px;text-align:left">สิทธิประโยชน์ที่ได้ตอนนี้: ${esc(s.benefit.label)}</div>
    </div>

    <div class="card">
      <div class="hd"><h3>คะแนนรายด้าน</h3><span class="small muted">ถ่วงน้ำหนักรวม 100</span></div>
      ${s.dims.map((d) => {
        const c = d.score >= 80 ? 'var(--green)' : d.score >= 55 ? 'var(--amber)' : 'var(--red)';
        return `<div class="dim">
          <div class="top"><span>${esc(d.name)} <span class="small muted">· น้ำหนัก ${Math.round(d.weight * 100)}%</span></span><b style="color:${c}">${d.score}</b></div>
          <div class="bar"><i style="width:${d.score}%;background:${c}"></i></div>
          <div class="ad">${esc(d.advice)}</div></div>`;
      }).join('')}
    </div>

    <div class="card">
      <div class="hd"><h3>ไต่ระดับเพื่อรับสิทธิ์เพิ่ม</h3></div>
      ${Object.entries(tiers).map(([name, t]) => `<div class="row-item">
        <div class="ic" style="background:${name === s.tier ? 'var(--green-l)' : '#f1f4f7'}">${name === s.tier ? '⭐' : '🔒'}</div>
        <div class="t"><b>${name}${name === s.tier ? ' · ระดับปัจจุบัน' : ''}</b><small>${esc(t.label)}</small></div>
      </div>`).join('')}
    </div>

    <div class="card">
      <div class="hd"><h3>สรุปพฤติกรรมรอบนี้</h3></div>
      <div class="kv"><span>ออมไปแล้วรอบนี้</span><b>฿${B2(s.savedThisCycle)} (${s.savingRate}% ของเงินเดือน)</b></div>
      <div class="kv"><span>เงินสำรองฉุกเฉิน</span><b>${s.bufferMonths} เดือน (เป้าหมาย 3 เดือน)</b></div>
      <div class="kv"><span>เงินออมรวม</span><b>฿${B2(App.data.user.savings)}</b></div>
    </div>
  </div>`;
}

/* ----------------------------- tax -------------------------------- */
function taxView() {
  const u = App.data.user;
  const now = new Date();
  const startMonth = Number((u.startWorkMonth || '').split('-')[1] || 1);
  const autoMonths = Math.max(1, Math.min(12, now.getMonth() + 1 - startMonth + 1));
  return `
  <div class="page-title"><h2>Tax Coach ปีแรก</h2><p>คำนวณภาษีจากเงินเดือนจริงตั้งแต่เริ่มทำงานกลางปี พร้อมบอกว่าควรซื้อกองทุนลดหย่อนเท่าไหร่</p></div>
  <div class="wrap" style="padding-top:12px">
    <div class="card">
      <div class="hd"><h3>ข้อมูลรายได้ปี ${now.getFullYear() + 543}</h3></div>
      <div class="grid2">
        <div class="field"><label>เงินเดือน (ต่อเดือน)</label><input class="input" id="tx-salary" inputmode="numeric" value="${u.salary}"></div>
        <div class="field"><label>จำนวนเดือนที่มีรายได้</label><input class="input" id="tx-months" inputmode="numeric" value="${autoMonths}"></div>
      </div>
      <div class="grid2">
        <div class="field"><label>โบนัส/รายได้อื่น</label><input class="input" id="tx-bonus" inputmode="numeric" value="0"></div>
        <div class="field"><label>ภาษีที่ถูกหัก ณ ที่จ่าย</label><input class="input" id="tx-withheld" inputmode="numeric" value="0"></div>
      </div>
      <div class="grid2">
        <div class="field"><label>เบี้ยประกันชีวิต</label><input class="input" id="tx-ins" inputmode="numeric" value="0"></div>
        <div class="field"><label>เลี้ยงดูบิดามารดา (คน)</label><input class="input" id="tx-par" inputmode="numeric" value="0"></div>
      </div>
      <button class="btn" onclick="runTax()">คำนวณภาษีของฉัน</button>
      <div class="small muted center" style="margin-top:8px">เริ่มงานเดือน ${esc(u.startWorkMonth || '-')} · ระบบเติมจำนวนเดือนให้อัตโนมัติ</div>
    </div>
    <div id="tax-result"></div>
  </div>`;
}

async function runTax() {
  const body = {
    userId: App.userId,
    salary: Number(el('tx-salary').value || 0),
    monthsWorked: Number(el('tx-months').value || 0),
    bonus: Number(el('tx-bonus').value || 0),
    withheld: Number(el('tx-withheld').value || 0),
    insurance: Number(el('tx-ins').value || 0),
    parents: Number(el('tx-par').value || 0),
  };
  try {
    const t = await api('/api/tax/preview', body);
    App._tax = t;
    el('tax-result').innerHTML = taxResultView(t);
  } catch (e) { toast(e.message, 'bad'); }
}

function taxResultView(t) {
  const zero = t.taxBefore === 0;
  const opt = t.scenarios.find((s) => s.key === 'optimal');
  return `
  <div class="card">
    <div class="hd"><h3>สรุปภาษีของคุณ</h3><span class="pill ${zero ? 'green' : 'amber'}">${zero ? 'ปีนี้ไม่ต้องเสียภาษี' : 'ต้องเสียภาษี'}</span></div>
    <div class="kv"><span>รายได้ทั้งปี (${t.months} เดือน)</span><b>฿${B(t.income)}</b></div>
    <div class="kv"><span>หักค่าใช้จ่าย 50% (ไม่เกิน 100,000)</span><b>-฿${B(t.deductions.expense)}</b></div>
    <div class="kv"><span>ลดหย่อนส่วนตัว</span><b>-฿${B(t.deductions.personal)}</b></div>
    <div class="kv"><span>ประกันสังคม</span><b>-฿${B(t.deductions.sso)}</b></div>
    ${t.deductions.insurance ? `<div class="kv"><span>เบี้ยประกันชีวิต</span><b>-฿${B(t.deductions.insurance)}</b></div>` : ''}
    ${t.deductions.parents ? `<div class="kv"><span>เลี้ยงดูบิดามารดา</span><b>-฿${B(t.deductions.parents)}</b></div>` : ''}
    <div class="kv" style="border-top:1px dashed var(--line);margin-top:6px;padding-top:9px"><span>เงินได้สุทธิ</span><b>฿${B(t.netIncome)}</b></div>
    <div class="kv"><span>ภาษีที่ต้องจ่าย</span><b style="color:${zero ? 'var(--green-d)' : 'var(--red)'};font-size:16px">฿${B(t.taxBefore)}</b></div>
    <div class="kv"><span>ขั้นภาษีสูงสุดที่โดน</span><b>${t.marginalRate}%</b></div>
    ${t.withheld > 0 ? `<div class="kv"><span>${t.balanceDue < 0 ? 'ขอคืนภาษีได้' : 'ต้องจ่ายเพิ่ม'}</span><b style="color:${t.balanceDue < 0 ? 'var(--green-d)' : 'var(--red)'}">฿${B(Math.abs(t.balanceDue))}</b></div>` : ''}
    <div class="note" style="margin-top:12px">ยื่นภาษีภายใน ${esc(t.filingDeadline)} · แม้ภาษีเป็น 0 ก็ยังต้องยื่นแบบ ภ.ง.ด.91 ถ้ามีรายได้เกิน 120,000 บาทต่อปี</div>
  </div>

  ${zero ? `<div class="card">
    <h3>ปีแรกของคุณยังไม่ถึงเกณฑ์เสียภาษี</h3>
    <p class="sub">เพราะทำงานแค่ ${t.months} เดือน รายได้สุทธิ ฿${B(t.netIncome)} ยังไม่เกิน 150,000 บาท
    ปีหน้าที่ทำงานเต็ม 12 เดือนจะเริ่มเสียภาษี เราคำนวณล่วงหน้าไว้ให้แล้ว</p>
    ${nextYearBox(t)}
  </div>` : `
  <div class="card">
    <div class="hd"><h3>ซื้อกองทุนลดหย่อนเท่าไหร่ถึงคุ้ม</h3></div>
    ${t.scenarios.filter((s) => s.invest > 0 || s.key === 'none').map((s) => {
      const ic = { none: '😐', recommended: '⭐', light: '🙂', optimal: '🤩' }[s.key];
      return `<div class="row-item" style="${s.key === 'recommended' ? 'background:var(--green-l);margin:0 -8px;padding:10px 8px;border-radius:10px' : ''}">
      <div class="ic">${ic}</div>
      <div class="t"><b>${esc(s.label)}</b><small>ลงทุน ฿${B(s.invest)} · เหลือภาษี ฿${B(s.tax)}${s.efficiency ? ' · คืนกลับ ' + s.efficiency + '% ของเงินที่ลง' : ''}</small></div>
      <div class="amt ${s.saved > 0 ? 'in' : ''}">${s.saved > 0 ? 'ประหยัด ฿' + B(s.saved) : '-'}</div></div>`;
    }).join('')}
    <div class="note warn" style="margin-top:12px">การซื้อให้ภาษีเหลือ 0 ต้องใช้เงินถึง ฿${B(t.suggestOptimal)} เพื่อประหยัดภาษี ฿${B(opt.saved)}
    ซึ่งมากเกินไปสำหรับคนเพิ่งเริ่มทำงาน เราจึงแนะนำที่ ฿${B(t.suggestRecommended)} ก่อน</div>
  </div>

  ${t.suggestRecommended > 0 ? `<div class="card">
    <div class="hd"><h3>ตะกร้าแนะนำ · คลิกเดียวซื้อครบ</h3><span class="pill violet">รวม ฿${B(t.suggestRecommended)}</span></div>
    ${t.products.map((p) => `<div class="row-item">
      <div class="ic">📈</div>
      <div class="t"><b>${esc(p.name)}</b><small>${esc(p.type)} · ${esc(p.lock)} · ความเสี่ยงระดับ ${p.risk}</small></div>
      <div class="amt">฿${B(p.amount)}</div></div>`).join('')}
    <div class="note" style="margin-top:12px">${esc(t.liquidityNote)}</div>
    <button class="btn" onclick="openSheet('taxBuy',{amount:${t.suggestRecommended}})">ซื้อทั้งตะกร้า ฿${B(t.suggestRecommended)}</button>
    <div class="small muted center" style="margin-top:8px">ต้นแบบ: ตัดจากเงินออม/ยอดคงเหลือในระบบจำลอง</div>
  </div>` : ''}`}`;
}

function nextYearBox(t) {
  const full = Math.round(t.salary * 12);
  return `<div class="note" style="margin-top:10px">ประมาณการปีหน้า (ทำงาน 12 เดือน รายได้ ฿${B(full)}):
  ภาษีราว ฿${B(estimateFullYear(t.salary))} ต่อปี — เริ่มทยอยซื้อกองทุนลดหย่อนตั้งแต่ต้นปีจะเฉลี่ยภาระได้ดีกว่าซื้อรวดเดียวเดือนธันวาคม</div>`;
}
function estimateFullYear(salary) {
  const income = salary * 12;
  const net = Math.max(0, income - Math.min(income * 0.5, 100000) - 60000 - 9000);
  const brackets = [[150000, 0], [300000, .05], [500000, .1], [750000, .15], [1000000, .2], [2000000, .25]];
  let tax = 0, prev = 0;
  for (const [cap, rate] of brackets) { if (net > prev) tax += (Math.min(net, cap) - prev) * rate; prev = cap; if (net <= cap) break; }
  return Math.round(tax);
}

/* ---------------------------- sheets ------------------------------ */
function sheetView() {
  const views = {
    expense: sheetExpense, save: sheetSave, report: sheetReport, radar: sheetRadar,
    plan: sheetPlan, move: sheetMove, allMoves: sheetAllMoves, roundupSet: sheetRoundup, settings: sheetSettings,
    myReports: sheetMyReports, allTx: sheetAllTx, taxBuy: sheetTaxBuy, transferOk: sheetTransferOk,
  };
  const fn = views[App.sheet];
  if (!fn) return '';
  return `<div class="sheet-bg" onclick="if(event.target===this)closeSheet()">
    <div class="sheet"><div class="grab"></div>${fn(App.sheetData || {})}</div></div>`;
}

function sheetExpense() {
  const cats = App.meta.categories;
  const r = App.data.roundup;
  return `<h3>บันทึกค่าใช้จ่าย</h3>
  <p class="sub">หักจากซองสัปดาห์ที่ ${App.data.safeToSpend.week} โดยอัตโนมัติ${r.enabled ? ` · Round-up ปัดขึ้นทีละ ${r.step} บาท` : ''}</p>
  <div class="field"><label>จำนวนเงิน</label><input class="input" id="ex-amt" inputmode="decimal" placeholder="เช่น 48" autofocus></div>
  <div class="field"><label>ร้านค้า / รายการ</label><input class="input" id="ex-mc" placeholder="เช่น 7-Eleven"></div>
  <div class="field"><label>หมวดหมู่</label><select class="input" id="ex-cat">${cats.map((c) => `<option value="${c.code}">${esc(c.label)}</option>`).join('')}</select></div>
  <div class="chips">${[48, 120, 250, 590].map((v) => `<button class="chip" onclick="el('ex-amt').value=${v}">฿${v}</button>`).join('')}</div>
  <button class="btn" onclick="submitExpense()">บันทึก</button>`;
}
async function submitExpense() {
  const amount = Number(el('ex-amt').value || 0);
  if (!(amount > 0)) return toast('กรุณากรอกจำนวนเงิน', 'bad');
  const body = { userId: App.userId, amount, merchant: el('ex-mc').value.trim() || 'ร้านค้า', category: el('ex-cat').value };
  const r = await act(() => api('/api/expense', body));
  closeSheet();
  toast(r.roundup ? `บันทึกแล้ว · ปัด ${B(r.roundup.amount)} เป็น ${B(r.roundup.rounded)} เก็บเข้ากองทุน +฿${B2(r.roundup.diff)}` : 'บันทึกค่าใช้จ่ายแล้ว', 'good');
}

function sheetSave() {
  return `<h3>ออมเพิ่มเข้ากองทุน</h3>
  <p class="sub">ย้ายเงินจากบัญชีเข้ากองทุนออม (ยอดคงเหลือ ฿${B2(App.data.user.balance)})</p>
  <div class="field"><label>จำนวนเงิน</label><input class="input" id="sv-amt" inputmode="decimal" placeholder="0.00" autofocus></div>
  <div class="chips">${[200, 500, 1000, 2000].map((v) => `<button class="chip" onclick="el('sv-amt').value=${v}">฿${B(v)}</button>`).join('')}</div>
  <button class="btn" onclick="submitSave()">ออมเลย</button>`;
}
async function submitSave() {
  const amount = Number(el('sv-amt').value || 0);
  if (!(amount > 0)) return toast('กรุณากรอกจำนวนเงิน', 'bad');
  await act(() => api('/api/save', { userId: App.userId, amount }));
  closeSheet(); toast(`ออมเพิ่ม ฿${B(amount)} เรียบร้อย`, 'good');
}

function sheetRoundup() {
  const r = App.data.roundup;
  return `<h3>ตั้งค่า Round-up</h3>
  <p class="sub">จ่าย 48 บาท ปัดเป็น 50 บาท ส่วนต่าง 2 บาทเข้ากองทุนอัตโนมัติ เปิด/ปิดได้ตลอดเวลา</p>
  <div class="row-item"><div class="t"><b>เปิดใช้งาน Round-up</b><small>ทำงานกับทุกการจ่ายในแอป</small></div>
    <div class="switch ${r.enabled ? 'on' : ''}" onclick="toggleRoundup()"><i></i></div></div>
  <div class="field" style="margin-top:14px"><label>ปัดขึ้นทีละ</label>
    <div class="chips">${App.meta.roundupSteps.map((s) => `<button class="chip ${r.step === s ? 'on' : ''}" onclick="setStep(${s})">${s} บาท</button>`).join('')}</div></div>
  <div class="note">รอบนี้เก็บได้ ฿${B2(r.thisCycle)} จาก ${r.count} รายการ · สะสมทั้งหมด ฿${B2(r.total)}</div>
  <button class="btn ghost" onclick="closeSheet()">ปิด</button>`;
}
const setStep = (step) => act(() => api('/api/roundup', { userId: App.userId, step }), `ปรับเป็นปัดขึ้นทีละ ${step} บาท`);

function sheetPlan() {
  const u = App.data.user;
  return `<h3>แก้ไขแผน K Pockets</h3>
  <p class="sub">ปรับเงินเดือน ค่าคงที่ และวันเงินเดือนออก ระบบจะคำนวณซองใหม่ให้ทันที</p>
  <div class="field"><label>เงินเดือน (บาท)</label><input class="input" id="pl-sal" inputmode="numeric" value="${u.salary}"></div>
  <div class="field"><label>Fix Cost ต่อเดือน (ค่าห้อง ค่าน้ำไฟ ค่างวด)</label><input class="input" id="pl-fix" inputmode="numeric" value="${u.fixCost}"></div>
  <div class="field"><label>เงินเดือนออกวันที่</label><input class="input" id="pl-day" inputmode="numeric" value="${u.paydayDay}"></div>
  <div class="note" id="pl-preview">เงินที่ใช้ได้ ฿${B(u.salary - u.fixCost)} → สัปดาห์ละ ฿${B((u.salary - u.fixCost) / 4)}</div>
  <button class="btn" onclick="submitPlan()">บันทึกแผน</button>`;
}
async function submitPlan() {
  const body = { userId: App.userId, salary: Number(el('pl-sal').value || 0), fixCost: Number(el('pl-fix').value || 0), paydayDay: Number(el('pl-day').value || 25) };
  if (body.fixCost > body.salary) return toast('Fix Cost มากกว่าเงินเดือน', 'bad');
  await act(() => api('/api/plan', body));
  closeSheet(); toast('อัปเดตแผนเรียบร้อย', 'good');
}

function sheetMove() {
  const d = App.data;
  const cur = `week${d.safeToSpend.week}`;
  const opt = (sel) => d.pockets.map((p) =>
    `<option value="${p.code}" ${p.code === sel ? 'selected' : ''}>${esc(p.name)} (เหลือ ฿${B(p.remaining)})</option>`).join('');
  const src = d.pockets.filter((p) => p.code !== cur).sort((a, b) => b.remaining - a.remaining)[0];
  const recent = (d.pocketMoves || []).slice(0, 3);
  return `<h3>ย้ายเงินระหว่างซอง</h3>
  <p class="sub">เช่น สัปดาห์นี้มีงานเลี้ยง ยืมจากสัปดาห์หน้ามาก่อนได้ ทุกครั้งจะถูกบันทึกเป็นประวัติไว้ตรวจย้อนหลัง</p>
  <div class="field"><label>จากซอง</label><select class="input" id="mv-from">${opt(src ? src.code : 'week4')}</select></div>
  <div class="field"><label>ไปซอง</label><select class="input" id="mv-to">${opt(cur)}</select></div>
  <div class="field"><label>จำนวนเงิน</label><input class="input" id="mv-amt" inputmode="decimal" placeholder="0.00"></div>
  <div class="chips">${[200, 500, 1000].map((v) => `<button class="chip" onclick="el('mv-amt').value=${v}">฿${B(v)}</button>`).join('')}</div>
  <div class="field"><label>เหตุผล (ไม่บังคับ แต่ช่วยให้ย้อนดูได้ว่าเงินหายไปไหน)</label>
    <input class="input" id="mv-note" placeholder="เช่น งานเลี้ยงรุ่น, ค่าหมอฟัน" maxlength="120"></div>
  <div class="chips">${['งานเลี้ยงรุ่น', 'ค่ารักษาพยาบาล', 'ของขวัญวันเกิด', 'ค่าซ่อมรถ'].map((v) =>
    `<button class="chip" onclick="el('mv-note').value='${v}'">${v}</button>`).join('')}</div>
  <button class="btn" onclick="submitMove()">ย้ายเงิน</button>
  ${recent.length ? `<div style="margin-top:16px;border-top:1px solid var(--line);padding-top:8px">
    <div class="small muted" style="margin-bottom:2px">ย้ายล่าสุด</div>
    ${recent.map((m) => moveRow(m, d.cycle.key)).join('')}</div>` : ''}`;
}
async function submitMove() {
  const body = {
    userId: App.userId, from: el('mv-from').value, to: el('mv-to').value,
    amount: Number(el('mv-amt').value || 0), note: el('mv-note').value.trim(),
  };
  if (body.from === body.to) return toast('เลือกซองต้นทางกับปลายทางให้ต่างกัน', 'bad');
  if (!(body.amount > 0)) return toast('กรุณากรอกจำนวนเงิน', 'bad');
  const r = await act(() => api('/api/pockets/move', body));
  closeSheet();
  toast(`ย้าย ฿${B(r.move.amount)} จาก ${r.move.fromName} → ${r.move.toName} แล้ว (เหลือในซองต้นทาง ฿${B(r.move.fromLeft)})`, 'good');
}

function sheetAllMoves() {
  const d = App.data;
  const moves = d.pocketMoves || [];
  return `<h3>ประวัติการย้ายเงินระหว่างซอง</h3>
  <p class="sub">ทั้งหมด ${moves.length} ครั้ง (ล่าสุด 20 รายการ)</p>
  ${moves.map((m) => moveRow(m, d.cycle.key)).join('') || '<div class="empty">ยังไม่มีประวัติ</div>'}`;
}

function sheetRadar(d) {
  const iconOf = { ok: ['ok', '✓'], new: ['warn', '🕐'], report: ['bad', '⚑'], ban: ['bad', '⛔'], amount: ['warn', '฿'], time: ['warn', '🌙'], first: ['warn', '★'], unknown: ['warn', '?'] };
  return `
  <div class="risk-hd ${d.color}">
    <div class="small" style="opacity:.9">คะแนนความเสี่ยงบัญชีปลายทาง</div>
    <div class="score">${d.risk}</div>
    <div class="lv">${esc(d.label)}</div>
    <div class="ac">${esc(d.action)}</div>
  </div>
  <div class="card tight" style="box-shadow:none;border:1px solid var(--line)">
    <div class="kv"><span>บัญชีปลายทาง</span><b>${esc(d.bank)} ${esc(d.accountNo)}</b></div>
    <div class="kv"><span>ชื่อบัญชี</span><b>${esc(d.accountName)}</b></div>
    <div class="kv"><span>อายุบัญชี</span><b>${d.accountAgeDays == null ? 'ไม่พบข้อมูล' : d.accountAgeDays < 60 ? d.accountAgeDays + ' วัน' : Math.round(d.accountAgeDays / 30) + ' เดือน'}</b></div>
    <div class="kv"><span>ถูกรายงาน</span><b style="color:${d.reportCount ? 'var(--red)' : 'inherit'}">${d.reportCount} ครั้ง</b></div>
    <div class="kv"><span>ยอดที่จะโอน</span><b>฿${B2(d.amount)}</b></div>
  </div>
  <div style="margin:14px 0 6px;font-weight:700;font-size:14px">เหตุผลที่ประเมินแบบนี้</div>
  ${d.reasons.map((r) => {
    const [cls, ic] = iconOf[r.icon] || ['warn', '•'];
    return `<div class="reason"><div class="b ${r.weight < 0 ? 'ok' : cls}">${ic}</div><div>${esc(r.text)}</div></div>`;
  }).join('')}
  ${d.recentReports.length ? `<div class="note warn" style="margin-top:12px">รายงานล่าสุด: ${d.recentReports.map((r) => `${esc(labelOfType(r.type))} (${day(r.createdAt)})`).join(' · ')}</div>` : ''}
  ${d.risk >= 45
    // เสี่ยงสูง: ทำให้ "ยกเลิก" เป็นปุ่มหลัก และดันปุ่มโอนต่อให้เป็นทางเลือกรอง
    ? `<button class="btn" style="margin-top:16px" onclick="abortTransfer('${d.checkId}')">ยกเลิกการโอน (แนะนำ)</button>
       <button class="btn ghost sm" style="margin-top:9px;color:var(--red)" onclick="doTransfer()">ฉันเข้าใจความเสี่ยง ยืนยันโอนต่อ ฿${B2(d.amount)}</button>`
    : `<div class="btn-row" style="margin-top:16px">
        <button class="btn ghost" onclick="abortTransfer('${d.checkId}')">ยกเลิก</button>
        <button class="btn" onclick="doTransfer()">โอนเงิน ฿${B2(d.amount)}</button>
      </div>`}
  <button class="btn ghost sm" style="margin-top:10px" onclick="openSheet('report',{bank:'${esc(d.bank)}',accountNo:'${esc(d.accountNo)}',accountName:'${esc(d.accountName)}'})">รายงานบัญชีนี้ให้เจ้าหน้าที่ตรวจสอบ</button>`;
}
function labelOfType(code) { const t = App.meta.reportTypes.find((x) => x.code === code); return t ? t.label : code; }

async function abortTransfer(checkId) {
  try {
    const r = await api('/api/transfer/abort', { userId: App.userId, checkId });
    closeSheet();
    toast(`ยกเลิกการโอนแล้ว ป้องกันความเสี่ยงได้ ฿${B(r.prevented)}`, 'good');
    await loadState();
    if (App.tab === 'transfer') loadRadarHistory();
  } catch (e) { toast(e.message, 'bad'); }
}

async function doTransfer() {
  const d = App.sheetData;
  const body = { userId: App.userId, checkId: d.checkId, bank: d.bank, accountNo: d.accountNo, accountName: d.accountName, amount: d.amount, note: d.note };
  try {
    const r = await act(() => api('/api/transfer', body));
    openSheet('transferOk', { ...d, tx: r.tx });
  } catch (e) { /* toast แล้ว */ }
}

function sheetTransferOk(d) {
  return `<div class="center" style="padding:10px 0 4px">
    <div style="width:64px;height:64px;border-radius:50%;background:var(--green-l);color:var(--green-d);display:grid;place-items:center;font-size:30px;margin:0 auto 12px">✓</div>
    <h3>โอนเงินสำเร็จ</h3>
    <p class="sub">${esc(d.bank)} ${esc(d.accountNo)} · ฿${B2(d.amount)}</p></div>
  <div class="note">ถ้าภายหลังพบว่าถูกหลอก ให้กดรายงานบัญชีนี้ทันที ระบบจะส่งต่อให้เจ้าหน้าที่และเตือนผู้ใช้คนอื่นใน Scam Radar</div>
  <button class="btn danger" onclick="openSheet('report',{bank:'${esc(d.bank)}',accountNo:'${esc(d.accountNo)}',accountName:'${esc(d.accountName)}',amount:${d.amount}})">รายงานบัญชีนี้</button>
  <button class="btn ghost" style="margin-top:9px" onclick="closeSheet()">เสร็จสิ้น</button>`;
}

function sheetReport(d) {
  const banks = App.meta.banks, types = App.meta.reportTypes;
  return `<h3>รายงานบัญชีต้องสงสัย</h3>
  <p class="sub">ข้อมูลจะถูกส่งให้เจ้าหน้าที่ตรวจสอบ เมื่อยืนยันแล้วจะแสดงเป็นประวัติใน Scam Radar ให้ผู้ใช้คนอื่นเห็นทันที</p>
  <div class="field"><label>ธนาคาร</label><select class="input" id="rp-bank">${banks.map((b) => `<option value="${b.code}" ${d.bank === b.code ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}</select></div>
  <div class="field"><label>เลขที่บัญชี</label><input class="input" id="rp-acc" inputmode="numeric" value="${esc(d.accountNo || '')}"></div>
  <div class="field"><label>ชื่อบัญชี (ถ้าทราบ)</label><input class="input" id="rp-name" value="${esc(d.accountName || '')}"></div>
  <div class="field"><label>ประเภทการหลอกลวง</label><select class="input" id="rp-type">${types.map((t) => `<option value="${t.code}">${esc(t.label)}</option>`).join('')}</select></div>
  <div class="field"><label>ความเสียหาย (บาท)</label><input class="input" id="rp-amt" inputmode="decimal" value="${d.amount || 0}"></div>
  <div class="field"><label>รายละเอียดเหตุการณ์</label><textarea class="input" id="rp-detail" placeholder="เล่าสั้น ๆ ว่าเกิดอะไรขึ้น เช่น สั่งของจากเพจแล้วถูกบล็อก"></textarea></div>
  <button class="btn danger" onclick="submitReport()">ส่งรายงานให้เจ้าหน้าที่</button>
  <div class="small muted center" style="margin-top:8px">ต้นแบบนี้จำลองการส่งต่อไปยังศูนย์ AOC 1441</div>`;
}
async function submitReport() {
  const body = {
    userId: App.userId, bank: el('rp-bank').value, accountNo: el('rp-acc').value.trim(),
    accountName: el('rp-name').value.trim(), type: el('rp-type').value,
    amount: Number(el('rp-amt').value || 0), detail: el('rp-detail').value.trim(),
  };
  if (body.accountNo.replace(/\D/g, '').length < 6) return toast('กรุณากรอกเลขบัญชี', 'bad');
  try {
    const r = await api('/api/reports', body);
    closeSheet(); await loadState();
    toast(`ส่งรายงานแล้ว เลขเคส ${r.caseNo} · ส่งต่อ ${r.forwardedTo}`, 'good');
    if (App.tab === 'transfer') loadRadarHistory();
  } catch (e) { toast(e.message, 'bad'); }
}

function sheetMyReports() {
  return `<h3>เคสที่ฉันรายงาน</h3><p class="sub">ติดตามสถานะการตรวจสอบจากเจ้าหน้าที่</p>
  <div id="my-reports" class="empty">กำลังโหลด...</div>`;
}
async function loadMyReports() {
  const box = el('my-reports'); if (!box) return;
  const rows = await api(`/api/reports/mine?userId=${App.userId}`);
  const st = { pending: ['amber', 'รอตรวจสอบ'], verified: ['red', 'ยืนยันแล้ว เป็นบัญชีเสี่ยง'], rejected: ['grey', 'หลักฐานไม่พอ'] };
  box.className = '';
  box.innerHTML = rows.length ? rows.map((r) => `<div class="row-item">
    <div class="ic">${r.status === 'verified' ? '⛔' : r.status === 'pending' ? '⏳' : '➖'}</div>
    <div class="t"><b>${esc(r.bank)} ${esc(r.accountNo)}</b><small>${esc(r.caseNo)} · ${day(r.createdAt)} · ${esc(labelOfType(r.type))}</small></div>
    <span class="pill ${st[r.status][0]}">${st[r.status][1]}</span></div>`).join('')
    : '<div class="empty">ยังไม่เคยรายงานบัญชี</div>';
}

function sheetAllTx() {
  return `<h3>รายการทั้งหมด</h3><p class="sub">รอบ ${esc(App.data.cycle.key)}</p>
  ${App.data.transactions.map(txRow).join('') || '<div class="empty">ยังไม่มีรายการ</div>'}`;
}

function sheetTaxBuy(d) {
  const u = App.data.user;
  return `<h3>ยืนยันการซื้อกองทุนลดหย่อน</h3>
  <p class="sub">ตัดเงินจากกองทุนออม (฿${B2(u.savings)}) หรือยอดคงเหลือ</p>
  <div class="field"><label>จำนวนเงินที่จะซื้อ</label><input class="input" id="tb-amt" inputmode="decimal" value="${d.amount || 0}"></div>
  <div class="note">การซื้อจะถูกบันทึกเป็นรายการจริงในระบบ และแสดงในรายงานหลังบ้านทันที</div>
  <button class="btn" onclick="submitTaxBuy()">ยืนยันซื้อ</button>`;
}
async function submitTaxBuy() {
  const amount = Number(el('tb-amt').value || 0);
  if (!(amount > 0)) return toast('จำนวนเงินไม่ถูกต้อง', 'bad');
  await act(() => api('/api/tax/buy', { userId: App.userId, amount, basket: (App._tax && App._tax.products) || [] }));
  closeSheet(); toast(`ซื้อกองทุนลดหย่อน ฿${B(amount)} เรียบร้อย`, 'good');
}

function sheetSettings() {
  const u = App.data.user;
  return `<h3>ตั้งค่า</h3><p class="sub">${esc(u.name)} · ${esc(u.company)}</p>
  <div class="row-item"><div class="ic">👤</div><div class="t"><b>${esc(u.name)}</b><small>${esc(u.jobTitle)} · เริ่มงาน ${esc(u.startWorkMonth || '-')}</small></div></div>
  <div class="row-item" onclick="closeSheet();openSheet('plan')" style="cursor:pointer"><div class="ic">💼</div><div class="t"><b>แผน K Pockets</b><small>เงินเดือน ฿${B(u.salary)} · Fix ฿${B(u.fixCost)} · จ่ายวันที่ ${u.paydayDay}</small></div><span class="muted">›</span></div>
  <div class="row-item" onclick="closeSheet();openSheet('roundupSet')" style="cursor:pointer"><div class="ic">🐷</div><div class="t"><b>Round-up</b><small>${u.roundupEnabled ? 'เปิดใช้งาน · ปัดทีละ ' + u.roundupStep + ' บาท' : 'ปิดอยู่'}</small></div><span class="muted">›</span></div>
  <div class="row-item" onclick="closeSheet();openSheet('myReports')" style="cursor:pointer"><div class="ic">📋</div><div class="t"><b>เคสที่ฉันรายงาน</b><small>ติดตามสถานะการตรวจสอบ</small></div><span class="muted">›</span></div>
  <a class="row-item" href="/admin" target="_blank" style="text-decoration:none;color:inherit"><div class="ic">🖥️</div><div class="t"><b>หลังบ้าน (Ops Console)</b><small>สำหรับเจ้าหน้าที่ธนาคาร</small></div><span class="muted">›</span></a>
  <button class="btn ghost" style="margin-top:14px" onclick="logout()">เปลี่ยนผู้ใช้</button>`;
}

/* -------------------- post-render side effects --------------------- */
const _render = render;
render = function () {
  _render();
  if (App.tab === 'transfer' && !App.sheet) setTimeout(loadRadarHistory, 0);
  if (App.sheet === 'myReports') setTimeout(loadMyReports, 0);
};

window.addEventListener('DOMContentLoaded', () => {
  boot().catch((e) => { el('app').innerHTML = `<div class="empty" style="padding:60px 20px">เชื่อมต่อเซิร์ฟเวอร์ไม่ได้<br><small>${esc(e.message)}</small></div>`; });
});
