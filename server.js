local HttpService = game:GetService("HttpService")
local Players = game:GetService("Players")
local UserInputService = game:GetService("UserInputService")
local RbxAnalyticsService = game:GetService("RbxAnalyticsService")

local localPlayer = Players.LocalPlayer
local SERVER_URL = "https://heartbeat-server-h5r4.onrender.com/api/heartbeat"

-- สร้าง Session ID เฉพาะสำหรับเครื่อง/เซสชันนี้
local function getSessionId()
    local success, clientId = pcall(function()
        return RbxAnalyticsService:GetClientId()
    end)
    if success and clientId and clientId ~= "" then
        return clientId
    end
    return tostring(localPlayer.UserId) .. "_" .. tostring(os.time())
end

local mySessionId = getSessionId()

-- ตรวจสอบชื่อตัวรันและตรวจว่าเป็น Delta หรือไม่
local function getExecutorDetails()
    local name = "Unknown"
    
    if identifyexecutor then
        local res = identifyexecutor()
        name = tostring(res or "Unknown")
    elseif getexecutorname then
        local res = getexecutorname()
        name = tostring(res or "Unknown")
    end

    -- ตรวจสอบว่าใช่ Delta หรือไม่ (เช็กจากชื่อ หรือตัวแปรเฉพาะของ Delta)
    local isDelta = false
    local lowerName = string.lower(name)
    if string.find(lowerName, "delta") or DELTA ~= nil or delta ~= nil then
        isDelta = true
        name = "Delta"
    end

    return name, isDelta
end

-- ตรวจสอบประเภทอุปกรณ์ (Mobile / PC)
local function getDeviceType()
    if UserInputService.TouchEnabled and not UserInputService.KeyboardEnabled then
        return "Mobile"
    elseif UserInputService.KeyboardEnabled and UserInputService.MouseEnabled then
        return "PC"
    elseif UserInputService.GamepadEnabled then
        return "Console"
    else
        return "Other"
    end
end

-- ฟังก์ชันส่ง HTTP Request ที่รองรับฟังก์ชันของตัวรันทุกค่าย
local function sendRequest(url, data)
    local requestFunc = (syn and syn.request) or (http and http.request) or http_request or request
    if not requestFunc then
        return false
    end

    local payload = HttpService:JSONEncode(data)
    pcall(function()
        requestFunc({
            Url = url,
            Method = "POST",
            Headers = {
                ["Content-Type"] = "application/json"
            },
            Body = payload
        })
    end)
end

-- ฟังก์ชันยิงข้อมูล Heartbeat เข้า server.js
local function sendHeartbeat()
    local execName, isDelta = getExecutorDetails()
    
    local payload = {
        sessionId = mySessionId,
        userId = tostring(localPlayer.UserId),
        username = localPlayer.Name,
        device = getDeviceType(),
        executor = execName,
        isDelta = isDelta
    }
    
    task.spawn(function()
        sendRequest(SERVER_URL, payload)
    end)
end

-- เริ่มต้นส่งทันที และวนลูปส่งซ้ำทุกๆ 20 วินาที
sendHeartbeat()
task.spawn(function()
    while task.wait(20) do
        sendHeartbeat()
    end
end)
