const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.json());

const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL || "https://discord.com/api/webhooks/1568136540549415005/f_LPZmmv_rM8TNxh_3oY9GWOLemfxYDzhrZqR01iNTfjnPav7ZjOahk_0mS1s10VPE31";

// เก็บข้อมูลผู้เล่นทั้งหมดที่ออนไลน์: userId -> { username, device, executor, placeId, ping, fps, lastSeen }
const activeUsers = new Map();
const activeSessions = new Set(); // ป้องกันการ์ดเด้งซ้ำคนเดิมทุก 30 วินาที

// ฟังก์ชันดึงรายชื่อและเคลียร์คนที่หลุดเกิน 60 วินาที
function getActiveUsersList() {
    const now = Date.now();
    const onlineList = [];

    for (const [id, user] of activeUsers.entries()) {
        if (now - user.lastSeen <= 60 * 1000) {
            onlineList.push(user);
        } else {
            activeUsers.delete(id); // หลุดการเชื่อมต่อเกิน 1 นาที ลบออกจากระบบ
        }
    }
    return onlineList;
}

app.post('/api/heartbeat', async (req, res) => {
    try {
        const { username, userId, device, executor, placeId, ping, fps } = req.body;

        if (userId) {
            // บันทึก/อัปเดตข้อมูลผู้เล่นล่าสุด
            activeUsers.set(userId, {
                username: username || 'Unknown',
                userId: userId,
                device: device || 'Unknown',
                executor: executor || 'Unknown',
                placeId: placeId || 'Unknown',
                ping: ping || 0,
                fps: fps || 0,
                lastSeen: Date.now()
            });

            // ส่งแจ้งเตือนเข้า Discord เฉพาะตอนผู้เล่นเปิดสคริปต์ครั้งแรก
            if (!activeSessions.has(userId)) {
                activeSessions.add(userId);

                const currentOnlineUsers = getActiveUsersList();

                // สร้างข้อความสรุปรายชื่อผู้เล่นที่กำลังออนไลน์อยู่ทั้งหมด
                let onlineSummaryText = currentOnlineUsers.map((u, index) => {
                    return `${index + 1}. **${u.username}** | 📱 ${u.device} | ⚙️ ${u.executor}`;
                }).join('\n');

                // ป้องกันข้อความยาวเกินลิมิตของ Discord (1024 ตัวอักษรต่อ Field)
                if (onlineSummaryText.length > 1000) {
                    onlineSummaryText = onlineSummaryText.substring(0, 997) + '...';
                }

                await axios.post(DISCORD_WEBHOOK_URL, {
                    embeds: [
                        {
                            title: "🚀 fAst Hub - มีผู้ใช้งานเปิดสคริปต์!",
                            color: 3447003,
                            fields: [
                                { name: "👤 ผู้เล่นที่เพิ่งเปิด", value: `${username} (ID: ${userId})`, inline: true },
                                { name: "📱 อุปกรณ์", value: `${device || 'Unknown'}`, inline: true },
                                { name: "⚙️ ตัวรัน", value: `${executor || 'Unknown'}`, inline: true },
                                { name: "🗺️ Place ID", value: `${placeId || 'Unknown'}`, inline: true },
                                { name: "📊 ประสิทธิภาพ", value: `Ping: ${ping || 0}ms | FPS: ${fps || 0}`, inline: true },
                                { name: "🟢 จำนวนออนไลน์รวม", value: `**${currentOnlineUsers.length} คน**`, inline: true },
                                { name: "📋 รายชื่อผู้ใช้ที่กำลังออนไลน์อยู่ทั้งหมด", value: onlineSummaryText || "ไม่มีข้อมูล", inline: false }
                            ],
                            footer: { text: "fAst Hub Logger System" },
                            timestamp: new Date().toISOString()
                        }
                    ]
                }).catch(err => console.error("Discord send failed:", err.message));
            }
        }

        res.status(200).json({ status: "alive", totalOnline: activeUsers.size });
    } catch (error) {
        console.error("Error processing heartbeat:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// ล้างประวัติการแจ้งเตือนคนเดิมทุก 15 นาที
setInterval(() => {
    activeSessions.clear();
}, 15 * 60 * 1000);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
