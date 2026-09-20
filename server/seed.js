'use strict';
/**
 * seed.js - สร้างข้อมูลตั้งต้นที่สมจริง (2 รอบเงินเดือนย้อนหลัง)
 * รันด้วย: npm run seed  หรือ  node server/seed.js
 */
const { db, reset, save, flush, uid } = require('./db');
const L = require('./logic');

const DAY = 86400000;

// RNG แบบกำหนด seed ได้ เพื่อให้ข้อมูลตั้งต้นเหมือนเดิมทุกครั้ง
let _s = 20260920;
function rnd() { _s = (_s * 1103515245 + 12345) & 0x7fffffff; return _s / 0x7fffffff; }
const pick = (a) => a[Math.floor(rnd() * a.length)];
const between = (a, b) => Math.round(a + rnd() * (b - a));

const USERS = [
  { name: 'มิ้น ศศิธร', nickname: 'มิ้น', avatar: 'M', jobTitle: 'Sales Executive', company: 'บ.รุ่งเรืองเทรดดิ้ง', salary: 20000, fixCost: 5000, paydayDay: 25, roundupStep: 50, roundupEnabled: true, startWorkMonth: `${new Date().getFullYear()}-05` },
  { name: 'ณิชา วรรณกร', nickname: 'ณิชา', avatar: 'ณ', jobTitle: 'Marketing Executive', company: 'Agency แห่งหนึ่ง', salary: 22000, fixCost: 6500, paydayDay: 25, roundupStep: 20, roundupEnabled: true, startWorkMonth: `${new Date().getFullYear()}-04` },
  { name: 'ภูมิ อัครเดช', nickname: 'ภูมิ', avatar: 'ภ', jobTitle: 'Junior Developer', company: 'Startup Fintech', salary: 32000, fixCost: 9000, paydayDay: 28, roundupStep: 100, roundupEnabled: true, startWorkMonth: `${new Date().getFullYear()}-02` },
  { name: 'แพรว ชนากานต์', nickname: 'แพรว', avatar: 'พ', jobTitle: 'พยาบาลวิชาชีพ', company: 'รพ.เอกชน', salary: 26000, fixCost: 7500, paydayDay: 25, roundupStep: 50, roundupEnabled: false, startWorkMonth: `${new Date().getFullYear()}-06` },
  { name: 'ต้าร์ ธนกฤต', nickname: 'ต้าร์', avatar: 'ต', jobTitle: 'Graphic Designer', company: 'Freelance + Part time', salary: 18000, fixCost: 5500, paydayDay: 5, roundupStep: 50, roundupEnabled: true, startWorkMonth: `${new Date().getFullYear()}-07` },
];

const BILL_SETS = [
  [['ค่าหอพัก', 3500, 1], ['ค่าไฟ', 650, 8], ['ค่าเน็ต+มือถือ', 550, 10], ['ผ่อนมือถือ', 300, 15]],
  [['ค่าหอพัก', 4500, 1], ['ค่าไฟ+น้ำ', 900, 8], ['ค่ามือถือ', 600, 12], ['Netflix+Spotify', 500, 5]],
  [['ค่าคอนโด', 6500, 1], ['ค่าไฟ+น้ำ', 1200, 8], ['ค่าเน็ต', 700, 10], ['ประกันสุขภาพ', 600, 20]],
  [['ค่าหอพัก', 5000, 1], ['ค่าไฟ+น้ำ', 1000, 8], ['ค่ามือถือ', 700, 12], ['ผ่อนคอม', 800, 18]],
  [['ค่าห้องเช่า', 3800, 1], ['ค่าไฟ+น้ำ', 700, 8], ['ค่าเน็ต', 500, 10], ['ค่าเดินทางรายเดือน', 500, 3]],
];

const MERCHANTS = {
  food: ['7-Eleven', 'Café Amazon', 'ร้านข้าวมันไก่ป้าแดง', 'MK Restaurant', 'Starbucks', 'foodpanda', 'ส้มตำหน้าปากซอย', 'After You'],
  transport: ['BTS Rabbit', 'Grab', 'MRT', 'Bolt', 'ปั๊ม ปตท.', 'วินมอเตอร์ไซค์'],
  shopping: ['Shopee', 'Lazada', 'Uniqlo', 'Lotus’s', 'Big C', 'Watsons'],
  entertain: ['Netflix', 'Major Cineplex', 'Spotify', 'ร้านเหล้าเพื่อน ๆ', 'Steam'],
  health: ['ร้านขายยา Boots', 'คลินิกใกล้บ้าน', 'ฟิตเนส'],
  other: ['โอนให้แม่', 'ตัดผม', 'ซักรีด'],
};

const SCAM_ACCOUNTS = [
  { bank: 'KBank', accountNo: '1234567890', accountName: 'บจก. ช้อปดีมีคืน', openedAt: iso(-1400), verifiedMerchant: true, merchantName: 'ร้านค้ายืนยันตัวตน' },
  { bank: 'KBank', accountNo: '9876543210', accountName: 'นาย ส. สมชาย', openedAt: iso(-3), mule: true },
  { bank: 'SCB', accountNo: '4051239876', accountName: 'น.ส. ก. กานดา', openedAt: iso(-12) },
  { bank: 'KTB', accountNo: '6789012345', accountName: 'นาย ว. วิชัย', openedAt: iso(-21), mule: true, blacklisted: true },
  { bank: 'BBL', accountNo: '1590246810', accountName: 'บจก. ลงทุนมั่งคั่ง', openedAt: iso(-45), mule: true },
  { bank: 'KBank', accountNo: '0555123456', accountName: 'นาย ธ. ธนา', openedAt: iso(-900) },
  { bank: 'TTB', accountNo: '7412589630', accountName: 'น.ส. พ. พรทิพย์', openedAt: iso(-730) },
  { bank: 'KBank', accountNo: '3216549870', accountName: 'ร้านกาแฟหอมกรุ่น', openedAt: iso(-620), verifiedMerchant: true, merchantName: 'ร้านกาแฟหอมกรุ่น' },
  { bank: 'GSB', accountNo: '2468013579', accountName: 'นาย อ. อนุชา', openedAt: iso(-5), mule: true },
  { bank: 'SCB', accountNo: '8529637410', accountName: 'น.ส. ม. มาลี', openedAt: iso(-370) },
];

function iso(daysFromNow, hour) {
  const d = new Date(Date.now() + daysFromNow * DAY);
  if (hour != null) d.setHours(hour, between(0, 59), 0, 0);
  return d.toISOString();
}

function run() {
  reset();
  const d = db();
  d.meta.seededAt = new Date().toISOString();

  d.scamAccounts = SCAM_ACCOUNTS.map((a) => ({
    id: uid('sa'), blacklisted: false, mule: false, verifiedMerchant: false, source: 'bank', createdAt: iso(-60), ...a,
  }));

  USERS.forEach((tpl, idx) => {
    const id = `u_${idx + 1}`;
    const user = {
      id, ...tpl, email: `${['mint', 'nicha', 'poom', 'praew', 'tar'][idx]}@example.com`,
      balance: 0, savings: between(1500, 9000), createdAt: iso(-between(60, 200)),
    };
    d.users.push(user);

    BILL_SETS[idx].forEach(([name, amount, dueDay]) => {
      d.bills.push({ id: uid('bl'), userId: id, name, amount, dueDay, autoDebit: rnd() > 0.4, paidCycles: [] });
    });

    seedCycles(user);
  });

  seedPocketMoves();
  seedSafety();
  flush();

  console.log('seed เรียบร้อย');
  console.log(`  ผู้ใช้ ${d.users.length} คน | รายการ ${d.transactions.length} | round-up ${d.roundups.length}`);
  console.log(`  ย้ายซอง ${d.pocketMoves.length} ครั้ง | ตรวจบัญชี ${d.radarChecks.length} ครั้ง | รายงาน ${d.scamReports.length} เคส`);
}

/** สร้างรอบเงินเดือนก่อนหน้า (จ่ายครบ) + รอบปัจจุบัน (ใช้ไปถึงวันนี้) */
function seedCycles(user) {
  const d = db();
  const cur = L.getCycle(user.paydayDay);
  const prevStart = new Date(new Date(cur.start).getTime() - 1 * DAY);
  const prev = L.getCycle(user.paydayDay, prevStart);
  const alloc = L.planAllocation(user.salary, user.fixCost);

  for (const [cycle, isCurrent] of [[prev, false], [cur, true]]) {
    const pockets = L.buildPockets(user.id, cycle, alloc, new Date(cycle.start));
    d.pockets.push(...pockets);
    user.balance = L.round2(user.balance + user.salary);
    d.transactions.push({
      id: uid('tx'), userId: user.id, type: 'income', amount: user.salary, merchant: 'เงินเดือนเข้าบัญชี',
      category: 'other', pocketCode: null, cycleKey: cycle.key, createdAt: cycle.start,
    });

    const lastDay = isCurrent ? cycle.dayIndex : cycle.totalDays - 1;

    // บิลประจำ
    const bills = d.bills.filter((b) => b.userId === user.id);
    for (const b of bills) {
      const payDayIndex = Math.min(between(1, 6), lastDay);
      if (payDayIndex > lastDay) continue;
      if (!isCurrent || cycle.dayIndex >= payDayIndex) {
        b.paidCycles.push(cycle.key);
        const fix = pockets.find((p) => p.code === 'fix');
        fix.spent = L.round2(fix.spent + b.amount);
        user.balance = L.round2(user.balance - b.amount);
        d.transactions.push({
          id: uid('tx'), userId: user.id, type: 'expense', amount: b.amount, merchant: b.name,
          category: 'bill', pocketCode: 'fix', cycleKey: cycle.key,
          createdAt: iso(dayOffset(cycle, payDayIndex), between(8, 11)),
        });
      }
    }

    // ค่าใช้จ่ายรายวัน
    const dailyTarget = alloc.spendable / cycle.totalDays;
    for (let dayI = 0; dayI <= lastDay; dayI++) {
      const week = L.clamp(Math.floor(dayI / 7) + 1, 1, 4);
      const pocket = pockets.find((p) => p.code === `week${week}`);
      const n = rnd() < 0.3 ? 3 : between(1, 2);
      for (let k = 0; k < n; k++) {
        const cat = pick(['food', 'food', 'food', 'food', 'transport', 'transport', 'shopping', 'entertain', 'health', 'other']);
        const base = { food: [40, 220], transport: [25, 140], shopping: [120, 900], entertain: [100, 650], health: [80, 500], other: [90, 600] }[cat];
        let amt = between(base[0], base[1]);
        if (rnd() < 0.55) amt = amt - between(1, 9); // ให้มีเศษ เพื่อให้ round-up ทำงาน
        amt = Math.max(15, amt);
        const when = iso(dayOffset(cycle, dayI), between(7, 22));
        const merchant = pick(MERCHANTS[cat] || MERCHANTS.other);
        const tx = {
          id: uid('tx'), userId: user.id, type: 'expense', amount: amt, merchant,
          category: cat, pocketCode: pocket.code, cycleKey: cycle.key, createdAt: when,
        };
        d.transactions.push(tx);
        pocket.spent = L.round2(pocket.spent + amt);
        user.balance = L.round2(user.balance - amt);

        if (user.roundupEnabled) {
          const r = L.computeRoundup(amt, user.roundupStep);
          if (r.diff > 0) {
            d.roundups.push({ id: uid('ru'), userId: user.id, txId: tx.id, merchant, amount: amt, rounded: r.rounded, diff: r.diff, step: r.step, cycleKey: cycle.key, createdAt: when });
            user.balance = L.round2(user.balance - r.diff);
            user.savings = L.round2(user.savings + r.diff);
            d.transactions.push({ id: uid('tx'), userId: user.id, type: 'save', amount: r.diff, merchant: `Round-up จาก ${merchant}`, category: 'other', pocketCode: null, cycleKey: cycle.key, createdAt: when, auto: true });
          }
        }
      }
      // ออมเองเป็นครั้งคราว
      if (rnd() < 0.06) {
        const amt = between(200, 1500);
        if (user.balance > amt) {
          user.balance = L.round2(user.balance - amt);
          user.savings = L.round2(user.savings + amt);
          d.transactions.push({ id: uid('tx'), userId: user.id, type: 'save', amount: amt, merchant: 'ออมเข้ากองทุนด้วยตัวเอง', category: 'other', pocketCode: null, cycleKey: cycle.key, createdAt: iso(dayOffset(cycle, dayI), 20) });
        }
      }
      void dailyTarget;
    }
  }
  user.balance = L.round2(Math.max(user.balance, between(3500, 9000)));
}

function dayOffset(cycle, dayIndex) {
  const t = new Date(cycle.start).getTime() + dayIndex * DAY;
  return Math.round((t - Date.now()) / DAY);
}

const MOVE_REASONS = [
  'งานเลี้ยงรุ่นกลางสัปดาห์', 'ค่าหมอฟันฉุกเฉิน', 'ซื้อของขวัญวันเกิดเพื่อน',
  'ค่าซ่อมมอเตอร์ไซค์', 'ตั๋วคอนเสิร์ตที่จองไว้', 'เพื่อนชวนไปเที่ยวเสาร์อาทิตย์',
];

/** ประวัติการย้ายเงินระหว่างซอง (ไม่ใช่ทุกคน เพื่อให้เห็นทั้งเคสที่เคยย้ายและยังไม่เคยย้าย) */
function seedPocketMoves() {
  const d = db();
  d.users.forEach((user, idx) => {
    if (idx === 2 || idx === 4) return;
    const cur = L.getCycle(user.paydayDay);
    const prev = L.getCycle(user.paydayDay, new Date(new Date(cur.start).getTime() - DAY));

    [[cur, true], [prev, false]].forEach(([cycle, isCurrent]) => {
      const pockets = d.pockets.filter((p) => p.userId === user.id && p.cycleKey === cycle.key);
      if (!pockets.length) return;
      const curWeek = isCurrent ? L.weekOfCycle(cycle) : between(2, 3);
      const to = pockets.find((p) => p.code === `week${curWeek}`);
      const from = pockets
        .filter((p) => p.week && p.week !== curWeek)
        .sort((a, b) => (b.allocated - b.spent) - (a.allocated - a.spent))[0];
      if (!to || !from) return;

      const avail = from.allocated - from.spent;
      const amt = Math.min(Math.round((avail * 0.3) / 50) * 50, 1500);
      if (amt < 200) return;

      from.allocated = L.round2(from.allocated - amt);
      to.allocated = L.round2(to.allocated + amt);

      const dayI = isCurrent
        ? between(1, Math.max(1, cycle.dayIndex))
        : between(3, Math.max(4, cycle.totalDays - 2));
      const when = iso(dayOffset(cycle, dayI), between(10, 21));
      const note = pick(MOVE_REASONS);

      d.pocketMoves.push({
        id: uid('mv'), userId: user.id, cycleKey: cycle.key,
        from: from.code, fromName: from.name, to: to.code, toName: to.name,
        amount: amt, note,
        fromLeft: L.round2(from.allocated - from.spent),
        toLeft: L.round2(to.allocated - to.spent),
        week: curWeek, createdAt: when,
      });
      d.events.push({
        id: uid('ev'), userId: user.id, type: 'pocket_moved',
        payload: { from: from.code, to: to.code, amount: amt, note }, createdAt: when,
      });
    });
  });
  save();
}

/** ข้อมูลฝั่งความปลอดภัย: การตรวจบัญชี + รายงานจริง */
function seedSafety() {
  const d = db();
  const users = d.users;
  const types = ['online_shop', 'mule', 'investment', 'call_center', 'part_time', 'loan', 'romance'];

  const scenarios = [
    { acc: '9876543210', bank: 'KBank', amount: 2500, aborted: true, report: { type: 'online_shop', detail: 'สั่งรองเท้าจากเพจใน Facebook โอนแล้วบล็อกหนี', status: 'verified' } },
    { acc: '6789012345', bank: 'KTB', amount: 15000, aborted: true, report: { type: 'investment', detail: 'ชวนลงทุนทองคำ การันตีกำไร 20% ต่อเดือน', status: 'verified' } },
    { acc: '1590246810', bank: 'BBL', amount: 30000, aborted: true, report: { type: 'investment', detail: 'เพจปลอมอ้างเป็นโบรกเกอร์ ให้โอนเปิดพอร์ต', status: 'verified' } },
    { acc: '4051239876', bank: 'SCB', amount: 1890, aborted: false, report: { type: 'online_shop', detail: 'ซื้อบัตรคอนเสิร์ตต่อจากทวิตเตอร์ ไม่ได้บัตร', status: 'verified' } },
    { acc: '2468013579', bank: 'GSB', amount: 990, aborted: true, report: { type: 'part_time', detail: 'จ้างกดไลก์รับงาน ต้องโอนค่าเปิดระบบก่อน', status: 'pending' } },
    { acc: '9876543210', bank: 'KBank', amount: 4200, aborted: true, report: { type: 'mule', detail: 'บัญชีเดียวกับที่เพื่อนเคยโดน', status: 'verified' } },
    { acc: '6789012345', bank: 'KTB', amount: 8000, aborted: true, report: { type: 'call_center', detail: 'อ้างเป็นเจ้าหน้าที่ DSI บอกว่าพัวพันฟอกเงิน', status: 'pending' } },
    { acc: '8529637410', bank: 'SCB', amount: 600, aborted: false, report: null },
    { acc: '0555123456', bank: 'KBank', amount: 1200, aborted: false, report: null },
    { acc: '3216549870', bank: 'KBank', amount: 185, aborted: false, report: null },
    { acc: '1234567890', bank: 'KBank', amount: 2390, aborted: false, report: null },
    { acc: '7412589630', bank: 'TTB', amount: 3000, aborted: false, report: null },
    { acc: '2468013579', bank: 'GSB', amount: 1500, aborted: true, report: { type: 'loan', detail: 'เงินกู้ออนไลน์ ขอค่าค้ำประกันก่อนปล่อยวงเงิน', status: 'verified' } },
    { acc: '4051239876', bank: 'SCB', amount: 2200, aborted: true, report: { type: 'online_shop', detail: 'พรีออเดอร์สินค้าเกาหลี ปิดเพจหนี', status: 'rejected' } },
  ];

  let n = 0;
  for (const sc of scenarios) {
    const user = users[n % users.length];
    const daysAgo = -between(1, 28);
    const acc = d.scamAccounts.find((a) => a.accountNo === sc.acc);
    const priorVerified = d.scamReports.filter((r) => r.accountNo === sc.acc && r.status === 'verified');
    const assess = L.assessAccount(acc, priorVerified, { amount: sc.amount, firstTime: true });
    const when = iso(daysAgo, between(9, 21));

    d.radarChecks.push({
      id: uid('rc'), userId: user.id, bank: sc.bank, accountNo: sc.acc,
      accountName: acc ? acc.accountName : 'ไม่ทราบชื่อบัญชี', amount: sc.amount,
      risk: assess.risk, riskLevel: assess.level, proceeded: !sc.aborted,
      aborted: !!sc.aborted, abortedAt: sc.aborted ? when : null,
      abortReason: sc.aborted ? 'ผู้ใช้ยกเลิกหลังเห็นคำเตือนจาก Scam Radar' : null,
      createdAt: when,
    });

    if (sc.report) {
      const caseNo = `KSR-${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(d.scamReports.length + 1).padStart(4, '0')}`;
      d.scamReports.push({
        id: uid('rp'), userId: user.id, reporterName: user.name, bank: sc.bank, accountNo: sc.acc,
        accountName: acc ? acc.accountName : '', amount: sc.aborted ? 0 : sc.amount,
        type: sc.report.type, detail: sc.report.detail, channel: 'app', evidenceUrl: '',
        status: sc.report.status, caseNo, forwardedTo: 'ศูนย์รับแจ้งเหตุภัยทางการเงิน (AOC 1441)',
        createdAt: when,
        reviewedAt: sc.report.status === 'pending' ? null : iso(daysAgo + 1, 14),
        reviewer: sc.report.status === 'pending' ? null : 'ops.somsak',
        reviewNote: sc.report.status === 'verified' ? 'ตรวจสอบแล้วพบความผิดปกติจริง ส่งต่อหน่วยงาน' : sc.report.status === 'rejected' ? 'หลักฐานไม่เพียงพอ ขอข้อมูลเพิ่มเติม' : '',
      });
      if (sc.report.status === 'verified' && acc) acc.mule = true;
    }
    d.events.push({ id: uid('ev'), userId: user.id, type: 'radar_check', payload: { accountNo: sc.acc, level: assess.level, risk: assess.risk }, createdAt: when });
    n++;
  }
  // มีผู้ใช้ซื้อกองทุนลดหย่อนไปแล้ว 1 ราย
  const poom = users.find((u) => u.nickname === 'ภูมิ');
  if (poom) {
    const amt = 12000;
    poom.savings = L.round2(Math.max(0, poom.savings - amt));
    d.taxPlans.push({ id: uid('tp'), userId: poom.id, amount: amt, source: 'savings', basket: L.buildFundBasket(amt, { capThaiESG: amt, capSSF: amt, capRMF: amt }), taxYear: new Date().getFullYear(), createdAt: iso(-9, 11) });
    d.transactions.push({ id: uid('tx'), userId: poom.id, type: 'invest', amount: amt, merchant: 'ซื้อกองทุนลดหย่อนภาษี', category: 'other', pocketCode: null, cycleKey: L.getCycle(poom.paydayDay).key, createdAt: iso(-9, 11) });
    d.events.push({ id: uid('ev'), userId: poom.id, type: 'tax_fund_bought', payload: { amount: amt }, createdAt: iso(-9, 11) });
  }
  d.events.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  save();
}

if (require.main === module) run();
module.exports = { run };
