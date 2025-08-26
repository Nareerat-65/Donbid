const express = require('express');
const router = express.Router();
const db = require('../utils/db');
const auth = require('../middlewares/auth');

router.get('/:id', async (req, res) => {
    const id = req.params.id; // แทน req.query.id
    try {
        const [rows] = await db.query( 
            `SELECT 
                ar.*,
                p.name,
                p.category,
                p.description,
                p.start_price,
                p.start_time,
                seller.username AS seller_name,
                u.username AS winner_name
            FROM auction_results ar
            JOIN products p ON ar.product_id = p.id
            JOIN users seller ON p.created_by = seller.id
            LEFT JOIN users u ON ar.winner_user_id = u.id
            WHERE ar.product_id = ?`,
            [id]
        );
        
        if (rows.length === 0) {
            return res.status(404).json({ error: 'ไม่พบรายการประมูล' });
        }
        res.json(rows[0]);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'เกิดข้อผิดพลาด' });
    }
});
module.exports = router;