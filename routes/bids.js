const express = require('express');
const router = express.Router();
const db = require('../utils/db');
const auth = require('../middlewares/auth');

// GET ราคาสูงสุดของสินค้า
router.get('/highest', async (req, res) => {
  const { product_id } = req.query;

  const [[row]] = await db.query(
    'SELECT MAX(bid_price) AS highest FROM bids WHERE product_id = ?',
    [product_id]
  );

  res.json({ highest: row.highest || 0 });
});

// POST เสนอราคา
router.post('/', auth, async (req, res) => {
  const { product_id, bid_price } = req.body;
  const user_id = req.user.id;

  try {
    const [[highestRow]] = await db.query(
      'SELECT MAX(bid_price) AS highest FROM bids WHERE product_id = ?',
      [product_id]
    );

    const currentHighest = highestRow.highest || 0;

    if (bid_price <= currentHighest) {
      return res.status(400).json({ message: 'ต้องเสนอราคาสูงกว่าราคาปัจจุบัน' });
    }

    const [[wallet]] = await db.query(
      'SELECT coin_balance FROM user_wallets WHERE user_id = ?',
      [user_id]
    );

    if (!wallet || wallet.coin_balance < bid_price) {
      return res.status(400).json({ message: 'ยอด coin ไม่พอ' });
    }

    await db.query(
      'INSERT INTO bids (product_id, user_id, bid_price) VALUES (?, ?, ?)',
      [product_id, user_id, bid_price]
    );

    res.json({ message: 'เสนอราคาสำเร็จ' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' });
  }
});

router.get('/history', async (req, res) => {
  const { product_id } = req.query;

  try {
    const [rows] = await db.query(`
      SELECT b.bid_price, b.created_at, u.username
      FROM bids b
      JOIN users u ON b.user_id = u.id
      WHERE b.product_id = ?
      ORDER BY b.created_at DESC
    `, [product_id]);

    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'เกิดข้อผิดพลาดในการดึงประวัติการเสนอราคา' });
  }
});


module.exports = router;
