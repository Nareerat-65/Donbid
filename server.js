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

app.use('/api/auth', authRoutes);
app.use('/api/products', productRouter);
app.use('/api/bids', bidsRoute);
app.use('/api/coins', coinRoutes);


// ✅ static ควรอยู่ท้ายสุด (หลัง API)
app.use(express.static(path.join(__dirname, 'donbid-main')));

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'donbid-main', 'content', 'main.html'));
});

// ✅ AI Chat Route
app.post('/api/ai/chat', async (req, res) => {
  const userMsg = req.body.message;
  if (!userMsg) return res.status(400).json({ error: 'Missing message' });

  // ✅ ตรวจสอบว่า API Key ถูกตั้งค่าหรือไม่
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'AI error', detail: 'Gemini API key is not set in .env' });
  }

  try {
    const response = await axios.post(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
      {
        contents: [{ parts: [{ text: userMsg }] }]
      },
      {
        headers: { 'Content-Type': 'application/json' },
        params: { key: apiKey }
      }
    );
    const reply = response.data?.candidates?.[0]?.content?.parts?.[0]?.text || 'ขออภัย AI ไม่สามารถตอบได้';
    res.json({ reply });
  } catch (err) {
    // ✅ แสดงรายละเอียด error จาก Gemini API
    let detail = err.message;
    if (err.response && err.response.data) {
      detail = JSON.stringify(err.response.data);
    }
    res.status(500).json({ error: 'AI error', detail });
  }
});

// ✅ TTS Endpoint
app.post('/api/ai/tts', async (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: 'Missing text' });

  const speechConfig = sdk.SpeechConfig.fromSubscription(
    process.env.AZURE_SPEECH_KEY,
    process.env.AZURE_SPEECH_REGION
  );

  // ตั้งค่าเสียงภาษาไทย (เลือกได้จากเสียงด้านล่าง)
  speechConfig.speechSynthesisVoiceName = "th-TH-PremwadeeNeural"; // เสียงหญิง
  // หรือ "th-TH-NiwatNeural" สำหรับเสียงชาย

  // ใน server.js ก่อนสร้าง synthesizer
  speechConfig.speechSynthesisOutputFormat = sdk.SpeechSynthesisOutputFormat.Audio16Khz16KBitRateMonoMp3;
  try {
    const synthesizer = new sdk.SpeechSynthesizer(speechConfig);
    synthesizer.speakTextAsync(text, result => {
      if (result) {
        // สร้าง Blob แบบ Uint8Array
        const audioBuffer = Buffer.from(result.audioData); // สำหรับ Node.js
        res.set('Content-Type', 'audio/mpeg');
        res.send(audioBuffer);
      } else {
        res.status(500).json({ error: 'TTS synthesis failed' });
      }
      synthesizer.close();
    }, error => {
      console.error("TTS Error:", error);
      res.status(500).json({ error: 'TTS error', detail: error });
      synthesizer.close();
    });

  } catch (err) {
    res.status(500).json({ error: 'TTS processing error', detail: err.message });
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
