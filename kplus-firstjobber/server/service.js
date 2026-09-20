'use strict';
/**
 * service.js - ชั้นบริการ อ่าน/เขียน db.json จริง
 * ทุก action ของหน้าบ้านจะถูกบันทึกเป็น transaction + event
 * แล้วหลังบ้านจะนำไปสรุปเป็นรายงานจริง (ไม่ใช่ข้อมูลปลอม)
 */
const { db, save, uid } = require('./db');
const L = require('./logic');

const CATEGORIES = [
  { code: 'food', label: 'อาหาร/เครื่องดื่ม' },
  { code: 'transport', label: 'เดินทาง' },
  { code: 'shopping', label: 'ช้อปปิ้ง' },
  { code: 'entertain', label: 'บันเทิง' },
  { code: 'health', label: 'สุขภาพ' },
  { code: 'bill', label: 'บิล/ค่าคงที่' },
  { code: 'transfer', label: 'โอนเงิน' },
  { code: 'other', label: 'อื่น ๆ' },
];

/* ---------------------------------------------------------------- */
/* helpers                                                           */
/* ---------------------------------------------------------------- */

function logEvent(userId, type, payload = {}) {
  db().events.push({ id: uid('ev'), userId, type, payload, createdAt: new Date().toISOString() });
  if (db().events.length > 5000) db().events.splice(0, db().events.length - 5000);
}

function getUser(userId) {
  const u = db().users.find((x) => x.id === userId);
  if (!u) { const e = new Error('ไม่พบผู้ใช้'); e.status = 404; throw e; }
  return u;
}

function userPockets(userId, cycleKey) {
  return db().pockets.filter((p) => p.userId === userId && p.cycleKey === cycleKey).sort((a, b) => a.order - b.order);
}

function normAcc(no) { return String(no || '').replace(/\D/g, ''); }

/** สร้างซองของรอบปัจจุบันถ้ายังไม่มี (จำลองการตัดอัตโนมัติวันเงินเดือนเข้า) */
function ensureCycle(userId) {
  const u = getUser(userId);
  const cycle = L.getCycle(u.paydayDay);
  let pockets = userPockets(userId, cycle.key);
  if (pockets.length === 0) {
    const alloc = L.planAllocation(u.salary, u.fixCost);
    pockets = L.buildPockets(userId, cycle, alloc);
    db().pockets.push(...pockets);
    u.balance = L.round2(u.balance + u.salary);
    db().transactions.push({
      id: uid('tx'), userId, type: 'income', amount: u.salary, merchant: 'เงินเดือนเข้าบัญชี',
      category: 'other', pocketCode: null, cycleKey: cycle.key, createdAt: new Date().toISOString(),
    });
    logEvent(userId, 'salary_allocated', { salary: u.salary, fix: alloc.fix, weeks: alloc.weeks });
    save();
  }
  return { user: u, cycle, pockets };
}

/* ---------------------------------------------------------------- */
/* state รวมของหน้าแรก                                               */
/* ---------------------------------------------------------------- */

function getState(userId) {
  const { user, cycle, pockets } = ensureCycle(userId);
  const bills = db().bills.filter((b) => b.userId === userId);
  const tx = db().transactions.filter((t) => t.userId === userId);
  const radarChecks = db().radarChecks.filter((c) => c.userId === userId);
  const sts = L.computeSafeToSpend(user, pockets, bills, cycle);
  const score = L.computeScore({ user, pockets, bills, cycle, tx, radarChecks, savingsBalance: user.savings });
  const roundupTx = db().roundups.filter((r) => r.userId === userId);

  return {
    user: publicUser(user),
    cycle,
    pockets: pockets.map((p) => ({ ...p, remaining: L.round2(p.allocated - p.spent), percent: p.allocated ? Math.round((p.spent / p.allocated) * 100) : 0 })),
    safeToSpend: sts,
    score,
    bills: bills.map((b) => ({ ...b, paid: (b.paidCycles || []).includes(cycle.key) })),
    pocketMoves: pocketMoveHistory(userId, 20),
    transactions: tx.slice(-40).reverse(),
    roundup: {
      enabled: user.roundupEnabled,
      step: user.roundupStep,
      fund: L.round2(user.savings),
      count: roundupTx.length,
      total: L.round2(roundupTx.reduce((s, r) => s + r.diff, 0)),
      thisCycle: L.round2(roundupTx.filter((r) => r.cycleKey === cycle.key).reduce((s, r) => s + r.diff, 0)),
      recent: roundupTx.slice(-8).reverse(),
    },
    categories: CATEGORIES,
  };
}

function publicUser(u) {
  return {
    id: u.id, name: u.name, nickname: u.nickname, avatar: u.avatar, email: u.email,
    salary: u.salary, fixCost: u.fixCost, paydayDay: u.paydayDay, balance: L.round2(u.balance),
    savings: L.round2(u.savings), roundupEnabled: u.roundupEnabled, roundupStep: u.roundupStep,
    jobTitle: u.jobTitle, company: u.company, startWorkMonth: u.startWorkMonth, createdAt: u.createdAt,
  };
}

/* ---------------------------------------------------------------- */
/* K Pockets                                                         */
/* ---------------------------------------------------------------- */

function updatePlan(userId, { salary, fixCost, paydayDay }) {
  const u = getUser(userId);
  if (salary != null) u.salary = L.round2(salary);
  if (fixCost != null) u.fixCost = L.round2(fixCost);
  if (paydayDay != null) u.paydayDay = L.clamp(Math.round(paydayDay), 1, 28);

  const cycle = L.getCycle(u.paydayDay);
  const alloc = L.planAllocation(u.salary, u.fixCost);
  const pockets = userPockets(userId, cycle.key);
  if (pockets.length) {
    for (const p of pockets) p.allocated = p.code === 'fix' ? alloc.fix : alloc.weeks[p.week - 1];
  }
  logEvent(userId, 'plan_updated', { salary: u.salary, fixCost: u.fixCost, paydayDay: u.paydayDay });
  save();
  return getState(userId);
}

/** ย้ายเงินระหว่างซอง (เช่น ยืมจากสัปดาห์หน้า) พร้อมเก็บประวัติไว้ตรวจย้อนหลัง */
function movePocket(userId, fromCode, toCode, amount, note) {
  const { cycle } = ensureCycle(userId);
  const pockets = userPockets(userId, cycle.key);
  const from = pockets.find((p) => p.code === fromCode);
  const to = pockets.find((p) => p.code === toCode);
  const amt = L.round2(amount);
  if (!from || !to) { const e = new Error('ไม่พบซองที่เลือก'); e.status = 400; throw e; }
  if (from.code === to.code) { const e = new Error('เลือกซองต้นทางกับปลายทางให้ต่างกัน'); e.status = 400; throw e; }
  if (!(amt > 0)) { const e = new Error('จำนวนเงินไม่ถูกต้อง'); e.status = 400; throw e; }
  if (from.allocated - from.spent < amt) { const e = new Error('เงินในซองต้นทางไม่พอ'); e.status = 400; throw e; }

  from.allocated = L.round2(from.allocated - amt);
  to.allocated = L.round2(to.allocated + amt);

  const move = {
    id: uid('mv'), userId, cycleKey: cycle.key,
    from: from.code, fromName: from.name, to: to.code, toName: to.name,
    amount: amt, note: String(note || '').slice(0, 120),
    fromLeft: L.round2(from.allocated - from.spent),
    toLeft: L.round2(to.allocated - to.spent),
    week: L.weekOfCycle(cycle),
    createdAt: new Date().toISOString(),
  };
  db().pocketMoves.push(move);
  logEvent(userId, 'pocket_moved', { from: from.code, to: to.code, amount: amt, note: move.note });
  save();
  return { move, state: getState(userId) };
}

/** ประวัติการย้ายซอง เรียงใหม่ก่อน */
function pocketMoveHistory(userId, limit = 50) {
  return db().pocketMoves
    .filter((m) => m.userId === userId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, limit);
}

/* ---------------------------------------------------------------- */
/* ใช้จ่าย + Round-up                                                */
/* ---------------------------------------------------------------- */

function addExpense(userId, { amount, merchant, category, pocketCode, note, skipRoundup }) {
  const { user, cycle, pockets } = ensureCycle(userId);
  const amt = L.round2(amount);
  if (!(amt > 0)) { const e = new Error('จำนวนเงินไม่ถูกต้อง'); e.status = 400; throw e; }

  const week = L.weekOfCycle(cycle);
  const code = pocketCode || (category === 'bill' ? 'fix' : `week${week}`);
  const pocket = pockets.find((p) => p.code === code) || pockets.find((p) => p.code === `week${week}`);

  const now = new Date().toISOString();
  const tx = {
    id: uid('tx'), userId, type: 'expense', amount: amt,
    merchant: merchant || 'ร้านค้า', category: category || 'other',
    pocketCode: pocket ? pocket.code : null, note: note || '', cycleKey: cycle.key, createdAt: now,
  };
  db().transactions.push(tx);
  if (pocket) pocket.spent = L.round2(pocket.spent + amt);
  user.balance = L.round2(user.balance - amt);

  let roundup = null;
  if (user.roundupEnabled && !skipRoundup) {
    const r = L.computeRoundup(amt, user.roundupStep);
    if (r.diff > 0) {
      roundup = { id: uid('ru'), userId, txId: tx.id, merchant: tx.merchant, amount: amt, rounded: r.rounded, diff: r.diff, step: r.step, cycleKey: cycle.key, createdAt: now };
      db().roundups.push(roundup);
      user.balance = L.round2(user.balance - r.diff);
      user.savings = L.round2(user.savings + r.diff);
      db().transactions.push({
        id: uid('tx'), userId, type: 'save', amount: r.diff, merchant: `Round-up จาก ${tx.merchant}`,
        category: 'other', pocketCode: null, cycleKey: cycle.key, createdAt: now, auto: true,
      });
      logEvent(userId, 'roundup', { diff: r.diff, merchant: tx.merchant });
    }
  }
  logEvent(userId, 'expense', { amount: amt, category: tx.category, pocket: tx.pocketCode });
  save();
  return { tx, roundup, state: getState(userId) };
}

function setRoundup(userId, { enabled, step }) {
  const u = getUser(userId);
  if (enabled != null) u.roundupEnabled = !!enabled;
  if (step != null) u.roundupStep = [10, 20, 50, 100].includes(Number(step)) ? Number(step) : 50;
  logEvent(userId, 'roundup_setting', { enabled: u.roundupEnabled, step: u.roundupStep });
  save();
  return getState(userId);
}

function manualSave(userId, amount) {
  const { user, cycle } = ensureCycle(userId);
  const amt = L.round2(amount);
  if (!(amt > 0) || amt > user.balance) { const e = new Error('ยอดออมไม่ถูกต้องหรือเงินไม่พอ'); e.status = 400; throw e; }
  user.balance = L.round2(user.balance - amt);
  user.savings = L.round2(user.savings + amt);
  db().transactions.push({ id: uid('tx'), userId, type: 'save', amount: amt, merchant: 'ออมเข้ากองทุนด้วยตัวเอง', category: 'other', pocketCode: null, cycleKey: cycle.key, createdAt: new Date().toISOString() });
  logEvent(userId, 'manual_save', { amount: amt });
  save();
  return getState(userId);
}

function payBill(userId, billId) {
  const { user, cycle, pockets } = ensureCycle(userId);
  const bill = db().bills.find((b) => b.id === billId && b.userId === userId);
  if (!bill) { const e = new Error('ไม่พบบิล'); e.status = 404; throw e; }
  bill.paidCycles = bill.paidCycles || [];
  if (bill.paidCycles.includes(cycle.key)) return getState(userId);
  bill.paidCycles.push(cycle.key);
  const fix = pockets.find((p) => p.code === 'fix');
  if (fix) fix.spent = L.round2(fix.spent + bill.amount);
  user.balance = L.round2(user.balance - bill.amount);
  db().transactions.push({ id: uid('tx'), userId, type: 'expense', amount: bill.amount, merchant: bill.name, category: 'bill', pocketCode: 'fix', cycleKey: cycle.key, createdAt: new Date().toISOString() });
  logEvent(userId, 'bill_paid', { bill: bill.name, amount: bill.amount });
  save();
  return getState(userId);
}

/* ---------------------------------------------------------------- */
/* Tax Coach                                                         */
/* ---------------------------------------------------------------- */

function taxPreview(userId, input) {
  const u = getUser(userId);
  const monthsWorked = input.monthsWorked != null ? input.monthsWorked : monthsSince(u.startWorkMonth);
  const res = L.computeTax({ salary: input.salary != null ? input.salary : u.salary, monthsWorked, bonus: input.bonus, insurance: input.insurance, parents: input.parents, donation: input.donation, withheld: input.withheld != null ? input.withheld : estimateWithheld(u) });
  return { ...res, autoMonths: monthsWorked };
}

function monthsSince(startWorkMonth) {
  if (!startWorkMonth) return 12;
  const [y, m] = String(startWorkMonth).split('-').map(Number);
  const now = new Date();
  if (y !== now.getFullYear()) return 12;
  return L.clamp(now.getMonth() + 1 - m + 1, 1, 12);
}

function estimateWithheld(u) {
  const months = monthsSince(u.startWorkMonth);
  const year = L.computeTax({ salary: u.salary, monthsWorked: months });
  return L.round2((year.taxBefore / Math.max(1, months)) * months * 0.6);
}

/** กดปุ่มเดียวซื้อกองทุนลดหย่อนครบทั้งตะกร้า */
function buyTaxFunds(userId, { amount, basket }) {
  const { user, cycle } = ensureCycle(userId);
  const amt = L.round2(amount);
  if (!(amt > 0)) { const e = new Error('จำนวนเงินไม่ถูกต้อง'); e.status = 400; throw e; }
  const source = amt <= user.savings ? 'savings' : 'balance';
  if (source === 'savings') user.savings = L.round2(user.savings - amt);
  else {
    if (amt > user.balance) { const e = new Error('ยอดเงินไม่พอ'); e.status = 400; throw e; }
    user.balance = L.round2(user.balance - amt);
  }
  const plan = {
    id: uid('tp'), userId, amount: amt, source,
    basket: basket && basket.length ? basket : L.buildFundBasket(amt, { capThaiESG: amt, capSSF: amt, capRMF: amt }),
    taxYear: new Date().getFullYear(), createdAt: new Date().toISOString(),
  };
  db().taxPlans.push(plan);
  db().transactions.push({ id: uid('tx'), userId, type: 'invest', amount: amt, merchant: 'ซื้อกองทุนลดหย่อนภาษี', category: 'other', pocketCode: null, cycleKey: cycle.key, createdAt: plan.createdAt });
  logEvent(userId, 'tax_fund_bought', { amount: amt, funds: plan.basket.map((b) => b.code) });
  save();
  return { plan, state: getState(userId) };
}

/* ---------------------------------------------------------------- */
/* Scam Radar                                                        */
/* ---------------------------------------------------------------- */

function lookupAccount(bank, accountNo) {
  const no = normAcc(accountNo);
  return db().scamAccounts.find((a) => normAcc(a.accountNo) === no && (!bank || a.bank === bank)) || null;
}

function verifiedReportsFor(bank, accountNo) {
  const no = normAcc(accountNo);
  return db().scamReports
    .filter((r) => normAcc(r.accountNo) === no && r.status === 'verified')
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function radarCheck(userId, { bank, accountNo, accountName, amount }) {
  const u = getUser(userId);
  const no = normAcc(accountNo);
  if (no.length < 6) { const e = new Error('เลขบัญชีไม่ถูกต้อง'); e.status = 400; throw e; }
  const acc = lookupAccount(bank, no);
  const reports = verifiedReportsFor(bank, no);
  const firstTime = !db().transactions.some((t) => t.userId === userId && t.toAccount && normAcc(t.toAccount) === no);
  const result = L.assessAccount(acc, reports, { amount: Number(amount) || 0, firstTime });

  const check = {
    id: uid('rc'), userId, bank: bank || (acc && acc.bank) || '-', accountNo: no,
    accountName: (acc && acc.accountName) || accountName || 'ไม่ทราบชื่อบัญชี',
    amount: L.round2(amount || 0), risk: result.risk, riskLevel: result.level,
    proceeded: false, createdAt: new Date().toISOString(),
  };
  db().radarChecks.push(check);
  logEvent(userId, 'radar_check', { accountNo: no, risk: result.risk, level: result.level });
  save();
  return { checkId: check.id, bank: check.bank, accountNo: no, accountName: check.accountName, amount: check.amount, ...result, user: publicUser(u) };
}

function transfer(userId, { checkId, bank, accountNo, accountName, amount, note }) {
  const { user, cycle, pockets } = ensureCycle(userId);
  const amt = L.round2(amount);
  if (!(amt > 0)) { const e = new Error('จำนวนเงินไม่ถูกต้อง'); e.status = 400; throw e; }
  if (amt > user.balance) { const e = new Error('ยอดเงินคงเหลือไม่พอ'); e.status = 400; throw e; }

  const check = db().radarChecks.find((c) => c.id === checkId);
  if (check) { check.proceeded = true; check.proceededAt = new Date().toISOString(); }

  const week = L.weekOfCycle(cycle);
  const pocket = pockets.find((p) => p.code === `week${week}`);
  const tx = {
    id: uid('tx'), userId, type: 'expense', amount: amt, merchant: `โอนให้ ${accountName || normAcc(accountNo)}`,
    category: 'transfer', pocketCode: pocket ? pocket.code : null, toBank: bank, toAccount: normAcc(accountNo),
    note: note || '', riskLevel: check ? check.riskLevel : null, cycleKey: cycle.key, createdAt: new Date().toISOString(),
  };
  db().transactions.push(tx);
  if (pocket) pocket.spent = L.round2(pocket.spent + amt);
  user.balance = L.round2(user.balance - amt);
  logEvent(userId, 'transfer', { amount: amt, accountNo: tx.toAccount, risk: check ? check.riskLevel : 'unchecked' });
  save();
  return { tx, state: getState(userId) };
}

/** ผู้ใช้กดยกเลิกการโอนหลังเห็นผล Scam Radar = ป้องกันความเสียหายได้จริง */
function abortTransfer(userId, { checkId, reason }) {
  const check = db().radarChecks.find((c) => c.id === checkId && c.userId === userId);
  if (!check) { const e = new Error('ไม่พบรายการตรวจสอบ'); e.status = 404; throw e; }
  check.aborted = true;
  check.abortedAt = new Date().toISOString();
  check.abortReason = reason || 'ผู้ใช้ยกเลิกหลังเห็นคำเตือน';
  logEvent(userId, 'transfer_aborted', { checkId, amount: check.amount, level: check.riskLevel });
  save();
  return { ok: true, prevented: check.amount };
}

function createReport(userId, { bank, accountNo, accountName, amount, type, detail, channel, evidenceUrl }) {
  const u = getUser(userId);
  const no = normAcc(accountNo);
  if (no.length < 6) { const e = new Error('เลขบัญชีไม่ถูกต้อง'); e.status = 400; throw e; }
  const report = {
    id: uid('rp'), userId, reporterName: u.name, bank: bank || '-', accountNo: no,
    accountName: accountName || '', amount: L.round2(amount || 0), type: type || 'other',
    detail: detail || '', channel: channel || 'app', evidenceUrl: evidenceUrl || '',
    status: 'pending', caseNo: makeCaseNo(), forwardedTo: 'ศูนย์รับแจ้งเหตุภัยทางการเงิน (AOC 1441)',
    createdAt: new Date().toISOString(), reviewedAt: null, reviewer: null, reviewNote: '',
  };
  db().scamReports.push(report);

  if (!lookupAccount(bank, no)) {
    db().scamAccounts.push({
      id: uid('sa'), bank: report.bank, accountNo: no, accountName: report.accountName || 'ไม่ทราบชื่อ',
      openedAt: null, blacklisted: false, mule: false, verifiedMerchant: false, source: 'user_report',
      createdAt: report.createdAt,
    });
  }
  logEvent(userId, 'scam_report', { accountNo: no, type: report.type, amount: report.amount });
  save();
  return report;
}

function myReports(userId) {
  return db().scamReports.filter((r) => r.userId === userId).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function makeCaseNo() {
  const d = new Date();
  const n = db().scamReports.length + 1;
  return `KSR-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}-${String(n).padStart(4, '0')}`;
}

module.exports = {
  CATEGORIES, logEvent, getUser, publicUser, ensureCycle, getState, updatePlan, movePocket, pocketMoveHistory,
  addExpense, setRoundup, manualSave, payBill,
  taxPreview, buyTaxFunds, monthsSince,
  radarCheck, transfer, abortTransfer, createReport, myReports, lookupAccount, verifiedReportsFor, normAcc,
};
