const express = require("express");
const app = express();
app.use(express.json());

const activeSessions = new Map();
const TIMEOUT_MS = 60 * 1000;

// หน้าเว็บแดชบอร์ดตกแต่งแบบ Cyberpunk / Glassmorphism
app.get("/", (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html lang="th">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Script Monitor Dashboard</title>
        <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
        <style>
            * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Plus Jakarta Sans', sans-serif; }
            body {
                background: radial-gradient(circle at top, #1e1b4b, #0f172a 60%, #020617);
                color: #f8fafc;
                min-height: 100vh;
                padding: 40px 20px;
            }
            .container { max-width: 950px; margin: 0 auto; }
            .header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 25px;
            }
            .header-title h1 { font-size: 24px; font-weight: 700; color: #fff; }
            .header-title p { font-size: 14px; color: #94a3b8; margin-top: 4px; }
            .live-indicator {
                display: flex;
                align-items: center;
                gap: 8px;
                background: rgba(34, 197, 94, 0.1);
                border: 1px solid rgba(34, 197, 94, 0.3);
                padding: 6px 14px;
                border-radius: 999px;
                font-size: 13px;
                color: #4ade80;
                font-weight: 600;
            }
            .dot {
                width: 8px;
                height: 8px;
                background: #22c55e;
                border-radius: 50%;
                box-shadow: 0 0 10px #22c55e;
                animation: pulse 1.5s infinite;
            }
            @keyframes pulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.4; transform: scale(0.85); } }

            .stats-grid {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
                gap: 16px;
                margin-bottom: 25px;
            }
            .stat-card {
                background: rgba(30, 41, 59, 0.7);
                backdrop-filter: blur(12px);
                border: 1px solid rgba(255, 255, 255, 0.08);
                border-radius: 16px;
                padding: 20px;
                position: relative;
                overflow: hidden;
            }
            .stat-card::before { content: ''; position: absolute; top: 0; left: 0; width: 4px; height: 100%; }
            .stat-card.blue::before { background: #38bdf8; }
            .stat-card.green::before { background: #22c55e; }
            .stat-card.purple::before { background: #a855f7; }
            .stat-label { font-size: 13px; color: #94a3b8; font-weight: 500; }
            .stat-value { font-size: 38px; font-weight: 700; margin-top: 8px; color: #fff; }

            .table-card {
                background: rgba(30, 41, 59, 0.6);
                backdrop-filter: blur(12px);
                border: 1px solid rgba(255, 255, 255, 0.08);
                border-radius: 16px;
                overflow: hidden;
            }
            table { width: 100%; border-collapse: collapse; text-align: left; }
            th {
                background: rgba(15, 23, 42, 0.6);
                padding: 14px 18px;
                font-size: 13px;
                font-weight: 600;
                color: #94a3b8;
                border-bottom: 1px solid rgba(255, 255, 255, 0.08);
            }
            td {
                padding: 14px 18px;
                font-size: 14px;
                border-bottom: 1px solid rgba(255, 255, 255, 0.04);
            }
            tr:hover td { background: rgba(255, 255, 255, 0.02); }
            
            .badge { display: inline-block; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 600; }
            .badge-delta { background: rgba(56, 189, 248, 0.15); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.3); }
            .badge-mobile { background: rgba(245, 158, 11, 0.15); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.3); }
            .badge-pc { background: rgba(148, 163, 184, 0.15); color: #cbd5e1; }
            .badge-other { background: rgba(255, 255, 255, 0.05); color: #94a3b8; }
            .empty-state { text-align: center; padding: 40px; color: #64748b; font-size: 14px; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <div class="header-title">
                    <h1>Real-time Script Monitor</h1>
                    <p>ระบบตรวจจับสถิติการใช้งานสคริปต์อัตโนมัติ</p>
                </div>
                <div class="live-indicator">
                    <div class="dot"></div>
                    LIVE
                </div>
            </div>

            <div class="stats-grid">
                <div class="stat-card green">
                    <div class="stat-label">ผู้ใช้ออนไลน์สด (Total Active)</div>
                    <div class="stat-value" id="totalOnline">0</div>
                </div>
                <div class="stat-card purple">
                    <div class="stat-label">ผู้ใช้ผ่าน Mobile</div>
                    <div class="stat-value" id="totalMobile">0</div>
                </div>
                <div class="stat-card blue">
                    <div class="stat-label">ผู้ใช้ Delta Executor</div>
                    <div class="stat-value" id="totalDelta">0</div>
                </div>
            </div>

            <div class="table-card">
                <table>
                    <thead>
                        <tr>
                            <th>ชื่อผู้ใช้ (Roblox)</th>
                            <th>User ID</th>
                            <th>อุปกรณ์</th>
                            <th>ตัวรัน (Executor)</th>
                            <th>Active ล่าสุด</th>
                        </tr>
                    </thead>
                    <tbody id="userList">
                        <tr><td colspan="5" class="empty-state">กำลังโหลดข้อมูล...</td></tr>
                    </tbody>
                </table>
            </div>
        </div>

        <script>
            async function fetchStats() {
                try {
                    const res = await fetch('/api/online');
                    const data = await res.json();

                    document.getElementById('totalOnline').innerText = data.totalOnline;
                    
                    let mobileCount = 0;
                    let deltaCount = 0;
                    const tbody = document.getElementById('userList');

                    if (data.users.length === 0) {
                        tbody.innerHTML = '<tr><td colspan="5" class="empty-state">ไม่มีผู้ใช้งานออนไลน์ในขณะนี้</td></tr>';
                    } else {
                        tbody.innerHTML = '';
                        data.users.forEach(u => {
                            if (u.device === 'Mobile') mobileCount++;
                            if (u.isDelta) deltaCount++;

                            const deviceBadge = u.device === 'Mobile' 
                                ? '<span class="badge badge-mobile">📱 Mobile</span>' 
                                : '<span class="badge badge-pc">💻 PC</span>';

                            const execBadge = u.isDelta 
                                ? '<span class="badge badge-delta">Delta</span>' 
                                : '<span class="badge badge-other">' + (u.executor || 'Unknown') + '</span>';

                            const tr = document.createElement('tr');
                            tr.innerHTML = 
                                '<td><b>' + u.username + '</b></td>' +
                                '<td style="color:#94a3b8;">' + u.userId + '</td>' +
                                '<td>' + deviceBadge + '</td>' +
                                '<td>' + execBadge + '</td>' +
                                '<td style="color:#4ade80;">' + u.activeForSeconds + 's ago</td>';
                            tbody.appendChild(tr);
                        });
                    }

                    document.getElementById('totalMobile').innerText = mobileCount;
                    document.getElementById('totalDelta').innerText = deltaCount;

                } catch(e) {}
            }

            setInterval(fetchStats, 2000);
            fetchStats();
        </script>
    </body>
    </html>
    `);
});

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
    console.log(`Server running on port ${PORT}`);
});
