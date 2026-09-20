'use strict';
/**
 * db.js - persistent JSON store (zero dependency).
 * ข้อมูลทุกอย่างถูกเขียนลงดิสก์จริงที่ data/db.json
 * ทำให้รายงานหลังบ้านเป็นผลจากการใช้งานจริงของหน้าบ้าน
 */
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

const EMPTY = {
  meta: { version: 1, createdAt: null, seededAt: null },
  users: [],
  pockets: [],
  pocketMoves: [],
  transactions: [],
  bills: [],
  roundups: [],
  scamAccounts: [],
  scamReports: [],
  radarChecks: [],
  events: [],
  taxPlans: [],
  scoreSnapshots: [],
};

let cache = null;
let writeTimer = null;
let dirty = false;

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function load() {
  if (cache) return cache;
  ensureDir();
  if (fs.existsSync(DB_FILE)) {
    try {
      cache = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
      for (const k of Object.keys(EMPTY)) if (cache[k] === undefined) cache[k] = Array.isArray(EMPTY[k]) ? [] : { ...EMPTY[k] };
    } catch (err) {
      console.error('[db] db.json อ่านไม่ได้ สร้างใหม่:', err.message);
      cache = JSON.parse(JSON.stringify(EMPTY));
      cache.meta.createdAt = new Date().toISOString();
    }
  } else {
    cache = JSON.parse(JSON.stringify(EMPTY));
    cache.meta.createdAt = new Date().toISOString();
    flush();
  }
  return cache;
}

function flush() {
  if (!cache) return;
  ensureDir();
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(cache, null, 2), 'utf8');
  fs.renameSync(tmp, DB_FILE);
  dirty = false;
}

/** เขียนลงดิสก์แบบหน่วง 120ms กันการเขียนถี่เกินไป */
function save() {
  dirty = true;
  if (writeTimer) return;
  writeTimer = setTimeout(() => {
    writeTimer = null;
    if (dirty) flush();
  }, 120);
}

function reset() {
  cache = JSON.parse(JSON.stringify(EMPTY));
  cache.meta.createdAt = new Date().toISOString();
  flush();
  return cache;
}

let seq = 0;
function uid(prefix) {
  seq = (seq + 1) % 100000;
  return `${prefix}_${Date.now().toString(36)}${seq.toString(36).padStart(3, '0')}`;
}

process.on('exit', () => { if (dirty) try { flush(); } catch (_) {} });
process.on('SIGINT', () => { try { flush(); } catch (_) {} process.exit(0); });

module.exports = { db: load, save, flush, reset, uid, DB_FILE };
