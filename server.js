-- ==================== [ ระบบ Heartbeat ตรวจจับผู้ใช้ ] ====================
local HttpService = game:GetService("HttpService")
local Players = game:GetService("Players")
local UserInputService = game:GetService("UserInputService")
local RunService = game:GetService("RunService")
local player = Players.LocalPlayer or Players.PlayerAdded:Wait()

-- ใส่ URL เซิร์ฟเวอร์ของคุณเดิม (ไม่ต้องใส่ Discord Webhook)
local SERVER_URL = "https://heartbeat-server-h5r4..." -- ใส่โดเมนเซิร์ฟเวอร์ของคุณ
local INTERVAL = 30 -- ส่งสัญญาณทุก 30 วินาที

-- เช็คอุปกรณ์
local function getDevice()
    if UserInputService.TouchEnabled and not UserInputService.KeyboardEnabled then
        return "Mobile"
    elseif UserInputService.GamepadEnabled and not UserInputService.KeyboardEnabled then
        return "Console"
    else
        return "PC"
    end
end

-- เช็คตัวรัน
local function getExecutor()
    local identify = identifyexecutor or getexecutorname
    if identify then
        return tostring(identify())
    end
    return "Unknown"
end

-- ฟังก์ชันรันลูปส่งสัญญาณไปที่เซิร์ฟเวอร์
task.spawn(function()
    local make_request = (syn and syn.request) or (http and http.request) or http_request or (fluxus and fluxus.request) or request
    if not make_request then return end

    while true do
        pcall(function()
            local ping = math.floor(player:GetNetworkPing() * 1000)
            local fps = math.floor(1 / RunService.RenderStepped:Wait())

            local payload = {
                username = string.format("%s (@%s)", player.DisplayName, player.Name),
                userId = tostring(player.UserId),
                device = getDevice(),
                executor = getExecutor(),
                placeId = tostring(game.PlaceId),
                ping = ping,
                fps = fps
            }

            make_request({
                Url = SERVER_URL .. "/heartbeat",
                Method = "POST",
                Headers = {
                    ["Content-Type"] = "application/json"
                },
                Body = HttpService:JSONEncode(payload)
            })
        end)

        task.wait(INTERVAL)
    end
end)
-- =========================================================================
