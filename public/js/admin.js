/* K PLUS Ops Console - หลังบ้าน (vanilla) */
'use strict';

const S = {
  token: sessionStorage.getItem('kp_admin') || null,
  page: 'overview', range: 30, ov: null, reports: [], filter: 'pending', q: '', modal: null,
};

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const N = (n) => (Number(n) || 0).toLocaleString('th-TH', { maximumFractionDigits: 0 });
const N2 = (n) => (Number(n) || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const compact = (n) => (n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e4 ? Math.round(n / 1e3) + 'k' : N(n));
const dshort = (s) => new Date(s).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
const dfull = (s) => new Date(s).toLocaleString('th-TH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

async function api(path, body, method) {
  const res = await fetch(path, {
    method: method || (body ? 'POST' : 'GET'),
    headers: { 'Content-Type': 'application/json', ...(S.token ? { 'x-admin-token': S.token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await res.json().catch(() => ({}));
  if (res.status === 401) { S.token = null; sessionStorage.removeItem('kp_admin'); render(); throw new Error(j.error || 'หมดเวลาเข้าสู่ระบบ'); }
  if (!res.ok) throw new Error(j.error || 'เกิดข้อผิดพลาด');
  return j;
}

let tt;
function toast(m) { const o = $('.toast'); if (o) o.remove(); const t = document.createElement('div'); t.className = 'toast'; t.textContent = m; document.body.appendChild(t); clearTimeout(tt); tt = setTimeout(() => t.remove(), 3000); }

/* ================================================================== */
/* charts                                                              */
/* ================================================================== */

/** เส้นเวลา ซีรีส์เดียว (ชื่อกราฟทำหน้าที่แทน legend) */
function lineChart(data, opt = {}) {
  const w = 720, h = 190, pl = 46, pr = 12, pt = 14, pb = 26;
  const iw = w - pl - pr, ih = h - pt - pb;
  const vals = data.map((d) => d.value);
  const max = Math.max(...vals, 1) * 1.15;
  const x = (i) => pl + (data.length < 2 ? iw / 2 : (i / (data.length - 1)) * iw);
  const y = (v) => pt + ih - (v / max) * ih;
  const line = data.map((d, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(d.value).toFixed(1)}`).join(' ');
  const area = `${line} L${x(data.length - 1).toFixed(1)},${pt + ih} L${x(0).toFixed(1)},${pt + ih} Z`;
  const ticks = [0, 0.5, 1].map((f) => Math.round(max * f));
  const step = iw / Math.max(1, data.length - 1);
  const fmt = opt.fmt || ((v) => N2(v));

  return `<div class="chart"><div class="tip"></div>
  <svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(opt.aria || '')}">
    ${ticks.map((t) => `<g><line x1="${pl}" x2="${w - pr}" y1="${y(t)}" y2="${y(t)}" stroke="var(--c-grid)" stroke-width="1"/>
      <text x="${pl - 8}" y="${y(t) + 4}" text-anchor="end" font-size="10.5" fill="var(--c-axis)">${compact(t)}</text></g>`).join('')}
    <path d="${area}" fill="var(--c-accent)" opacity=".10"/>
    <path d="${line}" fill="none" stroke="var(--c-accent)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
    <circle id="mk-${opt.id}" r="4.5" fill="var(--c-accent)" stroke="var(--card)" stroke-width="2" opacity="0"/>
    ${data.map((d, i) => i % Math.ceil(data.length / 6) === 0 || i === data.length - 1
      ? `<text x="${x(i)}" y="${h - 7}" text-anchor="middle" font-size="10.5" fill="var(--c-axis)">${dshort(d.date)}</text>` : '').join('')}
    ${data.map((d, i) => `<rect x="${(x(i) - step / 2).toFixed(1)}" y="${pt}" width="${step.toFixed(1)}" height="${ih}" fill="transparent"
      data-tip="${esc(dshort(d.date))} · <b>${esc(fmt(d.value))}</b>" data-py="${((y(d.value) - pt) / ih).toFixed(3)}"
      data-mk="mk-${opt.id}" data-mx="${x(i).toFixed(1)}" data-my="${y(d.value).toFixed(1)}"/>`).join('')}
  </svg></div>`;
}

/** แท่งรายวัน ซีรีส์เดียว */
function barChart(data, opt = {}) {
  const w = 720, h = 190, pl = 40, pr = 12, pt = 14, pb = 26;
  const iw = w - pl - pr, ih = h - pt - pb;
  const max = Math.max(...data.map((d) => d.value), 1) * 1.15;
  const slot = iw / data.length, bw = Math.max(3, slot - 2); // เว้นช่องว่าง 2px ระหว่างแท่ง
  const fmt = opt.fmt || ((v) => N(v) + ' ครั้ง');
  const ticks = [0, 0.5, 1].map((f) => Math.round(max * f));
  const y = (v) => pt + ih - (v / max) * ih;

  return `<div class="chart"><div class="tip"></div>
  <svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(opt.aria || '')}">
    ${ticks.map((t) => `<g><line x1="${pl}" x2="${w - pr}" y1="${y(t)}" y2="${y(t)}" stroke="var(--c-grid)" stroke-width="1"/>
      <text x="${pl - 8}" y="${y(t) + 4}" text-anchor="end" font-size="10.5" fill="var(--c-axis)">${compact(t)}</text></g>`).join('')}
    ${data.map((d, i) => {
      const bh = Math.max(d.value > 0 ? 3 : 0, (d.value / max) * ih);
      return `<rect x="${(pl + i * slot + 1).toFixed(1)}" y="${(pt + ih - bh).toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}"
        rx="3" fill="var(--c-accent)" opacity="${d.value ? 1 : .25}"
        data-tip="${esc(dshort(d.date))} · <b>${esc(fmt(d.value))}</b>" data-py="0"/>`;
    }).join('')}
    ${data.map((d, i) => i % Math.ceil(data.length / 6) === 0 || i === data.length - 1
      ? `<text x="${(pl + i * slot + bw / 2).toFixed(1)}" y="${h - 7}" text-anchor="middle" font-size="10.5" fill="var(--c-axis)">${dshort(d.date)}</text>` : '').join('')}
  </svg></div>`;
}

/** โดนัท + legend พร้อมตัวเลข (ไม่พึ่งสีอย่างเดียว) */
function donut(items, opt = {}) {
  const total = items.reduce((s, i) => s + i.value, 0);
  const R = 62, r = 40, cx = 80, cy = 80;
  let a0 = -Math.PI / 2;
  const arcs = items.filter((i) => i.value > 0).map((it) => {
    const frac = it.value / (total || 1);
    const a1 = a0 + frac * Math.PI * 2 - 0.02; // เว้นช่องว่างบาง ๆ ระหว่างชิ้น
    const big = frac > 0.5 ? 1 : 0;
    const p = (ang, rad) => `${(cx + Math.cos(ang) * rad).toFixed(2)},${(cy + Math.sin(ang) * rad).toFixed(2)}`;
    const d = `M${p(a0, R)} A${R},${R} 0 ${big} 1 ${p(a1, R)} L${p(a1, r)} A${r},${r} 0 ${big} 0 ${p(a0, r)} Z`;
    a0 = a1 + 0.02;
    return `<path d="${d}" fill="${it.color}" data-tip="${esc(it.label)} · <b>${N(it.value)}</b> (${Math.round(frac * 100)}%)" data-py="0"/>`;
  }).join('');
  return `<div class="chart" style="display:flex;gap:18px;align-items:center;flex-wrap:wrap"><div class="tip"></div>
    <svg viewBox="0 0 160 160" width="150" height="150" style="flex:none" role="img" aria-label="${esc(opt.aria || '')}">
      ${arcs || `<circle cx="80" cy="80" r="51" fill="none" stroke="var(--c-grid)" stroke-width="22"/>`}
      <text x="80" y="76" text-anchor="middle" font-size="24" font-weight="800" fill="var(--ink)">${N(total)}</text>
      <text x="80" y="94" text-anchor="middle" font-size="11" fill="var(--c-axis)">${esc(opt.unit || 'รายการ')}</text>
    </svg>
    <div class="legend" style="flex-direction:column;gap:7px;margin:0">
      ${items.map((i) => `<div><i style="background:${i.color}"></i>${esc(i.label)} <b>${N(i.value)}</b>
        <span class="muted mini">${total ? Math.round((i.value / total) * 100) : 0}%</span></div>`).join('')}
    </div></div>`;
}

/** แท่งแนวนอน สีเดียว มีตัวเลขกำกับตรง ๆ */
function hbars(items, opt = {}) {
  const max = Math.max(...items.map((i) => i.value), 1);
  const fmt = opt.fmt || N;
  return `<div style="display:grid;gap:10px">${items.map((i) => `
    <div>
      <div style="display:flex;justify-content:space-between;font-size:12.5px;margin-bottom:4px">
        <span>${esc(i.label)}${i.note ? ` <span class="muted mini">${esc(i.note)}</span>` : ''}</span>
        <b class="mono">${esc(fmt(i.value))}</b></div>
      <div class="bar-line"><i style="width:${(i.value / max) * 100}%;background:${i.color || 'var(--c-accent)'}"></i></div>
    </div>`).join('')}</div>`;
}

function wireTips() {
  $$('.chart').forEach((ch) => {
    const tip = $('.tip', ch); if (!tip) return;
    $$('[data-tip]', ch).forEach((node) => {
      node.style.cursor = 'crosshair';
      node.addEventListener('mouseenter', () => {
        const r = node.getBoundingClientRect(), cr = ch.getBoundingClientRect();
        tip.innerHTML = node.dataset.tip;
        tip.style.left = `${r.left - cr.left + r.width / 2}px`;
        tip.style.top = `${r.top - cr.top + r.height * Number(node.dataset.py || 0)}px`;
        tip.classList.add('on');
        if (node.dataset.mk) {
          const mk = document.getElementById(node.dataset.mk);
          if (mk) { mk.setAttribute('cx', node.dataset.mx); mk.setAttribute('cy', node.dataset.my); mk.setAttribute('opacity', '1'); }
        }
      });
      node.addEventListener('mouseleave', () => {
        tip.classList.remove('on');
        if (node.dataset.mk) { const mk = document.getElementById(node.dataset.mk); if (mk) mk.setAttribute('opacity', '0'); }
      });
    });
  });
}

const RISK_COLOR = { safe: 'var(--c-safe)', watch: 'var(--c-watch)', warn: 'var(--c-warn)', danger: 'var(--c-danger)' };
const TIER_COLOR = { Bronze: '#cfe8d8', Silver: '#8fd1ad', Gold: '#3fae74', Platinum: '#0d8a4a' }; // ไล่เฉดเดียว อ่อน->เข้ม

/* ================================================================== */
/* shell                                                               */
/* ================================================================== */

function render() {
  const root = $('#root');
  if (!S.token) { root.innerHTML = loginView(); return; }
  if (!S.ov) { root.innerHTML = '<div class="empty">กำลังโหลดรายงาน...</div>'; return; }
  const pages = { overview: pageOverview, users: pageUsers, fraud: pageFraud, watchlist: pageWatchlist, data: pageData };
  root.innerHTML = `<div class="layout">${sidebar()}<main class="main">${pages[S.page]()}</main></div>${S.modal ? modalView() : ''}`;
  wireTips();
}

function sidebar() {
  const pending = S.ov.kpi.reportsPending;
  const items = [
    ['overview', '📊', 'ภาพรวม'],
    ['users', '👥', 'ผู้ใช้ First Jobber'],
    ['fraud', '🛡️', 'คิวตรวจสอบรายงาน', pending],
    ['watchlist', '⛔', 'บัญชีเฝ้าระวัง'],
    ['data', '📦', 'ข้อมูล / ส่งออก'],
  ];
  return `<aside class="sidebar">
    <div class="brand"><div class="mark">K</div><div><b>K PLUS Ops</b><small>First Jobber Program</small></div></div>
    <nav class="nav">${items.map(([k, ic, label, badge]) =>
      `<button class="${S.page === k ? 'on' : ''}" onclick="goPage('${k}')"><span>${ic}</span>${label}
        ${badge ? `<span class="badge">${badge}</span>` : ''}</button>`).join('')}</nav>
    <div class="foot">ข้อมูลอัปเดต ${dfull(S.ov.generatedAt)}<br>คำนวณสดจากฐานข้อมูลจริง<br>
      <button class="btn ghost sm" style="margin-top:8px" onclick="logout()">ออกจากระบบ</button></div>
  </aside>`;
}

function goPage(p) { S.page = p; if (p === 'fraud') loadReports(); else render(); }
function logout() { S.token = null; sessionStorage.removeItem('kp_admin'); S.ov = null; render(); }

function loginView() {
  return `<div class="login-wrap"><form class="login-box" onsubmit="doLogin(event)">
    <div class="brand" style="margin-bottom:14px"><div class="mark">K</div><div><b>K PLUS Ops Console</b><small>หลังบ้านสำหรับเจ้าหน้าที่</small></div></div>
    <h2>เข้าสู่ระบบ</h2>
    <p>ดูรายงานผลการใช้งานจริงของโปรแกรม First Jobber และตรวจสอบบัญชีที่ถูกรายงาน</p>
    <input class="inp" id="pw" type="password" placeholder="รหัสผ่าน" value="kplus2026" autofocus>
    <button class="btn" type="submit">เข้าสู่ระบบ</button>
    <p style="margin-top:12px;text-align:center">รหัสผ่านสำหรับต้นแบบ: <code>kplus2026</code></p>
  </form></div>`;
}

async function doLogin(e) {
  e.preventDefault();
  try {
    const r = await api('/api/admin/login', { password: $('#pw').value });
    S.token = r.token; sessionStorage.setItem('kp_admin', r.token);
    await refresh();
  } catch (err) { toast(err.message); }
}

async function refresh() {
  S.ov = await api(`/api/admin/overview?range=${S.range}`);
  render();
}

/* ================================================================== */
/* page: overview                                                      */
/* ================================================================== */

function pageOverview() {
  const k = S.ov.kpi;
  const tiles = [
    { lb: 'ผู้ใช้ในโปรแกรม', v: N(k.users), d: `บริหารเงินเดือนรวม ฿${N(k.salaryManaged)}/เดือน`, cls: '' },
    { lb: 'เงินออมสะสมรวม', v: '฿' + compact(k.savingsTotal), d: `จาก Round-up ฿${N(k.roundupTotal)} (${N(k.roundupCount)} ครั้ง)`, cls: 'accent' },
    { lb: 'คะแนนเฉลี่ย First Jobber', v: k.avgScore, d: `จาก 100 · เปิด Round-up ${k.roundupAdoption}%`, cls: '' },
    { lb: 'ความเสียหายที่ป้องกันได้', v: '฿' + compact(k.lossPrevented), d: `${k.transfersAborted} รายการที่ยกเลิกหลังเห็นคำเตือน`, cls: 'good' },
    { lb: 'บัญชีเสี่ยงที่ตรวจพบ', v: N(k.radarFlagged), d: `จากการตรวจทั้งหมด ${N(k.radarChecks)} ครั้ง`, cls: 'bad' },
    { lb: 'รายงานรอตรวจสอบ', v: N(k.reportsPending), d: `ทั้งหมด ${N(k.reportsTotal)} เคส · ยืนยันแล้ว ${k.reportsVerified}`, cls: k.reportsPending ? 'bad' : '' },
  ];

  return `
  ${pageHead('ภาพรวมโปรแกรม First Jobber', 'ทุกตัวเลขคำนวณสดจากพฤติกรรมการใช้งานจริงในแอป', true)}

  <div class="grid g6" style="margin-bottom:14px">
    ${tiles.map((t) => `<div class="kpi ${t.cls}"><div class="lb">${esc(t.lb)}</div><div class="v">${t.v}</div><div class="d">${esc(t.d)}</div></div>`).join('')}
  </div>

  <div class="grid g2" style="margin-bottom:14px">
    <div class="card"><h3>เงินออมจาก Round-up รายวัน</h3><p class="sub">ผลรวมส่วนต่างที่ปัดขึ้นเข้ากองทุนของผู้ใช้ทุกคน (${S.range} วันล่าสุด)</p>
      ${lineChart(S.ov.series.roundup, { id: 'ru', fmt: (v) => '฿' + N2(v), aria: 'เงินออมจาก Round-up รายวัน' })}</div>
    <div class="card"><h3>การตรวจบัญชีด้วย Scam Radar รายวัน</h3><p class="sub">จำนวนครั้งที่ผู้ใช้กดตรวจบัญชีปลายทางก่อนโอน</p>
      ${barChart(S.ov.series.checks, { aria: 'จำนวนการตรวจบัญชีรายวัน' })}</div>
  </div>

  <div class="grid g3" style="margin-bottom:14px">
    <div class="card"><h3>ผลการประเมินความเสี่ยง</h3><p class="sub">แบ่งตามระดับที่ Scam Radar ประเมินได้</p>
      ${donut(S.ov.riskMix.map((r) => ({ label: r.label, value: r.count, color: RISK_COLOR[r.level] })), { unit: 'ครั้ง', aria: 'สัดส่วนระดับความเสี่ยง' })}</div>
    <div class="card"><h3>คะแนนเฉลี่ยราย 5 ด้าน</h3><p class="sub">ชี้ว่าควรออกแคมเปญช่วยเรื่องไหนก่อน</p>
      ${hbars(S.ov.dimAvg.map((d) => ({ label: d.name, value: d.avg })), { fmt: (v) => v + ' / 100' })}</div>
    <div class="card"><h3>ระดับ First Jobber Score</h3><p class="sub">จำนวนผู้ใช้ในแต่ละระดับสิทธิประโยชน์</p>
      ${hbars(Object.entries(S.ov.tierCount).map(([t, c]) => ({ label: t, value: c, color: TIER_COLOR[t] })), { fmt: (v) => v + ' คน' })}
      <p class="sub" style="margin:12px 0 0">ผู้ใช้ที่ใช้เงินเร็วกว่าแผนตอนนี้ <b>${S.ov.kpi.overspendUsers}</b> คน</p></div>
  </div>

  <div class="grid g2" style="margin-bottom:14px">
    <div class="card"><h3>ประเภทการหลอกลวงที่ถูกรายงาน</h3><p class="sub">เรียงตามจำนวนเคสที่ผู้ใช้แจ้งเข้ามา</p>
      ${S.ov.reportTypes.length ? hbars(S.ov.reportTypes.map((t) => ({ label: t.label, value: t.count, note: t.amount ? `ความเสียหาย ฿${N(t.amount)}` : '' })), { fmt: (v) => v + ' เคส' })
        : '<div class="empty">ยังไม่มีรายงาน</div>'}</div>
    <div class="card"><h3>หมวดค่าใช้จ่ายของกลุ่ม First Jobber</h3><p class="sub">ยอดรวมที่บันทึกผ่าน K Pockets</p>
      ${S.ov.categoryMix.length ? hbars(S.ov.categoryMix.slice(0, 7).map((c) => ({ label: c.label, value: c.amount })), { fmt: (v) => '฿' + N(v) })
        : '<div class="empty">ยังไม่มีข้อมูล</div>'}</div>
  </div>

  <div class="grid g21">
    <div class="card"><h3>ผู้ใช้ที่ควรจับตา</h3><p class="sub">เรียงจากคะแนนน้อยไปมาก เพื่อส่งคำแนะนำหรือแคมเปญช่วยเหลือ</p>
      ${userTable(S.ov.users.slice().sort((a, b) => a.score - b.score).slice(0, 6))}</div>
    <div class="card"><h3>กิจกรรมล่าสุด</h3><p class="sub">เหตุการณ์จริงจากฝั่งแอป</p>
      <div class="feed">${S.ov.activity.slice(0, 14).map(feedItem).join('') || '<div class="empty">ยังไม่มีกิจกรรม</div>'}</div></div>
  </div>`;
}

function pageHead(title, sub, withRange) {
  return `<div class="page-hd"><div><h1>${esc(title)}</h1><p>${esc(sub)}</p></div>
    <div class="tools">
      ${withRange ? `<div class="seg">${[7, 30, 90].map((r) => `<button class="${S.range === r ? 'on' : ''}" onclick="setRange(${r})">${r} วัน</button>`).join('')}</div>` : ''}
      <button class="btn ghost" onclick="refresh()">รีเฟรช</button>
    </div></div>`;
}
function setRange(r) { S.range = r; refresh(); }

const EVENT_LABEL = {
  salary_allocated: ['เงินเดือนเข้า ตัดเข้าซองอัตโนมัติ', 'var(--c-accent)'],
  expense: ['บันทึกค่าใช้จ่าย', 'var(--ink-3)'],
  roundup: ['Round-up เก็บเศษเข้ากองทุน', 'var(--violet)'],
  manual_save: ['ออมเพิ่มด้วยตัวเอง', 'var(--violet)'],
  bill_paid: ['จ่ายบิลประจำ', 'var(--ink-3)'],
  radar_check: ['ตรวจบัญชีก่อนโอนด้วย Scam Radar', 'var(--blue)'],
  transfer: ['โอนเงิน', 'var(--ink-3)'],
  transfer_aborted: ['ยกเลิกการโอนหลังเห็นคำเตือน', 'var(--c-safe)'],
  scam_report: ['รายงานบัญชีมิจฉาชีพ', 'var(--c-danger)'],
  report_reviewed: ['เจ้าหน้าที่ตรวจสอบรายงาน', 'var(--c-warn)'],
  tax_fund_bought: ['ซื้อกองทุนลดหย่อนภาษี', 'var(--violet)'],
  plan_updated: ['ปรับแผน K Pockets', 'var(--ink-3)'],
  pocket_moved: ['ย้ายเงินระหว่างซอง', 'var(--ink-3)'],
  roundup_setting: ['ปรับตั้งค่า Round-up', 'var(--ink-3)'],
};

function feedItem(e) {
  const [label, color] = EVENT_LABEL[e.type] || [e.type, 'var(--ink-3)'];
  const p = e.payload || {};
  const pk = (c) => (c === 'fix' ? 'Fix Cost' : 'Week ' + String(c).slice(-1));
  const detail = e.type === 'pocket_moved'
    ? `${pk(p.from)} → ${pk(p.to)} ฿${N(p.amount)}${p.note ? ' · ' + p.note : ''}`
    : p.amount != null ? `฿${N(p.amount)}` : p.accountNo ? `บัญชี ${p.accountNo}` : p.salary ? `฿${N(p.salary)}` : '';
  return `<div class="it"><span class="dot" style="background:${color}"></span>
    <div><b>${esc(e.userName)}</b> · ${esc(label)} ${detail ? `<span class="muted">${esc(detail)}</span>` : ''}
    ${p.level ? `<span class="tag ${p.level === 'danger' || p.level === 'warn' ? 'red' : p.level === 'watch' ? 'amber' : 'green'}">${esc(p.level)}</span>` : ''}</div>
    <span class="tm">${dfull(e.createdAt)}</span></div>`;
}

/* ================================================================== */
/* page: users                                                         */
/* ================================================================== */

function pageUsers() {
  return `${pageHead('ผู้ใช้ First Jobber', 'สุขภาพการเงินรายคน คำนวณจากซองเงิน การออม และพฤติกรรมความปลอดภัย')}
  <div class="card">${userTable(S.ov.users, true)}</div>`;
}

function userTable(rows, full) {
  const tier = (t) => `<span class="tag ${t === 'Platinum' || t === 'Gold' ? 'green' : t === 'Silver' ? 'blue' : 'grey'}">${t}</span>`;
  const sts = { ahead: ['green', 'ต่ำกว่าแผน'], onTrack: ['green', 'ตามแผน'], over: ['red', 'ใช้เกินแผน'] };
  return `<div class="tbl-wrap"><table>
    <thead><tr><th>ผู้ใช้</th><th class="num">เงินเดือน</th><th class="num">คงเหลือ</th><th class="num">เงินออม</th>
      <th class="num">อัตราออม</th><th>คะแนน</th><th>ระดับ</th><th>สถานะการใช้จ่าย</th>
      ${full ? '<th class="num">วันนี้ใช้ได้</th><th class="num">ย้ายซอง</th><th class="num">ตรวจบัญชี</th><th class="num">รายงาน</th><th>Round-up</th>' : ''}</tr></thead>
    <tbody>${rows.map((u) => `<tr>
      <td><b>${esc(u.name)}</b><div class="muted mini">${esc(u.jobTitle)}</div></td>
      <td class="num mono">${N(u.salary)}</td>
      <td class="num mono">${N(u.balance)}</td>
      <td class="num mono">${N(u.savings)}</td>
      <td class="num mono">${u.savingRate}%</td>
      <td><div style="display:flex;align-items:center;gap:8px"><b class="mono">${u.score}</b>
        <div class="bar-line" style="width:56px"><i style="width:${u.score}%"></i></div></div></td>
      <td>${tier(u.tier)}</td>
      <td><span class="tag ${sts[u.stsStatus][0]}">${sts[u.stsStatus][1]}</span> <span class="muted mini">ใช้ซองไป ${u.pocketUsage}%</span></td>
      ${full ? `<td class="num mono">฿${N2(u.todayBudget)}</td>
        <td class="num mono">${u.moves ? `${u.moves} · ฿${N(u.movedAmount)}` : '<span class="muted">-</span>'}</td>
        <td class="num mono">${u.checks}</td><td class="num mono">${u.reports}</td>
        <td>${u.roundupEnabled ? '<span class="tag green">เปิด</span>' : '<span class="tag grey">ปิด</span>'}</td>` : ''}
    </tr>`).join('')}</tbody></table></div>`;
}

/* ================================================================== */
/* page: fraud queue                                                   */
/* ================================================================== */

async function loadReports() {
  S.reports = await api(`/api/admin/reports?status=${S.filter}&q=${encodeURIComponent(S.q)}`);
  render();
}

function pageFraud() {
  const counts = { pending: S.ov.kpi.reportsPending, verified: S.ov.kpi.reportsVerified, all: S.ov.kpi.reportsTotal };
  const tabs = [['pending', 'รอตรวจสอบ'], ['verified', 'ยืนยันแล้ว'], ['rejected', 'ปฏิเสธ'], ['all', 'ทั้งหมด']];
  const st = { pending: ['amber', 'รอตรวจสอบ'], verified: ['red', 'ยืนยันเป็นบัญชีเสี่ยง'], rejected: ['grey', 'ปฏิเสธ'] };

  return `
  <div class="page-hd"><div><h1>คิวตรวจสอบรายงานบัญชี</h1>
    <p>เคสที่ผู้ใช้แจ้งเข้ามาจากแอป เมื่อกดยืนยัน ผลจะไปแสดงใน Scam Radar ของผู้ใช้ทุกคนทันที</p></div>
    <div class="tools">
      <input class="inp" placeholder="ค้นหาเลขบัญชี / ชื่อ / เลขเคส" value="${esc(S.q)}" oninput="S.q=this.value" onkeydown="if(event.key==='Enter')loadReports()">
      <button class="btn ghost" onclick="loadReports()">ค้นหา</button>
    </div></div>

  <div class="grid g4" style="margin-bottom:14px">
    <div class="kpi bad"><div class="lb">รอตรวจสอบ</div><div class="v">${N(counts.pending)}</div><div class="d">ควรตรวจภายใน 24 ชม.</div></div>
    <div class="kpi"><div class="lb">ยืนยันแล้ว</div><div class="v">${N(counts.verified)}</div><div class="d">ส่งต่อ AOC 1441 แล้ว</div></div>
    <div class="kpi"><div class="lb">เคสทั้งหมด</div><div class="v">${N(counts.all)}</div><div class="d">ความเสียหายรวม ฿${N(S.ov.kpi.reportedDamage)}</div></div>
    <div class="kpi good"><div class="lb">ป้องกันได้ก่อนโอน</div><div class="v">฿${compact(S.ov.kpi.lossPrevented)}</div><div class="d">${S.ov.kpi.transfersAborted} รายการ</div></div>
  </div>

  <div class="card">
    <div class="seg" style="margin-bottom:12px">${tabs.map(([k, l]) => `<button class="${S.filter === k ? 'on' : ''}" onclick="setFilter('${k}')">${l}</button>`).join('')}</div>
    <div class="tbl-wrap"><table>
      <thead><tr><th>เลขเคส</th><th>วันที่แจ้ง</th><th>ผู้แจ้ง</th><th>บัญชีปลายทาง</th><th>ประเภท</th>
        <th class="num">ความเสียหาย</th><th class="num">เคสบัญชีนี้</th><th>สถานะ</th><th></th></tr></thead>
      <tbody>${S.reports.map((r) => `<tr>
        <td class="mono">${esc(r.caseNo)}</td>
        <td class="mini">${dfull(r.createdAt)}</td>
        <td>${esc(r.reporterName)}</td>
        <td><b class="mono">${esc(r.bank)} ${esc(r.accountNo)}</b><div class="muted mini">${esc(r.accountName || '-')}</div></td>
        <td>${esc(r.typeLabel)}</td>
        <td class="num mono">${r.amount ? '฿' + N(r.amount) : '<span class="muted">ยกเลิกทัน</span>'}</td>
        <td class="num mono">${r.sameAccountCount}</td>
        <td><span class="tag ${st[r.status][0]}">${st[r.status][1]}</span></td>
        <td><div class="row-actions"><button class="btn ghost sm" onclick="openCase('${r.id}')">ตรวจสอบ</button></div></td>
      </tr>`).join('') || '<tr><td colspan="9"><div class="empty">ไม่มีเคสในสถานะนี้</div></td></tr>'}</tbody>
    </table></div>
  </div>`;
}
function setFilter(f) { S.filter = f; loadReports(); }

function openCase(id) { S.modal = { type: 'case', id }; render(); }
function closeModal() { S.modal = null; render(); }

function modalView() {
  if (S.modal.type !== 'case') return '';
  const r = S.reports.find((x) => x.id === S.modal.id);
  if (!r) return '';
  return `<div class="modal-bg" onclick="if(event.target===this)closeModal()"><div class="modal">
    <h3>ตรวจสอบเคส ${esc(r.caseNo)}</h3>
    <p class="muted mini" style="margin:0 0 14px">แจ้งเมื่อ ${dfull(r.createdAt)} · ส่งต่อ ${esc(r.forwardedTo)}</p>
    <div class="kv"><span>ผู้แจ้ง</span><b>${esc(r.reporterName)}</b></div>
    <div class="kv"><span>บัญชีปลายทาง</span><b class="mono">${esc(r.bank)} ${esc(r.accountNo)}</b></div>
    <div class="kv"><span>ชื่อบัญชี</span><b>${esc(r.accountName || '-')}</b></div>
    <div class="kv"><span>ประเภท</span><b>${esc(r.typeLabel)}</b></div>
    <div class="kv"><span>ความเสียหาย</span><b>฿${N(r.amount)}</b></div>
    <div class="kv"><span>จำนวนเคสของบัญชีนี้</span><b>${r.sameAccountCount} เคส</b></div>
    <div class="kv"><span>สถานะปัจจุบัน</span><b>${esc(r.status)}</b></div>
    <div style="margin:12px 0"><div class="muted mini" style="margin-bottom:4px">รายละเอียดจากผู้แจ้ง</div>
      <div style="background:var(--bg);border-radius:10px;padding:10px;font-size:13px">${esc(r.detail || '-')}</div></div>
    ${r.reviewedAt ? `<div class="kv"><span>ตรวจโดย</span><b>${esc(r.reviewer)} · ${dfull(r.reviewedAt)}</b></div>` : ''}
    <div style="margin:14px 0 10px"><label style="font-size:12.5px;display:flex;gap:8px;align-items:center">
      <input type="checkbox" id="bl" ${r.status === 'verified' ? 'checked' : ''}> ขึ้นบัญชีดำ (blacklist) ทันทีเมื่อยืนยัน</label></div>
    <input class="inp" id="note" style="width:100%;margin-bottom:12px" placeholder="บันทึกของเจ้าหน้าที่" value="${esc(r.reviewNote || '')}">
    <div style="display:flex;gap:8px">
      <button class="btn red" style="flex:1" onclick="review('${r.id}','verified')">ยืนยันว่าเป็นบัญชีเสี่ยง</button>
      <button class="btn ghost" style="flex:1" onclick="review('${r.id}','rejected')">หลักฐานไม่พอ</button>
      <button class="btn ghost" onclick="closeModal()">ปิด</button>
    </div>
    <p class="muted mini" style="margin:12px 0 0">เมื่อกดยืนยัน ระบบจะเพิ่มจำนวนครั้งที่ถูกรายงานของบัญชีนี้ และ Scam Radar ฝั่งผู้ใช้จะเตือนแรงขึ้นทันที</p>
  </div></div>`;
}

async function review(id, status) {
  try {
    await api('/api/admin/reports/review', { id, status, blacklist: $('#bl') ? $('#bl').checked : false, note: $('#note') ? $('#note').value : '', reviewer: 'ops.console' });
    S.modal = null;
    await Promise.all([refresh(), loadReports()]);
    toast(status === 'verified' ? 'ยืนยันแล้ว · Scam Radar อัปเดตทันที' : 'บันทึกผลการตรวจสอบแล้ว');
  } catch (e) { toast(e.message); }
}

/* ================================================================== */
/* page: watchlist                                                     */
/* ================================================================== */

function pageWatchlist() {
  const rows = S.ov.watchlist;
  return `${pageHead('บัญชีเฝ้าระวัง', 'จัดอันดับจากคะแนนความเสี่ยงที่ระบบประเมิน ใช้ข้อมูลรายงานที่ยืนยันแล้วเป็นหลัก')}
  <div class="grid g12">
    <div class="card">
      <h3>เพิ่ม/แก้ไขบัญชีในระบบ</h3><p class="sub">สำหรับข้อมูลที่ได้รับจากหน่วยงานภายนอก</p>
      <div style="display:grid;gap:9px">
        <input class="inp" id="w-bank" placeholder="ธนาคาร เช่น KBank" style="width:100%">
        <input class="inp" id="w-acc" placeholder="เลขที่บัญชี" style="width:100%">
        <input class="inp" id="w-name" placeholder="ชื่อบัญชี" style="width:100%">
        <input class="inp" id="w-open" type="date" style="width:100%">
        <label class="mini"><input type="checkbox" id="w-bl"> ขึ้นบัญชีดำ</label>
        <label class="mini"><input type="checkbox" id="w-mule"> เข้าข่ายบัญชีม้า</label>
        <label class="mini"><input type="checkbox" id="w-vm"> ร้านค้ายืนยันตัวตน (ลดความเสี่ยง)</label>
        <button class="btn" onclick="addAccount()">บันทึกข้อมูลบัญชี</button>
      </div>
    </div>
    <div class="card">
      <h3>อันดับบัญชีเสี่ยง</h3><p class="sub">คลิกเลขบัญชีเพื่อคัดลอก</p>
      <div class="tbl-wrap"><table>
        <thead><tr><th>บัญชี</th><th>ชื่อ</th><th class="num">อายุบัญชี</th><th class="num">ถูกรายงาน</th>
          <th class="num">ยืนยันแล้ว</th><th class="num">ความเสียหาย</th><th>ระดับ</th><th>แจ้งล่าสุด</th></tr></thead>
        <tbody>${rows.map((w) => `<tr>
          <td><b class="mono" style="cursor:pointer" onclick="navigator.clipboard&&navigator.clipboard.writeText('${w.accountNo}')">${esc(w.bank)} ${esc(w.accountNo)}</b>
            ${w.blacklisted ? '<span class="tag red">blacklist</span>' : ''}</td>
          <td>${esc(w.accountName || '-')}</td>
          <td class="num mono">${w.ageDays == null ? '<span class="muted">ไม่พบ</span>' : w.ageDays < 60 ? w.ageDays + ' วัน' : Math.round(w.ageDays / 30) + ' เดือน'}</td>
          <td class="num mono">${w.total}</td>
          <td class="num mono">${w.verified}</td>
          <td class="num mono">฿${N(w.amount)}</td>
          <td><span class="tag ${w.level === 'danger' ? 'red' : w.level === 'warn' ? 'red' : w.level === 'watch' ? 'amber' : 'green'}">${esc(w.levelLabel)} ${w.risk}</span></td>
          <td class="mini">${dfull(w.lastAt)}</td>
        </tr>`).join('') || '<tr><td colspan="8"><div class="empty">ยังไม่มีบัญชีที่ถูกรายงาน</div></td></tr>'}</tbody>
      </table></div>
    </div>
  </div>`;
}

async function addAccount() {
  try {
    await api('/api/admin/accounts', {
      bank: $('#w-bank').value.trim(), accountNo: $('#w-acc').value.trim(), accountName: $('#w-name').value.trim(),
      openedAt: $('#w-open').value ? new Date($('#w-open').value).toISOString() : undefined,
      blacklisted: $('#w-bl').checked, mule: $('#w-mule').checked, verifiedMerchant: $('#w-vm').checked,
    });
    await refresh(); toast('บันทึกข้อมูลบัญชีแล้ว');
  } catch (e) { toast(e.message); }
}

/* ================================================================== */
/* page: data / export                                                 */
/* ================================================================== */

function pageData() {
  const k = S.ov.kpi;
  const files = [
    ['users', 'ผู้ใช้ + คะแนนสุขภาพการเงิน', `${k.users} แถว`],
    ['reports', 'เคสรายงานบัญชีมิจฉาชีพ', `${k.reportsTotal} แถว`],
    ['checks', 'ประวัติการตรวจด้วย Scam Radar', `${k.radarChecks} แถว`],
    ['moves', 'ประวัติการย้ายเงินระหว่างซอง', `${k.pocketMoves} แถว`],
    ['transactions', 'รายการเงินเข้า-ออกทั้งหมด', 'ทุกแถว'],
  ];
  return `${pageHead('ข้อมูลและการส่งออก', 'ดาวน์โหลดผลการใช้งานจริงเป็น CSV (เปิดด้วย Excel ได้ รองรับภาษาไทย)')}
  <div class="grid g2">
    <div class="card"><h3>ส่งออกรายงาน</h3><p class="sub">ไฟล์สร้างสดจากฐานข้อมูลขณะที่กด</p>
      <div style="display:grid;gap:9px">${files.map(([k2, label, n]) => `
        <div style="display:flex;align-items:center;gap:10px;padding:10px;border:1px solid var(--line);border-radius:10px">
          <div style="flex:1"><b style="font-size:13px">${esc(label)}</b><div class="muted mini">${esc(n)} · kplus-${k2}.csv</div></div>
          <a class="btn sm" href="/api/admin/export/${k2}.csv?token=${encodeURIComponent(S.token)}" download>ดาวน์โหลด</a>
        </div>`).join('')}</div>
    </div>
    <div class="card"><h3>สรุปผลลัพธ์ของโปรแกรม</h3><p class="sub">ตัวเลขที่ใช้รายงานผู้บริหาร</p>
      <div class="kv"><span>เงินเดือนที่อยู่ในระบบ K Pockets</span><b>฿${N(k.salaryManaged)} / เดือน</b></div>
      <div class="kv"><span>เงินที่ถูกกันเข้าซองแล้ว</span><b>฿${N(k.pocketAllocated)}</b></div>
      <div class="kv"><span>เงินออมสะสมของผู้ใช้</span><b>฿${N(k.savingsTotal)}</b></div>
      <div class="kv"><span>เงินออมที่เกิดจาก Round-up</span><b>฿${N(k.roundupTotal)} (${N(k.roundupCount)} ครั้ง)</b></div>
      <div class="kv"><span>การย้ายเงินระหว่างซอง</span><b>${k.pocketMoves} ครั้ง · ฿${N(k.pocketMoved)} · ${k.pocketMoveUsers} คน</b></div>
      <div class="kv"><span>อัตราการเปิดใช้ Round-up</span><b>${k.roundupAdoption}%</b></div>
      <div class="kv"><span>เงินลงทุนผ่าน Tax Coach</span><b>฿${N(k.taxInvested)} (${k.taxPlans} รายการ)</b></div>
      <div class="kv"><span>การตรวจบัญชีก่อนโอน</span><b>${N(k.radarChecks)} ครั้ง</b></div>
      <div class="kv"><span>ยกเลิกการโอนหลังเห็นคำเตือน</span><b>${k.transfersAborted} ครั้ง · ฿${N(k.lossPrevented)}</b></div>
      <div class="kv"><span>โอนต่อทั้งที่ระบบเตือน</span><b>${k.riskyProceeded} ครั้ง</b></div>
      <div class="kv"><span>คะแนน First Jobber เฉลี่ย</span><b>${k.avgScore} / 100</b></div>
      <div style="margin-top:14px;display:flex;gap:8px">
        <button class="btn ghost" onclick="reseed()">โหลดข้อมูลตัวอย่างใหม่</button>
      </div>
      <p class="muted mini" style="margin-top:8px">การโหลดใหม่จะล้างข้อมูลทั้งหมดใน db.json แล้วสร้างข้อมูลตั้งต้นชุดเดิม</p>
    </div>
  </div>`;
}

async function reseed() {
  if (!confirm('ล้างข้อมูลทั้งหมดและสร้างข้อมูลตัวอย่างใหม่?')) return;
  try { await api('/api/admin/reseed', {}); await refresh(); toast('โหลดข้อมูลตัวอย่างใหม่แล้ว'); }
  catch (e) { toast(e.message); }
}

/* ================================================================== */

window.addEventListener('DOMContentLoaded', () => {
  if (S.token) refresh().catch(() => render());
  else render();
});
