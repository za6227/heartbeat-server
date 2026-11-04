const express = require("express");
const app = express();
app.use(express.json());

const activeSessions = new Map();
const TIMEOUT_MS = 60 * 1000; // เกิน 60 วินาทีตัดเป็น Offline

// หน้า Dashboard สำหรับเปิดดูผ่านเบราว์เซอร์
app.get("/", (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html lang="th">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Script Live Dashboard</title>
        <style>
            body { font-family: 'Segoe UI', Tahoma, sans-serif; background: #0b0f19; color: #f8fafc; padding: 25px; margin: 0; }
            .card { background: #1e293b; max-width: 750px; margin: 20px auto; border-radius: 12px; padding: 24px; box-shadow: 0 4px 20px rgba(0,0,0,0.5); }
            .count { font-size: 56px; font-weight: bold; color: #22c55e; margin: 10px 0; }
            table { width: 100%; margin-top: 20px; border-collapse: collapse; }
            th, td { padding: 12px 10px; border-bottom: 1px solid #334155; font-size: 14px; text-align: left; }
            th { color: #94a3b8; }
            .badge-online { background: #22c55e20; color: #22c55e; padding: 4px 8px; border-radius: 6px; font-size: 12px; }
            .badge-delta { background: #38bdf820; color: #38bdf8; font-weight: bold; padding: 2px 6px; border-radius: 4px; }
        </style>
    </head>
    <body>
        <div class="card">
            <h2>สถานะคนใช้งานสคริปต์ (Real-time)</h2>
            <div class="count" id="count">0</div>
            <p style="color: #94a3b8;">กำลังออนไลน์อยู่ขณะนี้</p>
            <table>
                <thead>
                    <tr>
                        <th>ชื่อผู้ใช้</th>
                        <th>User ID</th>
                        <th>อุปกรณ์</th>
                        <th>ตัวรัน</th>
                        <th>สถานะ</th>
                    </tr>
                </thead>
                <tbody id="userList"></tbody>
            </table>
        </div>

        <script>
            async function updateStats() {
                try {
                    const res = await fetch('/api/online');
                    const data = await res.json();
                    document.getElementById('count').innerText = data.totalOnline;
                    
                    const tbody = document.getElementById('userList');
                    tbody.innerHTML = '';
                    data.users.forEach(u => {
                        const tr = document.createElement('tr');
                        const execText = u.isDelta ? '<span class="badge-delta">Delta</span>' : u.executor;
                        tr.innerHTML = 
                            '<td>' + u.username + '</td>' +
                            '<td>' + u.userId + '</td>' +
                            '<td>' + u.device + '</td>' +
                            '<td>' + execText + '</td>' +
                            '<td><span class="badge-online">Online</span></td>';
                        tbody.appendChild(tr);
                    });
                } catch(e) {}
            }
            setInterval(updateStats, 5000);
            updateStats();
        </script>
    </body>
    </html>
    `);
});

// Endpoint รับสัญญาณจาก Roblox
app.post("/api/heartbeat", (req, res) => {
    const { sessionId, userId, username, device, executor, isDelta } = req.body;
    if (!sessionId) return res.status(400).json({ error: "Missing sessionId" });

    activeSessions.set(sessionId, {
        userId: userId || "Unknown",
        username: username || "Anonymous",
        device: device || "PC",
        executor: executor || "Unknown",
        isDelta: isDelta || false,
        lastSeen: Date.now()
    });

    res.json({ status: "alive" });
});

// Endpoint API เช็คข้อมูล
app.get("/api/online", (req, res) => {
    const now = Date.now();
    const onlineList = [];

    for (const [id, data] of activeSessions.entries()) {
        if (now - data.lastSeen > TIMEOUT_MS) {
            activeSessions.delete(id);
        } else {
            onlineList.push({
                sessionId: id,
                username: data.username,
                userId: data.userId,
                device: data.device,
                executor: data.executor,
                isDelta: data.isDelta,
                activeForSeconds: Math.floor((now - data.lastSeen) / 1000)
            });
        }
    }

    res.json({ totalOnline: onlineList.length, users: onlineList });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
