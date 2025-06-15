const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require('socket.io');
const io = new Server(server);
const path = require('path');
require('dotenv').config();

const authRoutes = require('./routes/auth');

app.use(express.static(path.join(__dirname, 'donbid-main')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// เส้นทางอัปโหลดไฟล์รูป
// app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Auth API
app.use('/api/auth', authRoutes);

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'donbid-main', 'content', 'main.html'));
});

io.on('connection', socket => {
  console.log('🔗 Client connected');
});

server.listen(3000, () => {
  console.log('✅ Server started on http://localhost:3000');
});
