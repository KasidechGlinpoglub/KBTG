'use strict';
/**
 * index.js - HTTP server (ไม่มี dependency ภายนอก)
 * เสิร์ฟทั้ง REST API และไฟล์หน้าเว็บใน public/
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const { db, save } = require('./db');
const L = require('./logic');
const S = require('./service');
const A = require('./admin');

const PORT = Number(process.env.PORT) || 4173;
const PUBLIC = path.join(__dirname, '..', 'public');
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'kplus2026';
const tokens = new Set();

const BANKS = [
  { code: 'KBank', name: 'กสิกรไทย' }, { code: 'SCB', name: 'ไทยพาณิชย์' },
  { code: 'KTB', name: 'กรุงไทย' }, { code: 'BBL', name: 'กรุงเทพ' },
  { code: 'TTB', name: 'ทีทีบี' }, { code: 'BAY', name: 'กรุงศรี' },
  { code: 'GSB', name: 'ออมสิน' }, { code: 'PromptPay', name: 'พร้อมเพย์' },
];

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
};

/* ---------------------------------------------------------------- */

function send(res, status, body, headers = {}) {
  const data = typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(data);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (c) => { raw += c; if (raw.length > 1e6) { reject(new Error('payload ใหญ่เกินไป')); req.destroy(); } });
    req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch (e) { reject(new Error('JSON ไม่ถูกต้อง')); } });
    req.on('error', reject);
  });
}

function requireAdmin(req) {
  const t = req.headers['x-admin-token'];
  if (!t || !tokens.has(t)) { const e = new Error('ต้องเข้าสู่ระบบผู้ดูแล'); e.status = 401; throw e; }
}

function serveStatic(req, res, pathname) {
  let rel = pathname === '/' ? '/index.html' : pathname;
  if (rel === '/admin' || rel === '/admin/') rel = '/admin.html';
  const file = path.join(PUBLIC, path.normalize(rel).replace(/^([\\/])+/, ''));
  if (!file.startsWith(PUBLIC)) return send(res, 403, { error: 'forbidden' });
  fs.readFile(file, (err, buf) => {
    if (err) return send(res, 404, { error: 'ไม่พบหน้าที่ต้องการ' });
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(buf);
  });
}

/* ---------------------------------------------------------------- */
/* routes                                                            */
/* ---------------------------------------------------------------- */

const routes = {
  'GET /api/health': () => ({ ok: true, time: new Date().toISOString(), users: db().users.length }),

  'GET /api/meta': () => ({
    banks: BANKS,
    categories: S.CATEGORIES,
    reportTypes: L.REPORT_TYPES,
    scoreDims: L.SCORE_DIMS,
    tiers: L.TIER_BENEFIT,
    roundupSteps: [10, 20, 50, 100],
  }),

  'GET /api/users': () => db().users.map((u) => ({
    id: u.id, name: u.name, nickname: u.nickname, avatar: u.avatar,
    jobTitle: u.jobTitle, company: u.company, salary: u.salary,
  })),

  'GET /api/state': (q) => S.getState(q.userId),
  'POST /api/plan': (q, b) => S.updatePlan(b.userId, b),
  'POST /api/pockets/move': (q, b) => S.movePocket(b.userId, b.from, b.to, b.amount, b.note),
  'GET /api/pockets/moves': (q) => S.pocketMoveHistory(q.userId, Number(q.limit) || 50),
  'POST /api/expense': (q, b) => S.addExpense(b.userId, b),
  'POST /api/roundup': (q, b) => S.setRoundup(b.userId, b),
  'POST /api/save': (q, b) => S.manualSave(b.userId, b.amount),
  'POST /api/bills/pay': (q, b) => S.payBill(b.userId, b.billId),

  'POST /api/tax/preview': (q, b) => S.taxPreview(b.userId, b),
  'POST /api/tax/buy': (q, b) => S.buyTaxFunds(b.userId, b),
  'GET /api/tax/plans': (q) => db().taxPlans.filter((t) => t.userId === q.userId).reverse(),

  'POST /api/radar/check': (q, b) => S.radarCheck(b.userId, b),
  'POST /api/transfer': (q, b) => S.transfer(b.userId, b),
  'POST /api/transfer/abort': (q, b) => S.abortTransfer(b.userId, b),
  'POST /api/reports': (q, b) => S.createReport(b.userId, b),
  'GET /api/reports/mine': (q) => S.myReports(q.userId),
  'GET /api/radar/history': (q) => db().radarChecks.filter((c) => c.userId === q.userId).slice(-20).reverse(),

  /* ---------------- admin ---------------- */
  'POST /api/admin/login': (q, b) => {
    if (b.password !== ADMIN_PASSWORD) { const e = new Error('รหัสผ่านไม่ถูกต้อง'); e.status = 401; throw e; }
    const token = crypto.randomBytes(24).toString('hex');
    tokens.add(token);
    return { token, user: { name: 'Ops Console', role: 'Fraud & Wealth Ops' } };
  },
  'GET /api/admin/overview': (q, b, req) => { requireAdmin(req); return A.overview(Number(q.range) || 30); },
  'GET /api/admin/reports': (q, b, req) => { requireAdmin(req); return A.listReports({ status: q.status, q: q.q }); },
  'POST /api/admin/reports/review': (q, b, req) => { requireAdmin(req); return A.reviewReport(b.id, b); },
  'GET /api/admin/watchlist': (q, b, req) => { requireAdmin(req); return A.watchlist(Number(q.limit) || 20); },
  'POST /api/admin/accounts': (q, b, req) => { requireAdmin(req); return A.addWatchAccount(b); },
  'GET /api/admin/users': (q, b, req) => { requireAdmin(req); return A.overview().users; },
  'POST /api/admin/reseed': (q, b, req) => {
    requireAdmin(req);
    require('./seed').run();
    return { ok: true, message: 'โหลดข้อมูลตัวอย่างใหม่แล้ว' };
  },
};

/* ---------------------------------------------------------------- */

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const q = Object.fromEntries(url.searchParams.entries());
  const key = `${req.method} ${url.pathname}`;

  if (req.method === 'OPTIONS') return send(res, 204, '');

  // CSV export
  const m = url.pathname.match(/^\/api\/admin\/export\/(\w+)\.csv$/);
  if (m && req.method === 'GET') {
    try {
      if (!tokens.has(q.token || req.headers['x-admin-token'])) { const e = new Error('ต้องเข้าสู่ระบบผู้ดูแล'); e.status = 401; throw e; }
      const body = A.exportCsv(m[1]);
      return send(res, 200, body, {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="kplus-${m[1]}-${new Date().toISOString().slice(0, 10)}.csv"`,
      });
    } catch (err) { return send(res, err.status || 500, { error: err.message }); }
  }

  if (routes[key]) {
    try {
      const body = req.method === 'GET' ? {} : await readBody(req);
      const out = await routes[key](q, body, req);
      return send(res, 200, out === undefined ? { ok: true } : out);
    } catch (err) {
      if (!err.status) console.error('[api]', key, err);
      return send(res, err.status || 500, { error: err.message || 'เกิดข้อผิดพลาด' });
    }
  }

  if (url.pathname.startsWith('/api/')) return send(res, 404, { error: 'ไม่พบ endpoint นี้' });
  return serveStatic(req, res, url.pathname);
});

if (require.main === module) {
  if (db().users.length === 0) {
    console.log('ยังไม่มีข้อมูล กำลัง seed อัตโนมัติ...');
    require('./seed').run();
  }
  server.listen(PORT, () => {
    console.log('');
    console.log('  K PLUS First Jobber prototype');
    console.log(`  หน้าบ้าน (แอป)    http://localhost:${PORT}/`);
    console.log(`  หลังบ้าน (Ops)    http://localhost:${PORT}/admin  (รหัสผ่าน: ${ADMIN_PASSWORD})`);
    console.log('');
  });
}

module.exports = { server, PORT };
