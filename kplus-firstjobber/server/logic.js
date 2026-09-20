'use strict';
/**
 * logic.js - โดเมนหลักของ K PLUS First Jobber
 * Safe-to-Spend / K Pockets / Round-up / First Jobber Score / Tax Coach / Scam Radar
 */

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const DAY = 86400000;

/* ------------------------------------------------------------------ */
/* รอบเงินเดือน (cycle) + สัปดาห์                                       */
/* ------------------------------------------------------------------ */

function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function daysInMonth(y, m) { return new Date(y, m + 1, 0).getDate(); }

/** รอบเงินเดือนปัจจุบัน อิงวันเงินเดือนออก (payday day-of-month) */
function getCycle(paydayDay, now = new Date()) {
  const today = startOfDay(now);
  let start = new Date(today.getFullYear(), today.getMonth(), Math.min(paydayDay, daysInMonth(today.getFullYear(), today.getMonth())));
  if (today < start) {
    const m = today.getMonth() - 1;
    const y = m < 0 ? today.getFullYear() - 1 : today.getFullYear();
    const mm = (m + 12) % 12;
    start = new Date(y, mm, Math.min(paydayDay, daysInMonth(y, mm)));
  }
  const nm = start.getMonth() + 1;
  const ny = nm > 11 ? start.getFullYear() + 1 : start.getFullYear();
  const nmm = nm % 12;
  const nextStart = new Date(ny, nmm, Math.min(paydayDay, daysInMonth(ny, nmm)));
  const end = new Date(nextStart.getTime() - DAY);
  const totalDays = Math.round((nextStart - start) / DAY);
  const dayIndex = Math.round((today - start) / DAY); // 0-based
  return {
    key: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`,
    start: start.toISOString(),
    end: end.toISOString(),
    nextPayday: nextStart.toISOString(),
    totalDays,
    dayIndex,
    daysLeft: totalDays - dayIndex,
  };
}

/** สัปดาห์ที่ 1-4 ของรอบ (สัปดาห์ 4 กินวันที่เหลือทั้งหมด) */
function weekOfCycle(cycle) {
  return clamp(Math.floor(cycle.dayIndex / 7) + 1, 1, 4);
}

function weekRange(cycle, week) {
  const startDay = (week - 1) * 7;
  const endDay = week === 4 ? cycle.totalDays - 1 : week * 7 - 1;
  return { startDay, endDay, days: endDay - startDay + 1 };
}

/** เหลืออีกกี่วันในสัปดาห์นี้ (นับวันนี้ด้วย) */
function daysLeftInWeek(cycle) {
  const w = weekOfCycle(cycle);
  const r = weekRange(cycle, w);
  return clamp(r.endDay - cycle.dayIndex + 1, 1, 31);
}

/* ------------------------------------------------------------------ */
/* K Pockets - ตัดอัตโนมัติวันเงินเดือนเข้า                             */
/* ------------------------------------------------------------------ */

const POCKET_DEFS = [
  { code: 'fix', name: 'Fix Cost', week: null },
  { code: 'week1', name: 'Week 1', week: 1 },
  { code: 'week2', name: 'Week 2', week: 2 },
  { code: 'week3', name: 'Week 3', week: 3 },
  { code: 'week4', name: 'Week 4', week: 4 },
];

/**
 * แบ่งเงินเดือนเป็น 2 ก้อน: FIX Cost และเงินที่ใช้ได้ (แตกเป็น 4 สัปดาห์)
 * ตัวอย่างตามโจทย์: เงินเดือน 20,000 -> Fix 5,000 / เหลือ 15,000 -> 3,750 x 4
 */
function planAllocation(salary, fixCost) {
  const fix = round2(clamp(fixCost, 0, salary));
  const spendable = round2(salary - fix);
  const per = Math.floor((spendable / 4) * 100) / 100;
  const weeks = [per, per, per, round2(spendable - per * 3)];
  return { salary: round2(salary), fix, spendable, weeks, percentPerWeek: 25 };
}

function buildPockets(userId, cycle, alloc, now = new Date()) {
  const t = now.toISOString();
  return POCKET_DEFS.map((def, i) => ({
    id: `pk_${userId}_${cycle.key}_${def.code}`,
    userId,
    cycleKey: cycle.key,
    code: def.code,
    name: def.name,
    week: def.week,
    allocated: def.code === 'fix' ? alloc.fix : alloc.weeks[def.week - 1],
    spent: 0,
    createdAt: t,
    order: i,
  }));
}

/* ------------------------------------------------------------------ */
/* Safe-to-Spend - "วันนี้ควรใช้เท่าไหร่"                                */
/* ------------------------------------------------------------------ */

/**
 * ยอดคงเหลือ (balance) ไม่ใช่ยอดที่ใช้ได้จริง
 * Safe-to-Spend = balance - บิลที่ยังไม่ตัด - เงินสัปดาห์ถัดไปที่กันไว้
 * วันนี้ควรใช้ = เงินสัปดาห์นี้ที่เหลือ / จำนวนวันที่เหลือในสัปดาห์
 */
function computeSafeToSpend(user, pockets, bills, cycle) {
  const unpaid = bills.filter((b) => !(b.paidCycles || []).includes(cycle.key));
  const unpaidTotal = round2(unpaid.reduce((s, b) => s + b.amount, 0));
  const curWeek = weekOfCycle(cycle);

  const byCode = Object.fromEntries(pockets.map((p) => [p.code, p]));
  const cur = byCode[`week${curWeek}`];
  const curRemaining = cur ? round2(cur.allocated - cur.spent) : 0;

  const futureReserved = round2(
    pockets.filter((p) => p.week && p.week > curWeek).reduce((s, p) => s + (p.allocated - p.spent), 0)
  );

  const dLeft = daysLeftInWeek(cycle);
  const perDay = round2(Math.max(0, curRemaining) / dLeft);
  const safeToSpend = round2(Math.max(0, user.balance - unpaidTotal - futureReserved));

  const r = weekRange(cycle, curWeek);
  const daysPassedInWeek = clamp(cycle.dayIndex - r.startDay + 1, 1, r.days);
  const plannedByNow = cur ? round2((cur.allocated / r.days) * daysPassedInWeek) : 0;
  const pace = cur && plannedByNow > 0 ? round2((cur.spent / plannedByNow) * 100) : 0;

  return {
    balance: round2(user.balance),
    unpaidBills: unpaidTotal,
    unpaidBillList: unpaid.map((b) => ({ id: b.id, name: b.name, amount: b.amount, dueDay: b.dueDay })),
    futureReserved,
    safeToSpend,
    today: perDay,
    week: curWeek,
    weekAllocated: cur ? cur.allocated : 0,
    weekSpent: cur ? round2(cur.spent) : 0,
    weekRemaining: curRemaining,
    daysLeftInWeek: dLeft,
    pace,
    status: pace <= 85 ? 'ahead' : pace <= 110 ? 'onTrack' : 'over',
  };
}

/* ------------------------------------------------------------------ */
/* Round-up - จ่าย 48 ปัดเป็น 50 ส่วนต่างเข้ากองทุนอัตโนมัติ             */
/* ------------------------------------------------------------------ */

function computeRoundup(amount, step) {
  const s = step || 50;
  const up = Math.ceil(amount / s) * s;
  return { rounded: round2(up), diff: round2(up - amount), step: s };
}

/* ------------------------------------------------------------------ */
/* First Jobber Score - วัดสุขภาพการเงิน 5 ด้าน                          */
/* ------------------------------------------------------------------ */

const SCORE_DIMS = [
  { key: 'saving', name: 'วินัยการออม', weight: 0.25, hint: 'ออมได้กี่ % ของรายได้ต่อเดือน' },
  { key: 'budget', name: 'คุมงบรายสัปดาห์', weight: 0.25, hint: 'ใช้เงินอยู่ในซองรายสัปดาห์หรือไม่' },
  { key: 'bills', name: 'จ่ายบิลตรงเวลา', weight: 0.2, hint: 'บิลประจำถูกตัดครบตามรอบ' },
  { key: 'buffer', name: 'เงินสำรองฉุกเฉิน', weight: 0.15, hint: 'มีเงินสำรองกี่เดือนของรายจ่าย' },
  { key: 'safety', name: 'ภูมิคุ้มกันภัยการเงิน', weight: 0.15, hint: 'ตรวจบัญชีก่อนโอน และไม่โอนเข้าบัญชีเสี่ยง' },
];

const TIER_BENEFIT = {
  Bronze: { rate: 0.5, credit: 0, label: 'ดอกเบี้ยเงินฝาก 0.50% ต่อปี' },
  Silver: { rate: 1.2, credit: 20000, label: 'ดอกเบี้ย 1.20% + วงเงินบัตรเริ่มต้น 20,000' },
  Gold: { rate: 1.8, credit: 50000, label: 'ดอกเบี้ย 1.80% + วงเงิน 50,000 + ลดดอกเบี้ยสินเชื่อ 0.5%' },
  Platinum: { rate: 2.5, credit: 100000, label: 'ดอกเบี้ย 2.50% + วงเงิน 100,000 + สินเชื่อบ้านลด 1%' },
};

function computeScore(ctx) {
  const { user, pockets, bills, cycle, tx, radarChecks, savingsBalance } = ctx;

  // 1) วินัยการออม : เป้า 20% ของเงินเดือน
  const savedThisCycle = round2(
    tx.filter((t) => t.type === 'save' && t.cycleKey === cycle.key).reduce((s, t) => s + t.amount, 0)
  );
  const savingRate = user.salary > 0 ? savedThisCycle / user.salary : 0;
  const saving = clamp(Math.round((savingRate / 0.2) * 100), 0, 100);

  // 2) คุมงบรายสัปดาห์ : ซองที่ผ่านมาไม่บานปลาย
  const curWeek = weekOfCycle(cycle);
  const done = pockets.filter((p) => p.week && p.week < curWeek);
  const active = pockets.find((p) => p.code === `week${curWeek}`);
  let budgetScore = 70;
  if (done.length) {
    budgetScore = Math.round((done.filter((p) => p.spent <= p.allocated).length / done.length) * 100);
  }
  if (active && active.spent > active.allocated) {
    const over = clamp(Math.round(((active.spent - active.allocated) / Math.max(1, active.allocated)) * 100), 0, 40);
    budgetScore = clamp(budgetScore - over, 0, 100);
  }

  // 3) จ่ายบิลตรงเวลา
  const paid = bills.filter((b) => (b.paidCycles || []).includes(cycle.key)).length;
  const dueSoFar = bills.filter((b) => b.dueDay <= new Date().getDate() || (b.paidCycles || []).includes(cycle.key)).length;
  const billsScore = bills.length === 0 ? 70 : dueSoFar === 0 ? 85 : Math.round((paid / Math.max(1, dueSoFar)) * 100);

  // 4) เงินสำรองฉุกเฉิน : เป้า 3 เดือนของรายจ่าย
  const monthlyExpense = Math.max(1, user.salary * 0.8);
  const months = savingsBalance / monthlyExpense;
  const buffer = clamp(Math.round((months / 3) * 100), 0, 100);

  // 5) ภูมิคุ้มกันภัยการเงิน
  const checks = radarChecks.length;
  const risky = radarChecks.filter((c) => c.proceeded && c.riskLevel !== 'safe').length;
  let safety = clamp(55 + clamp(checks * 6, 0, 45) - risky * 25, 0, 100);

  const parts = { saving, budget: budgetScore, bills: billsScore, buffer, safety };
  const total = Math.round(SCORE_DIMS.reduce((s, d) => s + parts[d.key] * d.weight, 0));
  const tier = total >= 85 ? 'Platinum' : total >= 70 ? 'Gold' : total >= 55 ? 'Silver' : 'Bronze';

  const dims = SCORE_DIMS.map((d) => ({
    ...d,
    score: parts[d.key],
    advice: adviceFor(d.key, parts[d.key], { savedThisCycle, savingRate, months, checks }),
  }));

  return {
    total, tier, benefit: TIER_BENEFIT[tier], dims, savedThisCycle,
    savingRate: round2(savingRate * 100), bufferMonths: round2(months),
  };
}

function adviceFor(key, score, x) {
  if (key === 'saving') {
    return score >= 80
      ? 'ออมได้ตามเป้า 20% แล้ว รักษาระดับนี้ไว้'
      : `ออมเพิ่มอีกราว ${Math.max(0, Math.round((0.2 - x.savingRate) * 100))}% ของเงินเดือนจะเต็ม 100 คะแนน`;
  }
  if (key === 'budget') return score >= 80 ? 'คุมซองรายสัปดาห์ได้ดีมาก' : 'ลองเลื่อนค่าใช้จ่ายที่ไม่จำเป็นไปสัปดาห์ถัดไป หรือปรับสัดส่วนซอง';
  if (key === 'bills') return score >= 80 ? 'บิลถูกตัดครบตามรอบ' : 'เปิดตัดอัตโนมัติจากซอง Fix Cost เพื่อไม่ให้ลืมจ่าย';
  if (key === 'buffer') return score >= 80 ? `มีเงินสำรอง ${x.months.toFixed(1)} เดือนแล้ว` : `ตอนนี้สำรองได้ ${x.months.toFixed(1)} เดือน เป้าหมาย 3 เดือน`;
  return score >= 80 ? 'ใช้ Scam Radar สม่ำเสมอ ดีมาก' : `ตรวจบัญชีก่อนโอนแล้ว ${x.checks} ครั้ง ตรวจทุกครั้งที่โอนหาคนแปลกหน้าจะปลอดภัยขึ้น`;
}

/* ------------------------------------------------------------------ */
/* Tax Coach ปีแรก                                                     */
/* ------------------------------------------------------------------ */

const TAX_BRACKETS = [
  { upto: 150000, rate: 0 },
  { upto: 300000, rate: 0.05 },
  { upto: 500000, rate: 0.1 },
  { upto: 750000, rate: 0.15 },
  { upto: 1000000, rate: 0.2 },
  { upto: 2000000, rate: 0.25 },
  { upto: 5000000, rate: 0.3 },
  { upto: Infinity, rate: 0.35 },
];

function taxOf(net) {
  let tax = 0, prev = 0;
  for (const b of TAX_BRACKETS) {
    if (net > prev) tax += (Math.min(net, b.upto) - prev) * b.rate;
    prev = b.upto;
    if (net <= b.upto) break;
  }
  return round2(Math.max(0, tax));
}

function marginalRate(net) {
  for (const b of TAX_BRACKETS) if (net <= b.upto) return b.rate;
  return 0.35;
}

/**
 * คำนวณภาษีปีแรกจากเงินเดือนจริงตั้งแต่กลางปี
 * monthsWorked = จำนวนเดือนที่มีรายได้ในปีภาษีนั้น
 */
function computeTax(input) {
  const salary = Number(input.salary) || 0;
  const months = clamp(Number(input.monthsWorked) || 0, 0, 12);
  const bonus = Number(input.bonus) || 0;
  const income = round2(salary * months + bonus);

  const expenseDeduct = Math.min(income * 0.5, 100000);
  const personal = 60000;
  const ssoMonthly = Math.min(salary * 0.05, 750);
  const sso = Math.min(round2(ssoMonthly * months), 9000);
  const insurance = Math.min(Number(input.insurance) || 0, 100000);
  const parents = clamp(Number(input.parents) || 0, 0, 4) * 30000;
  const donationRaw = Number(input.donation) || 0;

  const baseDeduct = round2(expenseDeduct + personal + sso + insurance + parents);
  const donation = round2(Math.min(donationRaw, Math.max(0, (income - baseDeduct) * 0.1)));
  const netBefore = round2(Math.max(0, income - baseDeduct - donation));
  const taxBefore = taxOf(netBefore);
  const withheld = round2(Number(input.withheld) || 0);

  const capThaiESG = round2(Math.min(income * 0.3, 300000));
  const capRMF = round2(Math.min(income * 0.3, 500000));
  const capSSF = round2(Math.min(income * 0.3, 200000));
  const hardCap = round2(Math.min(capThaiESG + capRMF + capSSF, 500000));

  const toZero = Math.max(0, round2(netBefore - 150000));
  const edges = [150000, 300000, 500000, 750000, 1000000];
  const nextEdge = [...edges].reverse().find((e) => e < netBefore);
  const toNextBracket = nextEdge ? round2(netBefore - nextEdge) : 0;

  const suggestOptimal = round2(Math.min(toZero, hardCap));
  const suggestLight = round2(Math.min(toNextBracket, hardCap));

  // เด็กจบใหม่ไม่ควรล็อกเงินก้อนใหญ่เพื่อประหยัดภาษีไม่กี่พัน
  // จึงจำกัดคำแนะนำไว้ที่ 15% ของรายได้ทั้งปี และปัดลงหลักพัน
  const affordCap = Math.floor((income * 0.15) / 1000) * 1000;
  const suggestRecommended = taxBefore === 0 ? 0 : round2(Math.max(0, Math.min(suggestOptimal, affordCap)));

  const scenarios = [
    { key: 'none', label: 'ไม่ซื้อกองทุนลดหย่อนเลย', invest: 0 },
    { key: 'recommended', label: 'แนะนำสำหรับคุณ (ไม่เกิน 15% ของรายได้)', invest: suggestRecommended },
    { key: 'light', label: 'ซื้อพอให้ลงขั้นภาษีถัดไป', invest: suggestLight },
    { key: 'optimal', label: 'ซื้อให้ภาษีเหลือ 0 บาท', invest: suggestOptimal },
  ].map((s) => {
    const net = round2(Math.max(0, netBefore - s.invest));
    const tax = taxOf(net);
    const saved = round2(taxBefore - tax);
    return {
      ...s, net, tax, saved, refund: round2(withheld - tax),
      efficiency: s.invest > 0 ? round2((saved / s.invest) * 100) : 0,
    };
  });

  return {
    income, months, salary, bonus,
    deductions: { expense: round2(expenseDeduct), personal, sso, insurance, parents, donation },
    totalDeduction: round2(baseDeduct + donation),
    netIncome: netBefore,
    taxBefore,
    withheld,
    balanceDue: round2(taxBefore - withheld),
    effectiveRate: income > 0 ? round2((taxBefore / income) * 100) : 0,
    marginalRate: round2(marginalRate(netBefore) * 100),
    caps: { thaiESG: capThaiESG, rmf: capRMF, ssf: capSSF },
    suggestOptimal,
    suggestLight,
    suggestRecommended,
    scenarios,
    products: suggestRecommended > 0 ? buildFundBasket(suggestRecommended, { capThaiESG, capRMF, capSSF }) : [],
    liquidityNote: suggestRecommended > 0
      ? 'เงินที่ซื้อกองทุนไม่ได้หายไป แต่ถูกล็อกตามเงื่อนไข (ThaiESG 5 ปี / SSF 10 ปี / RMF ถึงอายุ 55) ควรกันเงินสำรองฉุกเฉิน 3 เดือนไว้ก่อน'
      : '',
    filingDeadline: `31 มี.ค. ${new Date().getFullYear() + 1 + 543}`,
  };
}

/** จัดตะกร้ากองทุนลดหย่อน คลิกเดียวซื้อครบ */
function buildFundBasket(total, caps) {
  const picks = [
    { code: 'K-ESGSI-ThaiESG', name: 'K หุ้นไทยยั่งยืน ThaiESG', type: 'Thai ESG', lock: 'ถือ 5 ปี', risk: 6, cap: caps.capThaiESG, weight: 0.4 },
    { code: 'K-WORLDX-SSF', name: 'K หุ้นโลก SSF', type: 'SSF', lock: 'ถือ 10 ปี', risk: 6, cap: caps.capSSF, weight: 0.35 },
    { code: 'K-FIXEDPLUS-RMF', name: 'K ตราสารหนี้ RMF', type: 'RMF', lock: 'ถือถึงอายุ 55', risk: 4, cap: caps.capRMF, weight: 0.25 },
  ];
  let left = round2(total);
  const out = [];
  for (const p of picks) {
    const amt = round2(Math.min(Math.round(total * p.weight), p.cap, left));
    if (amt > 0) { out.push({ ...p, amount: amt }); left = round2(left - amt); }
  }
  if (left > 0 && out.length) out[0].amount = round2(out[0].amount + left);
  return out;
}

/* ------------------------------------------------------------------ */
/* Scam Radar - ตรวจบัญชีปลายทางก่อนโอน                                 */
/* ------------------------------------------------------------------ */

const RISK = {
  safe: { label: 'ปลอดภัย', color: 'green', action: 'โอนได้ตามปกติ' },
  watch: { label: 'ควรระวัง', color: 'amber', action: 'ตรวจสอบชื่อผู้รับให้ตรงกับที่ตกลงไว้ก่อนโอน' },
  warn: { label: 'เสี่ยงสูง', color: 'orange', action: 'แนะนำให้ชะลอการโอน และยืนยันตัวตนผู้รับก่อน' },
  danger: { label: 'อันตราย', color: 'red', action: 'ไม่แนะนำให้โอน บัญชีนี้ถูกรายงานหลายครั้ง' },
};

function accountAgeDays(openedAt) {
  if (!openedAt) return null;
  return Math.max(0, Math.round((Date.now() - new Date(openedAt).getTime()) / DAY));
}

/**
 * ให้คะแนนความเสี่ยง 0-100 พร้อมเหตุผลที่อ่านเข้าใจได้
 * ใช้ข้อมูลจริงจาก scamAccounts + scamReports ที่ผู้ใช้รายงานเข้ามาและเจ้าหน้าที่ยืนยันแล้ว
 */
function assessAccount(account, verifiedReports, ctx = {}) {
  const reasons = [];
  let risk = 0;
  const add = (icon, text, weight) => { risk += weight; reasons.push({ icon, text, weight }); };

  const age = account ? accountAgeDays(account.openedAt) : null;
  if (age === null) add('unknown', 'ธนาคารยังไม่มีข้อมูลวันเปิดบัญชีปลายทาง ตรวจสอบชื่อผู้รับให้ดีก่อนโอน', 25);
  else if (age < 7) add('new', `บัญชีเพิ่งเปิดเมื่อ ${age} วันที่แล้ว (บัญชีม้ามักเปิดใหม่)`, 45);
  else if (age < 30) add('new', `บัญชีเปิดมา ${age} วัน ยังถือว่าใหม่มาก`, 30);
  else if (age < 180) add('new', `บัญชีเปิดมา ${Math.round(age / 30)} เดือน`, 10);
  else add('ok', `บัญชีเปิดมาแล้ว ${Math.round((age / 365) * 10) / 10} ปี`, 0);

  const reportCount = verifiedReports.length;
  if (reportCount >= 5) add('report', `ถูกรายงานว่าเกี่ยวข้องกับการหลอกลวง ${reportCount} ครั้ง`, 55);
  else if (reportCount >= 2) add('report', `ถูกรายงาน ${reportCount} ครั้งจากผู้ใช้ K PLUS`, 35);
  else if (reportCount === 1) add('report', 'ถูกรายงาน 1 ครั้ง', 20);
  else add('ok', 'ไม่พบประวัติการถูกรายงาน', 0);

  if (account && account.blacklisted) add('ban', 'อยู่ในบัญชีดำของหน่วยงานรัฐ (ปปง. / ตำรวจไซเบอร์)', 60);
  if (account && account.mule) add('ban', 'มีรูปแบบเงินเข้า-ออกเร็วผิดปกติ เข้าข่ายบัญชีม้า', 30);

  const hour = new Date().getHours();
  if (ctx.amount && ctx.amount >= 20000) add('amount', 'ยอดโอนสูงกว่าที่คุณโอนตามปกติ', 10);
  if (hour >= 0 && hour < 5) add('time', 'โอนในช่วงเวลาดึกผิดปกติ (00:00-05:00)', 8);
  if (ctx.firstTime) add('first', 'เป็นการโอนหาบัญชีนี้ครั้งแรก', 8);
  if (account && account.verifiedMerchant) add('ok', `ร้านค้ายืนยันตัวตนกับธนาคารแล้ว (${account.merchantName || 'Verified Merchant'})`, -30);

  risk = clamp(Math.round(risk), 0, 100);
  const level = risk >= 70 ? 'danger' : risk >= 45 ? 'warn' : risk >= 20 ? 'watch' : 'safe';
  return {
    risk,
    level,
    ...RISK[level],
    accountAgeDays: age,
    reportCount,
    reasons: reasons.sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight)),
    recentReports: verifiedReports.slice(0, 5).map((r) => ({ type: r.type, createdAt: r.createdAt, amount: r.amount })),
  };
}

const REPORT_TYPES = [
  { code: 'online_shop', label: 'ซื้อของออนไลน์แล้วไม่ได้ของ' },
  { code: 'mule', label: 'บัญชีม้า / รับโอนแทน' },
  { code: 'investment', label: 'ชวนลงทุนหลอกลวง' },
  { code: 'call_center', label: 'แก๊งคอลเซ็นเตอร์' },
  { code: 'romance', label: 'หลอกให้รักแล้วโอนเงิน' },
  { code: 'loan', label: 'เงินกู้ปลอม / เก็บค่าดำเนินการ' },
  { code: 'part_time', label: 'งานพาร์ทไทม์ปลอม' },
  { code: 'other', label: 'อื่น ๆ' },
];

module.exports = {
  round2, clamp, getCycle, weekOfCycle, weekRange, daysLeftInWeek,
  POCKET_DEFS, planAllocation, buildPockets,
  computeSafeToSpend, computeRoundup, computeScore, SCORE_DIMS,
  computeTax, taxOf, buildFundBasket, assessAccount, accountAgeDays,
  REPORT_TYPES, RISK, TIER_BENEFIT,
};
