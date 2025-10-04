const express = require('express');
const router = express.Router();
const db = require('../utils/db');
const auth = require('../middlewares/auth');

// ดึงสินค้าที่ user ชนะ
router.get('/', auth, async (req, res) => {
  try {
    const userId = req.user.id;

    const [rows] = await db.query(`
      SELECT 
        ar.id AS result_id,
        p.id AS product_id,
        p.name,
        p.description,
        ar.final_price,
        ar.closed_at,
        pi.image_path
      FROM auction_results ar
      JOIN products p ON ar.product_id = p.id
      LEFT JOIN product_images pi ON p.id = pi.product_id
      WHERE ar.winner_user_id = ?
      ORDER BY ar.closed_at DESC
    `, [userId]);

    // รวมรูปภาพเป็น array ต่อสินค้า
    const productsWithImages = rows.reduce((acc, row) => {
      let existing = acc.find(p => p.product_id === row.product_id);
      if (!existing) {
        existing = {
          result_id: row.result_id,
          product_id: row.product_id,
          name: row.name,
          description: row.description,
          final_price: row.final_price,
          closed_at: row.closed_at,
          images: [],
        };
        acc.push(existing);
      }
      if (row.image_path) {
        existing.images.push('/uploads/' + row.image_path);
      }
      return acc;
    }, []);

    res.json(productsWithImages);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'เกิดข้อผิดพลาด' });
  }
});

module.exports = router;