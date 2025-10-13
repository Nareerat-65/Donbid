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

// ✅ ดึงสินค้าที่ user ลงขาย
router.get('/my-sell-products', auth, async (req, res) => {
  try {
    const userId = req.user.id;

    const [rows] = await db.query(`
      SELECT 
        p.id AS product_id,
        p.name,
        p.description,
        p.category,
        p.start_price,
        p.start_time,
        p.end_time,
        p.status,
        ar.final_price,
        ar.closed_at,
        u.username AS winner_username,
        up.full_name AS winner_name,
        up.phone AS winner_phone,
        up.address AS winner_address
      FROM products p
      LEFT JOIN auction_results ar ON p.id = ar.product_id
      LEFT JOIN users u ON ar.winner_user_id = u.id
      LEFT JOIN user_profiles up ON u.id = up.user_id
      WHERE p.created_by = ?
      ORDER BY p.end_time DESC
    `, [userId]);

    // ✅ ดึงรูปของสินค้า
    const productsWithImages = await Promise.all(
      rows.map(async (product) => {
        const [images] = await db.query(
          `SELECT image_path FROM product_images WHERE product_id = ?`,
          [product.product_id]
        );
        return {
          ...product,
          images: images.map(img => "/uploads/" + img.image_path),
        };
      })
    );

    res.json(productsWithImages);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "ไม่สามารถโหลดสินค้าที่ขายได้" });
  }
});

// ✅ GET ดึงข้อมูล
router.get('/address', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const [rows] = await db.query(
      `SELECT full_name, phone, address FROM user_profiles WHERE user_id = ?`,
      [userId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: "ไม่พบข้อมูลที่อยู่ของผู้ใช้" });
    }

    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "ไม่สามารถโหลดข้อมูลได้" });
  }
});

// ✅ PUT บันทึกเฉพาะที่อยู่
router.put('/address', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { address } = req.body;

    await db.query(
      `UPDATE user_profiles 
       SET address = ?, updated_at = NOW()
       WHERE user_id = ?`,
      [address, userId]
    );

    res.json({ message: "บันทึกที่อยู่เรียบร้อยแล้ว" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "ไม่สามารถบันทึกข้อมูลได้" });
  }
});

module.exports = router;