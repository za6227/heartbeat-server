const express = require("express");
const app = express();
app.use(express.json());

// เก็บสถานะ Session คนออนไลน์ใน Memory: sessionId -> { userId, username, lastSeen }
const activeSessions = new Map();
const TIMEOUT_MS = 60 * 1000; // ตัดเป็นออฟไลน์ถ้าขาดการติดต่อเกิน 60 วินาที

// หน้าแรก สำหรับเช็คว่าเซิร์ฟเวอร์เปิดติดปกติไหม
app.get("/", (req, res) => {
    res.send("Heartbeat Server is running!");
});

// Endpoint สำหรับรับสัญญาณ Heartbeat จากตัวสคริปต์ Roblox
app.post("/api/heartbeat", (req, res) => {
    const { sessionId, userId, username } = req.body;

    if (!sessionId) {
        return res.status(400).json({ error: "Missing sessionId" });
    }

    activeSessions.set(sessionId, {
        userId: userId || "Unknown",
        username: username || "Anonymous",
        lastSeen: Date.now()
    });

    res.json({ status: "alive" });
});

// Endpoint สำหรับเปิดดูจำนวนและรายชื่อคนออนไลน์สด
app.get("/api/online", (req, res) => {
    const now = Date.now();
    const onlineList = [];

    // กรองและลบคนที่ขาดการติดต่อไปเกิน 60 วินาทีออกอัตโนมัติ
    for (const [id, data] of activeSessions.entries()) {
        if (now - data.lastSeen > TIMEOUT_MS) {
            activeSessions.delete(id);
        } else {
            onlineList.push({
                sessionId: id,
                username: data.username,
                userId: data.userId,
                activeForSeconds: Math.floor((now - data.lastSeen) / 1000)
            });
        }
    }

    res.json({
        totalOnline: onlineList.length,
        users: onlineList
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
