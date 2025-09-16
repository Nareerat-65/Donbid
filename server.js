const express = require("express");
const app = express();
const http = require("http");
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);
const path = require("path");
const cron = require("node-cron");
const db = require("./utils/db");
const axios = require("axios");
require("dotenv").config();

// ✅ Middleware ก่อน static
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ✅ Routes
const authRoutes = require("./routes/auth");
const productRouter = require("./routes/products")(io);
const bidsRoute = require("./routes/bids");
const coinRoutes = require("./routes/coins");
const confirmRouter = require("./routes/confirm");
const aiRouter = require("./routes/ai");

app.use("/api/auth", authRoutes);
app.use("/api/products", productRouter);
app.use("/api/bids", bidsRoute);
app.use("/api/coins", coinRoutes);
app.use("/api/confirm", confirmRouter);
app.use("/api/ai", aiRouter);

// ✅ static ควรอยู่ท้ายสุด (หลัง API)
app.use(express.static(path.join(__dirname, "donbid-main")));
app.get("/favicon.ico", (req, res) => res.status(204)); // no content
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "donbid-main", "content", "main.html"));
});

cron.schedule("* * * * *", async () => {
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
        "SELECT user_id, bid_price FROM bids WHERE product_id = ? ORDER BY bid_price DESC, created_at DESC LIMIT 1",
        [p.id]
      );

      if (bids.length > 0) {
        await db.query(
          "INSERT INTO auction_results (product_id, winner_user_id, final_price, closed_at) VALUES (?, ?, ?, ?)",
          [p.id, bids[0].user_id, bids[0].bid_price, now]
        );
      }

      await db.query('UPDATE products SET status = "ended" WHERE id = ?', [
        p.id,
      ]);
    }

    console.log(`[CRON] อัปเดตสถานะสินค้าเรียบร้อย ${now}`);
  } catch (err) {
    console.error("❌ CRON error:", err);
  }
});

async function callAIAndBroadcast(productId, userMsg, eventName) {
  try {
    // เรียก API ที่มีอยู่แล้ว (routes/ai.js)
    const response = await axios.post(`http://localhost:3000/api/ai/chat`, {
      message: userMsg,
      product_id: productId,
    });

    const reply = response.data.reply;

    // ✅ broadcast ให้ทุก client ในห้องนี้
    io.to(productId).emit(eventName, { productId, message: reply });

    console.log(`👉 AI Broadcast (${eventName}): ${reply}`);
  } catch (err) {
    console.error("❌ AI call failed:", err.response?.data || err.message);
  }
}

// เก็บผู้เข้าร่วมตาม productId
const participants = {};
const welcomedProducts = {};
const auctionEndTimes = {};
const idleTimers = {};

io.on("connection", (socket) => {
  console.log("🔗 Client connected");

  // เวลา user เข้าร่วมประมูล
  socket.on("join auction", async ({ productId, userId, username }) => {
    socket.join(productId);

    if (!participants[productId]) {
      participants[productId] = [];
    }

    // ป้องกันซ้ำ
    if (!participants[productId].some((u) => u.userId === userId)) {
      participants[productId].push({ id: socket.id, userId, username });
    }

    if (!welcomedProducts[productId]) {
      welcomedProducts[productId] = true; // กันซ้ำ

      // ดึงข้อมูลสินค้าเพื่อสร้าง prompt
      const [rows] = await db.query("SELECT * FROM products WHERE id = ?", [
        productId,
      ]);
      const product = rows[0];

      const welcomePrompt = `คุณคือผู้ดำเนินการประมูล ช่วยกล่าวต้อนรับผู้เข้าร่วมและแนะนำสินค้าแบบกระชับ ไม่พูดถึง AI หรือระบบและไม่มีสัญลักษณ์พิเศษ:\n
        ชื่อสินค้า: ${product.name}\n
        รายละเอียด: ${product.description}\n
        ราคาเริ่มต้น: ${product.start_price} บาท`;

      callAIAndBroadcast(productId, welcomePrompt, "auction welcome");

      resetIdleTimer(productId);
    }

    if (!auctionEndTimes[productId]) {
      auctionEndTimes[productId] = Date.now() + 120 * 1000;
    }

    // ส่งรายชื่อกลับไปให้ทุก client ใน auction เดียวกัน
    io.to(productId).emit("participants update", {
      productId,
      participants: participants[productId],
    });

    socket.emit("auction endtime", {
      productId,
      endTime: auctionEndTimes[productId],
      reason: "join",
    });
  });

  socket.on("bid placed", (data) => {
    const { productId, username, bidAmount } = data;

    // ต่อเวลา 60 วิ
    auctionEndTimes[productId] = Date.now() + 60 * 1000;

    io.to(productId).emit("auction endtime", {
      productId,
      endTime: auctionEndTimes[productId],
      reason: "bid",
    });

    io.to(productId).emit("new bid", data); // update UI

    const promptBid = `แจ้งให้ทุกคนทราบแบบไม่ยาวมาก ${username} เพิ่งเสนอราคา ${bidAmount} บาท สำหรับสินค้านี้ แบบผู้ดำเนินการประมูลพร้อมกระตุ้นให้ผู้เข้าร่วมประมูลคนอื่น ๆ รู้สึกตื่นเต้นและอยากเข้าร่วมการประมูลนี้ ไม่ต้องมีสัญลักษณ์พิเศษ`;
    // AI ตอบ message bid
    callAIAndBroadcast(productId, promptBid, "ai message"); // ✅ ส่งเฉพาะห้องนี้

    // 🛠 รีเซ็ต idle timer
    resetIdleTimer(productId);
  });

  // เวลา user ออกจากห้อง (disconnect)
  socket.on("disconnect", () => {
    for (const pid in participants) {
      const before = participants[pid].length;
      participants[pid] = participants[pid].filter((u) => u.id !== socket.id);

      if (participants[pid].length !== before) {
        io.to(pid).emit("participants update", {
          productId: pid,
          participants: participants[pid],
        });
      }
    }
    console.log("❌ Client disconnected", socket.id);
  });
});

async function sendIdleMessage(productId) {
  try {
    // ดึงข้อมูลสินค้า
    const [products] = await db.query("SELECT * FROM products WHERE id = ?", [
      productId,
    ]);
    const product = products[0];
    if (!product) return;

    // ดึงราคาสูงสุดปัจจุบัน
    const [bids] = await db.query(
      "SELECT MAX(bid_price) AS highest FROM bids WHERE product_id = ?",
      [productId]
    );
    const highestBid = bids[0] || { highest: null };

    const prompt =
      "คุณคือผู้ดำเนินการประมูลที่สุภาพ ช่วยกระตุ้นผู้ใช้อยากเสนอราคาด้วยประโยคที่สั้นและกระชับ ไม่พูดถึง AI หรือระบบและไม่มีสัญลักษณ์พิเศษ:\n" +
      `ชื่อสินค้า: ${product.name}\n` +
      `รายละเอียด: ${product.description}\n` +
      `ราคาเริ่มต้น: ${product.start_price} บาท\n` +
      `ราคาปัจจุบัน: ${highestBid.highest || product.start_price} บาท`;

    await callAIAndBroadcast(productId, prompt, "ai message");
  } catch (err) {
    console.error("sendIdleMessage error:", err);
  }
}

async function sendCloseMessage(productId) {
  try {
    // ดึงผู้ชนะล่าสุด
    const [results] = await db.query(
      "SELECT r.final_price, u.username AS winner_name, r.winner_user_id FROM auction_results r JOIN users u ON r.winner_user_id = u.id WHERE r.product_id = ? ORDER BY r.closed_at DESC LIMIT 1",
      [productId]
    );
    const result = results[0];

    if (!result) {
      await callAIAndBroadcast(
        productId,
        "การประมูลสินค้านี้ปิดแล้วค่ะ ไม่มีผู้ชนะ",
        "ai message"
      );
      return;
    }

    const { winner_name, final_price } = result;

    const prompt = `ประกาศให้ผู้ใช้อื่นทราบว่า"ขอแสดงความยินดีกับ ${winner_name} ที่ชนะการประมูลสินค้านี้ในราคา ${final_price} บาท!" แบบผู้ดำเนินการประมูลที่สุภาพ ไม่พูดถึง AI หรือระบบและไม่มีสัญลักษณ์พิเศษ`;

    await callAIAndBroadcast(productId, prompt, "ai message");
  } catch (err) {
    console.error("sendCloseMessage error:", err);
  }
}
function resetIdleTimer(productId) {
  if (participants[productId].idleTimer) {
    clearTimeout(participants[productId].idleTimer);
  }

  participants[productId].idleTimer = setTimeout(() => {
    sendIdleMessage(productId);
  }, 30 * 1000);
}


setInterval(async () => {
  const now = Date.now();
  for (const productId in auctionEndTimes) {
    const endTime = auctionEndTimes[productId];

    // ⏳ ประมูลหมดเวลา → Close
    if (now >= endTime) {
      await sendCloseMessage(productId);
      delete auctionEndTimes[productId];
      delete participants[productId];
      delete welcomedProducts[productId];
      continue;
    }
  }
}, 3000);

server.listen(3000, () => {
  console.log("✅ Server started on http://localhost:3000");
});
