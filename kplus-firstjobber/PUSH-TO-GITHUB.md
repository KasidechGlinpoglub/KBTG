# วิธีขึ้นโปรเจกต์นี้บน GitHub

โฟลเดอร์นี้เป็น **git repository พร้อม push แล้ว** (init + commit แรกเรียบร้อย 19 ไฟล์ บน branch `main`)
เหลือแค่สร้าง repo บน GitHub แล้วต่อ remote

ตรวจสอบก่อนได้ด้วย:

```bash
git log --oneline
```

---

## วิธีที่ 1 — ใช้หน้าเว็บ GitHub (ง่ายสุด ไม่ต้องลงอะไรเพิ่ม)

1. เข้า https://github.com/new → ตั้งชื่อ repo เช่น `kplus-first-jobber`
2. **อย่า** ติ๊ก "Add a README file" (เพราะในเครื่องมีอยู่แล้ว)
3. กด Create repository แล้วคัดลอก URL ที่ได้
4. กลับมาที่เครื่อง รันตามนี้ (แทน `<URL>` ด้วยของจริง):

```bash
git remote add origin <URL>
git push -u origin main
```

> ถ้ายังไม่เคยตั้งชื่อผู้ใช้ git ในเครื่อง ให้ตั้งก่อนหนึ่งครั้ง:
> `git config --global user.name "ชื่อคุณ"` และ `git config --global user.email "อีเมลคุณ"`

---

## วิธีที่ 2 — ลากไฟล์ ZIP ขึ้นเว็บ (ไม่ต้องใช้ git เลย)

1. สร้าง repo เปล่าบน GitHub
2. กด **uploading an existing file**
3. แตกไฟล์ `kplus-firstjobber.zip` แล้วลากไฟล์ทั้งหมดเข้าไป
4. กด Commit changes

---

## วิธีที่ 3 — ใช้ GitHub CLI (ถ้าติดตั้ง `gh`)

ดาวน์โหลด: https://cli.github.com

```bash
gh auth login
gh repo create kplus-first-jobber --public --source=. --remote=origin --push
```

เปลี่ยน `--public` เป็น `--private` ถ้าอยากให้เห็นเฉพาะตัวเอง

---

## เรื่อง GitHub Pages — อ่านก่อน

GitHub Pages เสิร์ฟได้เฉพาะ **ไฟล์นิ่ง (static)** เท่านั้น **รัน Node.js ไม่ได้**
ต้นแบบนี้มีเซิร์ฟเวอร์ที่ทำหน้าที่คำนวณและเก็บข้อมูลจริง ถ้าเปิด Pages แล้วชี้ไปที่ `public/`
หน้าเว็บจะโหลดขึ้นแต่ **เรียก API ไม่ได้** (หน้าจอจะขึ้นว่าเชื่อมต่อเซิร์ฟเวอร์ไม่ได้)

ทางเลือกถ้าต้องการลิงก์ที่เปิดดูได้เลย:

| ทางเลือก | ได้อะไร | ต้องทำอะไร |
|---|---|---|
| **เก็บโค้ดบน GitHub แล้วรันในเครื่อง** | ใช้งานได้ครบทุกฟีเจอร์ | `git clone` แล้ว `npm start` |
| **Render / Railway / Fly.io** (ฟรีทีเออร์) | ลิงก์สาธารณะ ใช้งานได้ครบ | ต่อ GitHub repo แล้วตั้ง start command เป็น `node server/index.js` |
| **GitHub Codespaces** | เปิดรันบนเว็บจาก repo ได้ทันที | กด Code → Codespaces → Create |
| **แปลงเป็นเดโมแบบ static** | เปิดบน GitHub Pages ได้ แต่ข้อมูลเก็บในเบราว์เซอร์ของแต่ละคน ไม่ใช่ฐานข้อมูลกลาง | ต้องพอร์ตฝั่งเซิร์ฟเวอร์ไปรันในเบราว์เซอร์ |

### ถ้าจะ deploy ขึ้น Render (แนะนำ เพราะเร็วสุดและฟรี)

1. push โค้ดขึ้น GitHub ตามวิธีข้างบน
2. เข้า https://render.com → New → Web Service → เลือก repo นี้
3. ตั้งค่า:
   - Runtime: **Node**
   - Build Command: *(เว้นว่าง — ไม่มี dependency)*
   - Start Command: `node server/index.js`
4. Render จะให้ URL มา เช่น `https://kplus-first-jobber.onrender.com`

> เซิร์ฟเวอร์อ่านพอร์ตจาก `process.env.PORT` อยู่แล้ว จึงใช้กับ Render / Railway / Fly.io ได้ทันที
> และควรตั้ง environment variable `ADMIN_PASSWORD` เป็นรหัสของตัวเองก่อนเปิดสาธารณะ
