const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// เปิด CORS เพื่อให้ GitHub Pages ดึงข้อมูลข้ามโดเมนได้
app.use(cors({ origin: '*' }));
app.use(express.json());

// เก็บรายชื่อผู้ใช้งานที่กำลังออนไลน์ (userId -> data)
const activeUsers = new Map();

// 1. API รับสัญญาณ Heartbeat จากในเกม (fAst_Script.lua)
app.post('/api/heartbeat', (req, res) => {
    const { username, userId, device, executor, placeId, ping, fps } = req.body;

    if (!userId) {
        return res.status(400).json({ error: "Missing userId" });
    }

    activeUsers.set(String(userId), {
        userId: String(userId),
        username: username || "Unknown",
        device: device || "PC",
        executor: executor || "Unknown",
        placeId: String(placeId || ""),
        ping: Number(ping) || 0,
        fps: Number(fps) || 0,
        lastSeen: Date.now()
    });

    return res.json({ status: "ok" });
});

// 2. API ส่งข้อมูลผู้ใช้ที่ออนไลน์ให้เว็บแดชบอร์ด (GET /api/users)
app.get('/api/users', (req, res) => {
    const now = Date.now();
    const TIMEOUT_MS = 60 * 1000; // หากไม่ส่งสัญญาณมาเกิน 60 วินาที ให้ถือว่าออกจากเกมแล้ว

    // คัดกรองและลบผู้ใช้ที่ออฟไลน์
    for (const [id, user] of activeUsers.entries()) {
        if (now - user.lastSeen > TIMEOUT_MS) {
            activeUsers.delete(id);
        }
    }

    const usersList = Array.from(activeUsers.values()).sort((a, b) => b.lastSeen - a.lastSeen);
    return res.json(usersList);
});

// หน้าแรกสำหรับตรวจสอบสถานะ
app.get('/', (req, res) => {
    res.send("fAst Hub Heartbeat Server is Online!");
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
