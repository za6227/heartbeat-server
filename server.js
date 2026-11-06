const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.json());

// Discord Webhook URL
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL || "https://discord.com/api/webhooks/1568136540549415005/f_LPZmmv_rM8TNxh_3oY9GWOLemfxYDzhrZqR01iNTfjnPav7ZjOahk_0mS1s10VPE31";

// ตัวแปรจำกัดการแจ้งเตือน เพื่อไม่ให้ยิงรัวซ้ำคนเดิม
const activeSessions = new Set();

// แก้ไขเพิ่ม /api/heartbeat ให้ตรงกับที่สคริปต์ Lua ส่งมา
app.post('/api/heartbeat', async (req, res) => {
    try {
        const { username, userId, executor, device, placeId, ping, fps } = req.body;

        // ส่งเข้า Discord เมื่อพบการเปิดใช้งานใหม่
        if (userId && !activeSessions.has(userId)) {
            activeSessions.add(userId);

            await axios.post(DISCORD_WEBHOOK_URL, {
                embeds: [
                    {
                        title: "🚀 มีผู้ใช้งานเปิดสคริปต์!",
                        color: 3447003,
                        fields: [
                            { name: "👤 ผู้เล่น", value: `${username || 'Unknown'} (ID: ${userId})`, inline: true },
                            { name: "📱 อุปกรณ์", value: `${device || 'Unknown'}`, inline: true },
                            { name: "⚙️ ตัวรัน", value: `${executor || 'Unknown'}`, inline: true },
                            { name: "🗺️ Place ID", value: `${placeId || 'Unknown'}`, inline: true },
                            { name: "📊 ประสิทธิภาพ", value: `Ping: ${ping || 0}ms | FPS: ${fps || 0}`, inline: true }
                        ],
                        footer: { text: "fAst Hub Logger System" },
                        timestamp: new Date().toISOString()
                    }
                ]
            }).catch(err => console.error("Discord send failed:", err.message));
        }

        res.status(200).json({ status: "alive" });
    } catch (error) {
        console.error("Error processing heartbeat:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// เคลียร์ประวัติทุก 10 นาที
setInterval(() => {
    activeSessions.clear();
}, 10 * 60 * 1000);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
