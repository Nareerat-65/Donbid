const express = require('express');
const router = express.Router();
const db = require('../utils/db');
const auth = require('../middlewares/auth');
const jwt = require('jsonwebtoken');

router.post('/topup', auth, async (req, res) => {
    const userId = req.user.id;
    const { amount } = req.body;

    if (!amount || isNaN(amount) || amount <= 0) {
        return res.status(400).json({ message: 'จำนวนเงินไม่ถูกต้อง' });
    }

    try {
        // เพิ่มยอด coin
        await db.query(
            'UPDATE user_wallets SET coin_balance = coin_balance + ? WHERE user_id = ?',
            [amount, userId]
        );

        // ดึงยอด coin ล่าสุด
        const [rows] = await db.query('SELECT coin_balance FROM user_wallets WHERE user_id = ?', [userId]);
        const newBalance = rows[0].coin_balance;

        // ดึงข้อมูลผู้ใช้จาก users table
        const [users] = await db.query('SELECT * FROM users WHERE id = ?', [userId]);
        const user = users[0];

        // สร้าง token ใหม่ที่อัปเดต coin แล้ว
        const token = jwt.sign({
            id: user.id,
            username: user.username,
            email: user.email,
            role: user.role,
            coin: newBalance
        }, process.env.JWT_SECRET, { expiresIn: '1d' });

        // ส่งกลับ token ใหม่และยอด coin ล่าสุด
        res.json({ message: 'เติมเงินสำเร็จ', coin_balance: newBalance, token });

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์' });
    }
});

// ใน routes/coins.js
router.get('/balance', auth, async (req, res) => {
  try {
    const userId = req.user.id;

    const [rows] = await db.execute(
      'SELECT coin_balance FROM user_wallets WHERE user_id = ?',
      [userId]
    );

    if (rows.length === 0) return res.status(404).json({ message: 'ไม่พบข้อมูลกระเป๋าเงิน' });

    res.json({ coin_balance: rows[0].coin_balance });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์' });
  }
});


module.exports = router;
