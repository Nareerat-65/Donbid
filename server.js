const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require('socket.io');
const io = new Server(server);
const path = require('path');
const authMiddleware = require('./middlewares/auth');
const axios = require('axios'); // เพิ่ม axios สำหรับเรียก Gemini API
const sdk = require('microsoft-cognitiveservices-speech-sdk');
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
