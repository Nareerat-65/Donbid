const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require('socket.io');
const io = new Server(server);
const path = require('path');
const cron = require('node-cron');
const db = require('./utils/db');
require('dotenv').config();


// ✅ Middleware ก่อน static
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ✅ Routes
const authRoutes = require('./routes/auth');
const productRouter = require('./routes/products');
const bidsRoute = require('./routes/bids');
const coinRoutes = require('./routes/coins');
const confirmRouter = require('./routes/confirm');
const aiRouter = require('./routes/ai');

app.use('/api/auth', authRoutes);
app.use('/api/products', productRouter);
app.use('/api/bids', bidsRoute);
app.use('/api/coins', coinRoutes);
app.use('/api/confirm', confirmRouter);
app.use('/api/ai', aiRouter);


// ✅ static ควรอยู่ท้ายสุด (หลัง API)
app.use(express.static(path.join(__dirname, 'donbid-main')));

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'donbid-main', 'content', 'main.html'));
});

cron.schedule('* * * * *', async () => {
  const now = new Date();

  try {
    // ✅ อัปเดต upcoming → live
    await db.query(
      `UPDATE products 
       SET status = 'live' 
       WHERE status = 'upcoming' AND start_time <= ?`,
      [now]
    );

    // ✅ อัปเดต live → ended + บันทึกผล
    const [liveProducts] = await db.query(
      `SELECT id FROM products WHERE status = 'live' AND end_time <= ?`,
      [now]
    );

    for (const p of liveProducts) {
      const [bids] = await db.query(
        'SELECT user_id, bid_price FROM bids WHERE product_id = ? ORDER BY bid_price DESC, created_at DESC LIMIT 1',
        [p.id]
      );

      if (bids.length > 0) {
        await db.query(
          'INSERT INTO auction_results (product_id, winner_user_id, final_price, closed_at) VALUES (?, ?, ?, ?)',
          [p.id, bids[0].user_id, bids[0].bid_price, now]
        );
      }

      await db.query(
        'UPDATE products SET status = "ended" WHERE id = ?',
        [p.id]
      );
    }

    console.log(`[CRON] อัปเดตสถานะสินค้าเรียบร้อย ${now}`);
  } catch (err) {
    console.error('❌ CRON error:', err);
  }
});

io.on('connection', socket => {
  console.log('🔗 Client connected');

  // รับ event ประมูลจาก client แล้ว broadcast ให้ทุก client
  socket.on('bid placed', (data) => {
    // data: { productId, bidAmount, username }
    io.emit('new bid', data);
  });
});

server.listen(3000, () => {
  console.log('✅ Server started on http://localhost:3000');
});
