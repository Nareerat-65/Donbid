const express = require('express');
const router = express.Router();
const db = require('../utils/db');
const authMiddleware = require('../middlewares/auth'); // ต้องมี middleware ตรวจ token

// เพิ่มสินค้าใหม่
router.post('/', authMiddleware, async (req, res) => {
  const user = req.user;

  if (user.role !== 'seller') {
    return res.status(403).json({ message: 'เฉพาะผู้ขายเท่านั้นที่เพิ่มสินค้าได้' });
  }

  const { name, description, start_price, start_time, end_time } = req.body;

  if (!name || !description || !start_price || !start_time || !end_time) {
    return res.status(400).json({ message: 'กรุณากรอกข้อมูลให้ครบถ้วน' });
  }

  try {
    await db.query(`
      INSERT INTO products (name, description, start_price, start_time, end_time, status, created_by)
      VALUES (?, ?, ?, ?, ?, 'upcoming', ?)
    `, [name, description, start_price, start_time, end_time, user.id]);

    res.json({ message: 'เพิ่มสินค้าสำเร็จ' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'เกิดข้อผิดพลาดในระบบ' });
  }
});

router.get('/', async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT * FROM products
      WHERE status = 'upcoming'
      ORDER BY start_time DESC
      LIMIT 10
    `);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' });
  }
});

module.exports = router;
