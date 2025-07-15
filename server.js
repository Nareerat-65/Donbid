const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require('socket.io');
const io = new Server(server);
const path = require('path');
const authMiddleware = require('./middlewares/auth');
require('dotenv').config();

// ✅ Middleware ก่อน static
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ✅ Routes
const authRoutes = require('./routes/auth');
const productRouter = require('./routes/products');
const bidsRoute = require('./routes/bids');

app.use('/api/auth', authRoutes);
app.use('/api/products', productRouter);
app.use('/api/bids', bidsRoute);

// ✅ static ควรอยู่ท้ายสุด (หลัง API)
app.use(express.static(path.join(__dirname, 'donbid-main')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'donbid-main', 'content', 'main.html'));
});

io.on('connection', socket => {
  console.log('🔗 Client connected');
});

server.listen(3000, () => {
  console.log('✅ Server started on http://localhost:3000');
});
