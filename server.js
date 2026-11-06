const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.json());

// วาง Webhook URL ใหม่ของคุณที่สร้างไว้ใน Discord ตรงนี้ (จะไม่มีใครเห็นจากภายนอก)
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL || "ใส่_WEBHOOK_URL_ใหม่ตรงนี้";

// ตัวแปรจำไว้ว่าใครเคยส่งแจ้งเตือนเข้า Discord แล้วบ้าง เพื่อไม่ให้สแปมข้อความซ้ำ
const activeSessions = new Set();

// -------------------------------------------------------------
// Endpoint 1: สำหรับรับ Heartbeat (ส่งทุก 30 วิ ตามระบบเดิมของคุณ)
// -------------------------------------------------------------
app.post('/heartbeat', async (req, res) => {
    try {
        const { username, userId, executor, device, placeId, ping, fps } = req.body;

        // ถ้ายังไม่เคยส่งการ์ดแจ้งเตือนสำหรับผู้ใช้คนนี้ ให้ส่งเข้า Discord 1 ครั้ง
        if (userId && !activeSessions.has(userId)) {
            activeSessions.add(userId);

            // ส่งข้อมูลแจ้งเตือนเข้า Discord Webhook
            await axios.post(DISCORD_WEBHOOK_URL, {
                embeds: [
                    {
                        title: "🚀 มีผู้ใช้งานเปิดสคริปต์!",
                        color: 3447003,
                        fields: [
                            { name: "👤 ผู้เล่น", value: `${username} (ID: ${userId})`, inline: true },
                            { name: "📱 อุปกรณ์", value: `${device || 'Unknown'}`, inline: true },
                            { name: "⚙️ ตัวรัน", value: `${executor || 'Unknown'}`, inline: true },
                            { name: "🗺️ Place ID", value: `${placeId || 'Unknown'}`, inline: true },
                            { name: "📊 ประสิทธิภาพ", value: `Ping: ${ping || 0}ms | FPS: ${fps || 0}`, inline: true }
                        ],
                        footer: { text: "Fast-Hub Logger System" },
                        timestamp: new Date().toISOString()
                    }
                ]
            }).catch(err => console.error("Discord send failed:", err.message));
        }

        // ตอบกลับสคริปต์ว่าได้รับสัญญาณเรียบร้อย
        res.status(200).json({ status: "alive" });
    } catch (error) {
        console.error("Error processing heartbeat:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// เคลียร์ประวัติผู้ใช้ทุก 10 นาที เพื่อให้สามารถตรวจจับการเปิดใหม่ได้ในรอบถัดไป
setInterval(() => {
    activeSessions.clear();
}, 10 * 60 * 1000);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
