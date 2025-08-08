const express = require('express');
const router = express.Router();
const db = require('../utils/db');
const authMiddleware = require('../middlewares/auth'); // ต้องมี middleware ตรวจ token

// เพิ่มสินค้าใหม่
const upload = require('../middlewares/upload');

router.post(
  '/',
  authMiddleware,
  upload.array('images', 5), // <-- รองรับหลายไฟล์ชื่อ images[]
  async (req, res) => {
    const user = req.user;
    const { name, description, start_price, start_time, end_time } = req.body;

    if (user.role !== 'seller') return res.status(403).json({ message: 'เฉพาะผู้ขายเท่านั้นที่เพิ่มสินค้าได้' });

    if (!name || !description || !start_price || !start_time || !end_time)
      return res.status(400).json({ message: 'กรุณากรอกข้อมูลให้ครบถ้วน' });

    const conn = await db.getConnection();

    try {
      await conn.beginTransaction();

      const [result] = await conn.query(
        `INSERT INTO products (name, description, start_price, start_time, end_time, status, created_by)
         VALUES (?, ?, ?, ?, ?, 'upcoming', ?)`,
        [name, description, start_price, start_time, end_time, user.id]
      );

      const productId = result.insertId;

      if (req.files && req.files.length > 0) {
        const values = req.files.map(file => [productId, file.filename]);
        await conn.query(
          `INSERT INTO product_images (product_id, image_path) VALUES ?`,
          [values]
        );
      }

      await conn.commit();
      res.json({ message: 'เพิ่มสินค้าสำเร็จ' });
    } catch (err) {
      await conn.rollback();
      console.error(err);
      res.status(500).json({ message: 'เกิดข้อผิดพลาดในการเพิ่มสินค้า' });
    } finally {
      conn.release();
    }
  }
);


router.get('/', async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT 
        p.*, 
        COALESCE(
          (SELECT MAX(b.bid_price) FROM bids b WHERE b.product_id = p.id),
          p.start_price
        ) AS current_price
      FROM products p
      WHERE p.status = 'upcoming'
      ORDER BY p.start_time DESC
      LIMIT 10
    `);

    // 🔁 ดึงรูปภาพของแต่ละสินค้า
    const productsWithImages = await Promise.all(rows.map(async (product) => {
      const [images] = await db.query(
        `SELECT image_path FROM product_images WHERE product_id = ?`,
        [product.id]
      );
      return {
        ...product,
        images: images.map(img => img.image_path)
      };
    }));
    res.json(productsWithImages);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' });
  }
});


// products.js (หรือไฟล์ router ที่ดูแล endpoint /api/products/:id)
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const [rows] = await db.query(`
      SELECT 
        p.*, 
        u.username AS seller_username
      FROM products p
      JOIN users u ON p.created_by = u.id
      WHERE p.id = ?
    `, [id]);

    if (rows.length === 0) {
      return res.status(404).json({ error: 'ไม่พบสินค้า' });
    }

    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'เกิดข้อผิดพลาด' });
  }
});


module.exports = router;

