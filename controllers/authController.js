const db = require('../db/mySql');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

exports.register = async (req, res) => {
  const { username, email, password } = req.body;
  if (!username || !email || !password)
    return res.status(400).json({ message: 'ข้อมูลไม่ครบ' });

  const [existing] = await db.query('SELECT id FROM users WHERE email = ?', [email]);
  if (existing.length > 0)
    return res.status(400).json({ message: 'อีเมลนี้ถูกใช้แล้ว' });

  const hashed = await bcrypt.hash(password, 10);
  await db.query('INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)', [username, email, hashed]);

  res.json({ message: 'สมัครสมาชิกสำเร็จ' });
};

exports.login = async (req, res) => {
  const { email, password } = req.body;
  const [rows] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
  if (rows.length === 0)
    return res.status(400).json({ message: 'ไม่พบบัญชีนี้' });

  const user = rows[0];
  const match = await bcrypt.compare(password, user.password_hash);
  if (!match)
    return res.status(401).json({ message: 'รหัสผ่านไม่ถูกต้อง' });

  const token = jwt.sign({ id: user.id, username: user.username }, process.env.JWT_SECRET, { expiresIn: '1d' });
  res.json({ message: 'เข้าสู่ระบบสำเร็จ', token });
};