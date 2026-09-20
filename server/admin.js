'use strict';
/**
 * admin.js - หลังบ้าน (Ops Console)
 * รายงานทั้งหมดคำนวณสดจากข้อมูลจริงใน db.json ที่หน้าบ้านสร้างขึ้น
 */
const { db, save, uid } = require('./db');
const L = require('./logic');
const S = require('./service');

const DAY = 86400000;
const dkey = (d) => new Date(d).toISOString().slice(0, 10);

function lastNDays(n) {
  const out = [];
  const today = new Date(); today.setHours(0, 0, 0, 0);
  for (let i = n - 1; i >= 0; i--) out.push(dkey(new Date(today.getTime() - i * DAY)));
  return out;
}

function seriesOf(rows, days, valueFn) {
  const map = Object.fromEntries(days.map((d) => [d, 0]));
  for (const r of rows) {
    const k = dkey(r.createdAt);
    if (k in map) map[k] += valueFn ? valueFn(r) : 1;
  }
  return days.map((d) => ({ date: d, value: L.round2(map[d]) }));
}

/* ---------------------------------------------------------------- */
/* Overview                                                          */
/* ---------------------------------------------------------------- */

function overview(range = 30) {
  const d = db();
  const days = lastNDays(range);
  const users = d.users;

  const scores = users.map((u) => {
    const cycle = L.getCycle(u.paydayDay);
    const pockets = d.pockets.filter((p) => p.userId === u.id && p.cycleKey === cycle.key);
    const bills = d.bills.filter((b) => b.userId === u.id);
    const tx = d.transactions.filter((t) => t.userId === u.id);
    const checks = d.radarChecks.filter((c) => c.userId === u.id);
    const sc = L.computeScore({ user: u, pockets, bills, cycle, tx, radarChecks: checks, savingsBalance: u.savings });
    const sts = L.computeSafeToSpend(u, pockets, bills, cycle);
    return { user: u, score: sc, sts, pockets, checks, cycle };
  });

  const tierCount = { Bronze: 0, Silver: 0, Gold: 0, Platinum: 0 };
  for (const s of scores) tierCount[s.score.tier]++;

  const dimAvg = L.SCORE_DIMS.map((dim) => ({
    key: dim.key, name: dim.name,
    avg: scores.length ? Math.round(scores.reduce((a, s) => a + s.score.dims.find((x) => x.key === dim.key).score, 0) / scores.length) : 0,
  }));

  const roundups = d.roundups;
  const checks = d.radarChecks;
  const reports = d.scamReports;
  const aborted = checks.filter((c) => c.aborted);
  const riskyProceeded = checks.filter((c) => c.proceeded && (c.riskLevel === 'warn' || c.riskLevel === 'danger'));

  const overspend = scores.filter((s) => s.sts.status === 'over').length;

  return {
    generatedAt: new Date().toISOString(),
    range,
    kpi: {
      users: users.length,
      newUsers7d: users.filter((u) => Date.now() - new Date(u.createdAt).getTime() < 7 * DAY).length,
      salaryManaged: L.round2(users.reduce((s, u) => s + u.salary, 0)),
      pocketAllocated: L.round2(d.pockets.reduce((s, p) => s + p.allocated, 0)),
      pocketSpent: L.round2(d.pockets.reduce((s, p) => s + p.spent, 0)),
      savingsTotal: L.round2(users.reduce((s, u) => s + u.savings, 0)),
      roundupTotal: L.round2(roundups.reduce((s, r) => s + r.diff, 0)),
      roundupCount: roundups.length,
      roundupAdoption: users.length ? Math.round((users.filter((u) => u.roundupEnabled).length / users.length) * 100) : 0,
      avgScore: scores.length ? Math.round(scores.reduce((a, s) => a + s.score.total, 0) / scores.length) : 0,
      radarChecks: checks.length,
      radarFlagged: checks.filter((c) => c.riskLevel === 'warn' || c.riskLevel === 'danger').length,
      transfersAborted: aborted.length,
      lossPrevented: L.round2(aborted.reduce((s, c) => s + c.amount, 0)),
      riskyProceeded: riskyProceeded.length,
      reportsTotal: reports.length,
      reportsPending: reports.filter((r) => r.status === 'pending').length,
      reportsVerified: reports.filter((r) => r.status === 'verified').length,
      reportedDamage: L.round2(reports.reduce((s, r) => s + r.amount, 0)),
      taxPlans: d.taxPlans.length,
      taxInvested: L.round2(d.taxPlans.reduce((s, t) => s + t.amount, 0)),
      overspendUsers: overspend,
      pocketMoves: d.pocketMoves.length,
      pocketMoved: L.round2(d.pocketMoves.reduce((s, m) => s + m.amount, 0)),
      pocketMoveUsers: new Set(d.pocketMoves.map((m) => m.userId)).size,
    },
    tierCount,
    dimAvg,
    series: {
      roundup: seriesOf(roundups, days, (r) => r.diff),
      checks: seriesOf(checks, days),
      reports: seriesOf(reports, days),
      savings: seriesOf(d.transactions.filter((t) => t.type === 'save'), days, (t) => t.amount),
      spending: seriesOf(d.transactions.filter((t) => t.type === 'expense'), days, (t) => t.amount),
    },
    riskMix: ['safe', 'watch', 'warn', 'danger'].map((lv) => ({
      level: lv, label: L.RISK[lv].label, count: checks.filter((c) => c.riskLevel === lv).length,
    })),
    reportTypes: L.REPORT_TYPES.map((t) => ({
      code: t.code, label: t.label,
      count: reports.filter((r) => r.type === t.code).length,
      amount: L.round2(reports.filter((r) => r.type === t.code).reduce((s, r) => s + r.amount, 0)),
    })).filter((t) => t.count > 0).sort((a, b) => b.count - a.count),
    categoryMix: S.CATEGORIES.map((c) => ({
      code: c.code, label: c.label,
      amount: L.round2(d.transactions.filter((t) => t.type === 'expense' && t.category === c.code).reduce((s, t) => s + t.amount, 0)),
    })).filter((c) => c.amount > 0).sort((a, b) => b.amount - a.amount),
    users: scores.map((s) => ({
      id: s.user.id, name: s.user.name, nickname: s.user.nickname, avatar: s.user.avatar,
      jobTitle: s.user.jobTitle, salary: s.user.salary, balance: L.round2(s.user.balance),
      savings: L.round2(s.user.savings), score: s.score.total, tier: s.score.tier,
      savingRate: s.score.savingRate, pocketUsage: s.pockets.length
        ? Math.round((s.pockets.reduce((a, p) => a + p.spent, 0) / Math.max(1, s.pockets.reduce((a, p) => a + p.allocated, 0))) * 100) : 0,
      todayBudget: s.sts.today, stsStatus: s.sts.status,
      checks: s.checks.length, reports: d.scamReports.filter((r) => r.userId === s.user.id).length,
      moves: d.pocketMoves.filter((m) => m.userId === s.user.id).length,
      movedAmount: L.round2(d.pocketMoves.filter((m) => m.userId === s.user.id).reduce((a, m) => a + m.amount, 0)),
      roundupEnabled: s.user.roundupEnabled,
    })).sort((a, b) => b.score - a.score),
    watchlist: watchlist(8),
    activity: d.events.slice(-25).reverse().map((e) => ({
      ...e, userName: (d.users.find((u) => u.id === e.userId) || {}).name || 'ระบบ',
    })),
  };
}

/** บัญชีที่ถูกรายงานมากที่สุด */
function watchlist(limit = 20) {
  const d = db();
  const map = new Map();
  for (const r of d.scamReports) {
    const k = S.normAcc(r.accountNo);
    if (!map.has(k)) map.set(k, { accountNo: k, bank: r.bank, accountName: r.accountName, total: 0, verified: 0, pending: 0, amount: 0, lastAt: r.createdAt });
    const it = map.get(k);
    it.total++;
    if (r.status === 'verified') it.verified++;
    if (r.status === 'pending') it.pending++;
    it.amount = L.round2(it.amount + r.amount);
    if (new Date(r.createdAt) > new Date(it.lastAt)) it.lastAt = r.createdAt;
  }
  return [...map.values()].map((it) => {
    const acc = d.scamAccounts.find((a) => S.normAcc(a.accountNo) === it.accountNo);
    const assess = L.assessAccount(acc, d.scamReports.filter((r) => S.normAcc(r.accountNo) === it.accountNo && r.status === 'verified'), {});
    return { ...it, blacklisted: !!(acc && acc.blacklisted), risk: assess.risk, level: assess.level, levelLabel: assess.label, ageDays: assess.accountAgeDays };
  }).sort((a, b) => b.risk - a.risk || b.total - a.total).slice(0, limit);
}

/* ---------------------------------------------------------------- */
/* คิวตรวจสอบรายงาน                                                  */
/* ---------------------------------------------------------------- */

function listReports({ status, q } = {}) {
  const d = db();
  let rows = d.scamReports.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  if (status && status !== 'all') rows = rows.filter((r) => r.status === status);
  if (q) {
    const s = String(q).toLowerCase();
    rows = rows.filter((r) => [r.accountNo, r.accountName, r.bank, r.caseNo, r.reporterName, r.detail].join(' ').toLowerCase().includes(s));
  }
  return rows.map((r) => ({
    ...r,
    typeLabel: (L.REPORT_TYPES.find((t) => t.code === r.type) || { label: r.type }).label,
    sameAccountCount: d.scamReports.filter((x) => S.normAcc(x.accountNo) === S.normAcc(r.accountNo)).length,
  }));
}

/** เจ้าหน้าที่ยืนยัน/ปฏิเสธ -> มีผลกับ Scam Radar ที่หน้าบ้านทันที */
function reviewReport(reportId, { status, reviewer, note, blacklist }) {
  const d = db();
  const r = d.scamReports.find((x) => x.id === reportId);
  if (!r) { const e = new Error('ไม่พบรายงาน'); e.status = 404; throw e; }
  if (!['verified', 'rejected', 'pending'].includes(status)) { const e = new Error('สถานะไม่ถูกต้อง'); e.status = 400; throw e; }
  r.status = status;
  r.reviewer = reviewer || 'ops';
  r.reviewNote = note || '';
  r.reviewedAt = new Date().toISOString();

  const acc = d.scamAccounts.find((a) => S.normAcc(a.accountNo) === S.normAcc(r.accountNo));
  if (acc && status === 'verified') {
    acc.mule = true;
    if (blacklist) acc.blacklisted = true;
  }
  if (acc && status === 'rejected' && blacklist === false) acc.blacklisted = false;

  S.logEvent(r.userId, 'report_reviewed', { caseNo: r.caseNo, status, reviewer: r.reviewer });
  save();
  return r;
}

function addWatchAccount({ bank, accountNo, accountName, openedAt, blacklisted, mule, verifiedMerchant, merchantName }) {
  const no = S.normAcc(accountNo);
  if (no.length < 6) { const e = new Error('เลขบัญชีไม่ถูกต้อง'); e.status = 400; throw e; }
  const d = db();
  let acc = d.scamAccounts.find((a) => S.normAcc(a.accountNo) === no);
  if (!acc) {
    acc = { id: uid('sa'), bank: bank || '-', accountNo: no, accountName: accountName || '', openedAt: openedAt || null, blacklisted: false, mule: false, verifiedMerchant: false, source: 'ops', createdAt: new Date().toISOString() };
    d.scamAccounts.push(acc);
  }
  if (bank) acc.bank = bank;
  if (accountName) acc.accountName = accountName;
  if (openedAt !== undefined) acc.openedAt = openedAt;
  if (blacklisted !== undefined) acc.blacklisted = !!blacklisted;
  if (mule !== undefined) acc.mule = !!mule;
  if (verifiedMerchant !== undefined) acc.verifiedMerchant = !!verifiedMerchant;
  if (merchantName) acc.merchantName = merchantName;
  save();
  return acc;
}

/* ---------------------------------------------------------------- */
/* CSV export                                                        */
/* ---------------------------------------------------------------- */

function csv(rows, cols) {
  const esc = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return '﻿' + [cols.map((c) => esc(c.label)).join(','), ...rows.map((r) => cols.map((c) => esc(c.get(r))).join(','))].join('\n');
}

function exportCsv(kind) {
  const d = db();
  if (kind === 'users') {
    const ov = overview();
    return csv(ov.users, [
      { label: 'ผู้ใช้', get: (r) => r.name },
      { label: 'ตำแหน่ง', get: (r) => r.jobTitle },
      { label: 'เงินเดือน', get: (r) => r.salary },
      { label: 'คงเหลือ', get: (r) => r.balance },
      { label: 'เงินออม', get: (r) => r.savings },
      { label: 'คะแนน', get: (r) => r.score },
      { label: 'ระดับ', get: (r) => r.tier },
      { label: 'อัตราการออม %', get: (r) => r.savingRate },
      { label: 'ใช้ซองไปแล้ว %', get: (r) => r.pocketUsage },
      { label: 'ตรวจบัญชี (ครั้ง)', get: (r) => r.checks },
      { label: 'รายงาน (ครั้ง)', get: (r) => r.reports },
      { label: 'ย้ายซอง (ครั้ง)', get: (r) => r.moves },
      { label: 'ย้ายซอง (บาท)', get: (r) => r.movedAmount },
    ]);
  }
  if (kind === 'moves') {
    return csv(d.pocketMoves.slice().reverse(), [
      { label: 'วันที่', get: (r) => r.createdAt },
      { label: 'ผู้ใช้', get: (r) => (d.users.find((u) => u.id === r.userId) || {}).name },
      { label: 'รอบเงินเดือน', get: (r) => r.cycleKey },
      { label: 'จากซอง', get: (r) => r.fromName },
      { label: 'ไปซอง', get: (r) => r.toName },
      { label: 'จำนวนเงิน', get: (r) => r.amount },
      { label: 'เหลือในซองต้นทาง', get: (r) => r.fromLeft },
      { label: 'เหตุผล', get: (r) => r.note },
    ]);
  }
  if (kind === 'reports') {
    return csv(listReports({ status: 'all' }), [
      { label: 'เลขเคส', get: (r) => r.caseNo },
      { label: 'วันที่', get: (r) => r.createdAt },
      { label: 'ผู้แจ้ง', get: (r) => r.reporterName },
      { label: 'ธนาคาร', get: (r) => r.bank },
      { label: 'เลขบัญชี', get: (r) => r.accountNo },
      { label: 'ชื่อบัญชี', get: (r) => r.accountName },
      { label: 'ประเภท', get: (r) => r.typeLabel },
      { label: 'ความเสียหาย', get: (r) => r.amount },
      { label: 'สถานะ', get: (r) => r.status },
      { label: 'ผู้ตรวจ', get: (r) => r.reviewer },
      { label: 'รายละเอียด', get: (r) => r.detail },
    ]);
  }
  if (kind === 'checks') {
    return csv(d.radarChecks.slice().reverse(), [
      { label: 'วันที่', get: (r) => r.createdAt },
      { label: 'ผู้ใช้', get: (r) => (d.users.find((u) => u.id === r.userId) || {}).name },
      { label: 'ธนาคาร', get: (r) => r.bank },
      { label: 'เลขบัญชี', get: (r) => r.accountNo },
      { label: 'ยอดโอน', get: (r) => r.amount },
      { label: 'คะแนนเสี่ยง', get: (r) => r.risk },
      { label: 'ระดับ', get: (r) => r.riskLevel },
      { label: 'โอนต่อ', get: (r) => (r.proceeded ? 'ใช่' : 'ไม่') },
      { label: 'ยกเลิกหลังเตือน', get: (r) => (r.aborted ? 'ใช่' : 'ไม่') },
    ]);
  }
  if (kind === 'transactions') {
    return csv(d.transactions.slice().reverse(), [
      { label: 'วันที่', get: (r) => r.createdAt },
      { label: 'ผู้ใช้', get: (r) => (d.users.find((u) => u.id === r.userId) || {}).name },
      { label: 'ประเภท', get: (r) => r.type },
      { label: 'รายการ', get: (r) => r.merchant },
      { label: 'หมวด', get: (r) => r.category },
      { label: 'ซอง', get: (r) => r.pocketCode },
      { label: 'จำนวนเงิน', get: (r) => r.amount },
    ]);
  }
  const e = new Error('ไม่รองรับไฟล์ชนิดนี้'); e.status = 400; throw e;
}

module.exports = { overview, listReports, reviewReport, watchlist, addWatchAccount, exportCsv };
