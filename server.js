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
const productRouter = require('./routes/products')(io);
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

// เก็บผู้เข้าร่วมตาม productId
const participants = {};
const auctionEndTimes = {};

io.on('connection', socket => {
  console.log('🔗 Client connected');

  // เวลา user เข้าร่วมประมูล
  socket.on('join auction', ({ productId, userId, username }) => {
    socket.join(productId);
    if (!participants[productId]) {
      participants[productId] = [];
    }

    // ป้องกันซ้ำ
    if (!participants[productId].some(u => u.userId === userId)) {
      participants[productId].push({ id: socket.id, userId, username });
    }

    if (!auctionEndTimes[productId]) {
      auctionEndTimes[productId] = Date.now() + 120 * 1000; // เริ่มนับเวลา 2 นาที (ตัวอย่าง)
    }

    // ส่งรายชื่อกลับไปให้ทุก client ใน auction เดียวกัน
    io.to(productId).emit('participants update', {
      productId,
      participants: participants[productId]
    });

    socket.emit("auction endtime", {
      productId,
      endTime: auctionEndTimes[productId],
      reason: "join"
    });
  });

  socket.on('bid placed', (data) => {
    const { productId } = data;

     const now = Date.now();
    const remaining = auctionEndTimes[productId] - now;

    // ✅ ถ้าเวลาน้อยกว่า 60 วิ → ต่อเวลาให้เหลือ 60 วิ
    if (remaining < 60 * 1000) {
      auctionEndTimes[productId] = now + 60 * 1000;

      io.to(productId).emit("auction endtime", {
        productId,
        endTime: auctionEndTimes[productId],
        reason: "bid-extend"
      });
    }
    io.to(productId).emit('new bid', data);
  });

  // เวลา user ออกจากห้อง (disconnect)
  socket.on('disconnect', () => {
    for (const pid in participants) {
      const before = participants[pid].length;
      participants[pid] = participants[pid].filter(u => u.id !== socket.id);

      if (participants[pid].length !== before) {
        io.to(pid).emit('participants update', {
          productId: pid,
          participants: participants[pid],
        });
      }
    }
    console.log('❌ Client disconnected', socket.id);
  });
});

server.listen(3000, () => {
  console.log('✅ Server started on http://localhost:3000');
});
