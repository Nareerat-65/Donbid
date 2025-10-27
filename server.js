const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require('socket.io');
const io = new Server(server);
const path = require('path');
const cron = require('node-cron');
const db = require('./utils/db');
const axios = require("axios");
require('dotenv').config();


// ✅ Middleware ก่อน static
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ✅ Routes
const authRoutes = require('./routes/auth');
const productRouter = require('./routes/products')(io);
const bidsRoute = require('./routes/bids');
const coinRoutes = require('./routes/coins');
const profileRouter = require('./routes/profile');
const aiRouter = require('./routes/ai');

app.use('/api/auth', authRoutes);
app.use('/api/products', productRouter);
app.use('/api/bids', bidsRoute);
app.use('/api/coins', coinRoutes);
app.use('/api/profile', profileRouter);
app.use('/api/ai', aiRouter);


// ✅ static ควรอยู่ท้ายสุด (หลัง API)
app.use(express.static(path.join(__dirname, 'donbid-main')));
app.get('/favicon.ico', (req, res) => res.status(204));
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


const idleTimers = {}; // บันทึก idle timer แยกตามสินค้า

function resetIdleAI(io, productId, product) {
  if (idleTimers[productId]) clearTimeout(idleTimers[productId]);

  idleTimers[productId] = setTimeout(async () => {
    try {
      const [rows] = await db.query(
        'SELECT MAX(bid_price) AS highest FROM bids WHERE product_id = ?',
        [productId]
      );
      const highest = rows[0]?.highest || product.start_price;

      const prompt =
        "คุณคือผู้ดำเนินการประมูลที่สุภาพ ช่วยกระตุ้นผู้ใช้อยากเสนอราคาด้วยประโยคที่สั้นและกระชับ ไม่พูดถึง AI หรือระบบและไม่มีสัญลักษณ์พิเศษ:\n" +
        `ชื่อสินค้า: ${product.name}\n` +
        `รายละเอียด: ${product.description}\n` +
        `ราคาเริ่มต้น: ${product.start_price} บาท\n` +
        `ราคาปัจจุบัน: ${highest} บาท`;

      const aiRes = await axios.post("http://localhost:3000/api/ai/chat", {
        message: prompt,
        product_id: productId,
        type: "idle"
      });

      const aiMsg = aiRes.data.reply;
      io.to(productId).emit("ai message", { productId, text: aiMsg });
    } catch (err) {
      console.error("❌ Idle AI Error:", err.message);
    } finally {
      resetIdleAI(io, productId, product); // ตั้งรอบต่อไป
    }
  }, 30000); // 30 วินาที
}
const lastEmitAt = {}; // productId -> ts
function canEmit(productId,gap=800){
  const now=Date.now();
  if(!lastEmitAt[productId] || now-lastEmitAt[productId]>gap){ lastEmitAt[productId]=now; return true; }
  return false;
}

// เก็บผู้เข้าร่วมตาม productId
const participants = {};
const auctionEndTimes = {};
const highestCache = {}; 

io.on('connection', socket => {
  console.log('🔗 Client connected');

  // เวลา user เข้าร่วมประมูล
  socket.on('join auction', async ({ productId, userId, username }) => {
    socket.join(productId);
    if (!participants[productId]) participants[productId] = [];

    // ป้องกันซ้ำ
    if (!participants[productId].some(u => u.userId === userId)) {
      participants[productId].push({ id: socket.id, userId, username });
    }

    // ส่งรายชื่อกลับไปให้ทุก client ใน auction เดียวกัน
    io.to(productId).emit('participants update', {
      productId,
      participants: participants[productId]
    });
     if (!auctionEndTimes[productId]) {
      auctionEndTimes[productId] = Date.now() + 120 * 1000; // เริ่มนับเวลา 2 นาที (ตัวอย่าง)
    }

     // ส่งเวลาให้ทุกคน
    socket.emit("auction endtime", {
      productId,
      endTime: auctionEndTimes[productId],
      reason: "join"
    });
    if (!participants[productId].some(u => u.isWelcomed)) {
      participants[productId].forEach(u => (u.isWelcomed = true));
      try {
        const [products] = await db.query("SELECT * FROM products WHERE id = ?", [productId]);
        if (products.length === 0) return;

        const product = products[0];

        // 🟢 สร้างข้อความ prompt
        const prompt = `
        คุณคือผู้ดำเนินการประมูล ช่วยกล่าวต้อนรับผู้เข้าร่วมและแนะนำสินค้าแบบสุภาพ กระชับ 
        ไม่พูดถึง AI หรือระบบ และไม่ใส่สัญลักษณ์พิเศษ

        ชื่อสินค้า: ${product.name}
        รายละเอียด: ${product.description}
        ราคาเริ่มต้น: ${product.start_price} บาท
        `;
        const aiRes = await axios.post("http://localhost:3000/api/ai/chat", {
          message: prompt,
          product_id: productId,
          type: "welcome",
        });

        // ✅ ตรวจให้แน่ใจว่ามีข้อความตอบกลับจริง
        const aiText = aiRes.data?.reply?.trim?.() || "ยินดีต้อนรับทุกท่านเข้าสู่การประมูลครับ";

        if (aiText) {
          io.to(productId).emit("ai message", { productId, text: aiText });
          const [products] = await db.query("SELECT * FROM products WHERE id = ?", [productId]);
          if (products.length > 0) resetIdleAI(io, productId, products[0]); // ✅ เพิ่มบรรทัดนี้
        } else {
          console.warn("⚠️ [AI] ไม่มีข้อความตอบกลับจาก API (skip emit)");
        }

      } catch (err) {
        console.error("❌ Welcome AI Error:", err.message);
      }
    }

  });

  socket.on("bid placed", async (data) => {
    const { productId, username, bidAmount } = data;

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

    // broadcast ข้อมูลการ bid ใหม่
    io.to(productId).emit("new bid", data);
    highestCache[productId] = Math.max(highestCache[productId] || 0, bidAmount);

    if (canEmit(productId, 800)) {
      const aiRes = await axios.post("http://localhost:3000/api/ai/chat", {
        message: `แจ้งให้ทุกคนทราบแบบไม่ยาวมาก ${username} เพิ่งเสนอราคา ${bidAmount} บาท สำหรับสินค้านี้ แบบผู้ดำเนินการประมูลพร้อมกระตุ้นให้ผู้เข้าร่วมประมูลคนอื่น ๆ รู้สึกตื่นเต้นและอยากเข้าร่วมการประมูลนี้ ไม่ต้องมีสัญลักษณ์พิเศษ`,
        product_id: productId,
          type: "bid",
        });
        const aiMsg = aiRes.data.reply;
        io.to(productId).emit("ai message", { productId, text: aiMsg });
        const [products] = await db.query("SELECT * FROM products WHERE id = ?", [productId]);
        if (products.length > 0) resetIdleAI(io, productId, products[0]);
      
    } else{
      console.error("❌ AI Broadcast Error:", err.message);
    }
    
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
