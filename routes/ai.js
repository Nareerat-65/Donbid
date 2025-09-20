const express = require('express');
const router = express.Router();
const db = require('../utils/db');
const auth = require('../middlewares/auth');
const axios = require('axios'); // เพิ่ม axios สำหรับเรียก Gemini API
const sdk = require('microsoft-cognitiveservices-speech-sdk');

router.post('/chat', async (req, res) => {
  const userMsg = req.body.message;
  const productId = req.body.product_id;
  const type = req.body.type;

  console.log("👉 req.body =", req.body);
  console.log("👉 userMsg =", userMsg);
  console.log("👉 productId =", productId);
  console.log("👉 type =", type);

  if (!userMsg) return res.status(400).json({ error: 'Missing message' });

  // ✅ ตรวจสอบว่า API Key ถูกตั้งค่าหรือไม่
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'AI error', detail: 'Gemini API key is not set in .env' });
  }

  try {
    // 🔍 ถ้า type = welcome ให้เช็คก่อนว่ามีแล้วหรือยัง
    if (type === "welcome") {
      const [rows] = await db.query(
        "SELECT id FROM auction_logs WHERE product_id = ? AND type = 'welcome' LIMIT 1",
        [productId]
      );
      if (rows.length > 0) {
        return res.json({ reply: rows[0].message }); // ส่งข้อความเดิมกลับไป ไม่สร้างใหม่
      }
    }

    // 🧠 สร้างข้อความจาก Gemini
    const response = await axios.post(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent",
      { contents: [{ parts: [{ text: userMsg }] }] },
      { headers: { "Content-Type": "application/json" }, params: { key: apiKey } }
    );

    const reply = response.data?.candidates?.[0]?.content?.parts?.[0]?.text || "ขออภัย AI ไม่สามารถตอบได้";

    if (type === "welcome" || type === "bid") {
      await db.query(
        "INSERT INTO auction_logs (product_id, message, type, created_at) VALUES (?, ?, ?, NOW())",
        [parseInt(productId), reply, type]
      );
    }

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

router.get('/:productId/logs', async (req, res) => {
  const { productId } = req.params;

  try {
    const [rows] = await db.query(
      'SELECT message, created_at FROM auction_logs WHERE product_id = ? ORDER BY created_at ASC',
      [productId]
    );
    res.json(rows);
  } catch (err) {
    console.error("Error fetching AI history:", err);
    res.status(500).json({ error: 'Failed to fetch AI history' });
  }
});

// ✅ TTS Endpoint    
router.post('/tts', async (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: 'Missing text' });

  const speechConfig = sdk.SpeechConfig.fromSubscription(
    process.env.AZURE_SPEECH_KEY,
    process.env.AZURE_SPEECH_REGION
  );

  speechConfig.speechSynthesisVoiceName = "th-TH-PremwadeeNeural"; // เสียงหญิง

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
module.exports = router;