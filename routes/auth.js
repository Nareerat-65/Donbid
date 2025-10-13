const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const db = require('../utils/db');

const router = express.Router();

// ตั้งค่า multer สำหรับอัปโหลด avatar
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/'); // ไปยัง /uploads
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    const unique = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `avatar-${unique}${ext}`);
  }
});
const upload = multer({ storage });

// CHECK DUPLICATE EMAIL OR USERNAME
router.post('/check', async (req, res) => {
  const { username, email } = req.body;

  try {
    if (!username && !email)
      return res.status(400).json({ message: 'กรุณาระบุ username หรือ email' });

    const [existing] = await db.query(
      'SELECT username, email FROM users WHERE username = ? OR email = ?',
      [username, email]
    );

    if (existing.length > 0) {
      const conflict = {};
      if (existing[0].username === username) conflict.username = true;
      if (existing[0].email === email) conflict.email = true;
      return res.status(200).json({ exists: true, conflict });
    }

    res.status(200).json({ exists: false });
  } catch (err) {
    console.error('Check duplicate error:', err);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการตรวจสอบ' });
  }
});


// REGISTER
router.post('/register', upload.single('avatar'), async (req, res) => {
  const {
    username, email, password,
    full_name, gender, birthdate, phone
  } = req.body;

  const avatar_url = req.file ? `/uploads/${req.file.filename}` : null;

  try {
    const [existing] = await db.query(
      'SELECT * FROM users WHERE email = ? OR username = ?',
      [email, username]
    );
    if (existing.length > 0)
      return res.status(400).json({ message: 'อีเมลหรือชื่อผู้ใช้ซ้ำ' });

    const hashedPassword = await bcrypt.hash(password, 10);

    const [userResult] = await db.query(
      'INSERT INTO users (username, email, password_hash, role, is_active) VALUES (?, ?, ?, ?, 1)',
      [username, email, hashedPassword, 'bidder']
    );

    const userId = userResult.insertId;

    await db.query(
      `INSERT INTO user_profiles 
        (user_id, full_name, gender, birthdate, phone, avatar_url)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [userId, full_name, gender, birthdate, phone, avatar_url]
    );

    // หลังบันทึก user profile แล้ว ให้สร้าง user_wallet ด้วยยอดเริ่มต้น 0.00
    await db.query(
      'INSERT INTO user_wallets (user_id, coin_balance) VALUES (?, ?)',
      [userId, 0.00]
    );


    res.status(201).json({ message: 'สมัครสมาชิกสำเร็จ', userId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// LOGIN
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  console.log('Login attempt:', { email });

  try {
    const [users] = await db.query(
      'SELECT * FROM users WHERE email = ?',
      [email]
    );

    if (users.length === 0)
      return res.status(400).json({ message: 'ไม่พบผู้ใช้งาน' });

    const user = users[0];
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match)
      return res.status(401).json({ message: 'รหัสผ่านไม่ถูกต้อง' });

    const [walletRows] = await db.query(
      'SELECT coin_balance FROM user_wallets WHERE user_id = ?',
      [user.id]
    );
    const coinBalance = walletRows.length > 0 ? walletRows[0].coin_balance : 0.00;

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role, email: user.email, coin: coinBalance },
      process.env.JWT_SECRET,
      { expiresIn: '1d' }
    );

    res.status(200).json({ message: 'เข้าสู่ระบบสำเร็จ', token });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: err.message });
  }
});

// CHANGE ROLE TO SELLER
const authMiddleware = require('../middlewares/auth');

router.post('/user/upgrade-role', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;

    // อัปเดต role ในฐานข้อมูล
    await db.query("UPDATE users SET role = 'seller' WHERE id = ?", [userId]);

    // ดึงข้อมูลผู้ใช้ที่อัปเดตมาใหม่
    const [updatedUser] = await db.query("SELECT * FROM users WHERE id = ?", [userId]);

    const token = jwt.sign({
      id: updatedUser[0].id,
      username: updatedUser[0].username,
      email: updatedUser[0].email,
      role: updatedUser[0].role
    }, process.env.JWT_SECRET, { expiresIn: '1d' });

    res.json({ message: 'อัปเกรดเป็นผู้ขายแล้ว', token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการอัปเกรด' });
  }
});


module.exports = router;
