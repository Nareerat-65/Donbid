// server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// เสิร์ฟ static content เดิม (HTML/CSS/JS)
app.use(express.static(path.join(__dirname, 'Donbid-main')));

// WebSocket
io.on('connection', socket => {
  console.log('🔗 Client connected');
  socket.on('bid', data => {
    io.emit('new-bid', data); // Broadcast
  });
});

server.listen(3000, () => {
  console.log('✅ Server running: http://localhost:3000/content/main.html');
});
