-- // ======================================================== // --
-- //   fAst Hub V10 - Relentless Combo Boss Engine            // --
-- //   Reversed & Authored by cook45                          // --
-- // ======================================================== // --

if not game:IsLoaded() then
    game.Loaded:Wait()
end

local Players = game:GetService("Players")
local RunService = game:GetService("RunService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local TweenService = game:GetService("TweenService")
local UserInputService = game:GetService("UserInputService")
local CoreGui = game:GetService("CoreGui")

local LocalPlayer = Players.LocalPlayer
if not LocalPlayer then
    Players:GetPropertyChangedSignal("LocalPlayer"):Wait()
    LocalPlayer = Players.LocalPlayer
end
local pgui = LocalPlayer:WaitForChild("PlayerGui", 15) or LocalPlayer:FindFirstChildOfClass("PlayerGui")

local isMobile = UserInputService.TouchEnabled or not UserInputService.KeyboardEnabled

-- กำหนดให้แสดงผลผ่าน PlayerGui โดยตรง เพื่อการันตี 100% ว่า UI จะขึ้นบนหน้าจอมือถือ (Delta Android/iOS) และ PC ทุกตัวรัน
local guiParent = pgui

-- ป้องกันข้อผิดพลาดตอนโหลด Remotes บน Delta
local Remotes = ReplicatedStorage:WaitForChild("Remotes", 15)
local PlayerCharacter = Remotes and Remotes:WaitForChild("PlayerCharacter", 15)

-- 1. ล้าง Hook, ลูป และ GUI เก่าออกทั้งหมด (แยก pcall เพื่อความปลอดภัยสูงสุดบน Delta Android)
local myRunToken = os.clock()
getgenv()._fAstRunToken = myRunToken

if getgenv()._JackLoop then pcall(function() getgenv()._JackLoop:Disconnect() end) getgenv()._JackLoop = nil end
if getgenv()._fAstLoop then pcall(function() getgenv()._fAstLoop:Disconnect() end) getgenv()._fAstLoop = nil end
if getgenv()._BossCombatLoop then pcall(function() getgenv()._BossCombatLoop:Disconnect() end) getgenv()._BossCombatLoop = nil end
if getgenv()._fAstInputConn then pcall(function() getgenv()._fAstInputConn:Disconnect() end) getgenv()._fAstInputConn = nil end

getgenv().DG_AutoParry = nil
getgenv().BossBot = nil
getgenv().JackCombat = nil

pcall(function() if type(gethui) == "function" and gethui() then local g = gethui():FindFirstChild("fAstHub_DG") if g then g:Destroy() end end end)
pcall(function() if pgui then local g = pgui:FindFirstChild("fAstHub_DG") if g then g:Destroy() end end end)
pcall(function() local g = CoreGui:FindFirstChild("fAstHub_DG") if g then g:Destroy() end end)
pcall(function() if type(gethui) == "function" and gethui() then local g = gethui():FindFirstChild("fAstToastGui") if g then g:Destroy() end end end)
pcall(function() if pgui then local g = pgui:FindFirstChild("fAstToastGui") if g then g:Destroy() end end end)
pcall(function() local g = CoreGui:FindFirstChild("fAstToastGui") if g then g:Destroy() end end)

-- 2. ระบบ Auto-Run อัตโนมัติเมื่อย้ายห้อง / วาร์ปเข้าห้องดวล / เข้าเล่นแรงค์ (Queue On Teleport - รองรับ Delta / Fluxus / Synapse)
local qot = (syn and syn.queue_on_teleport) 
    or queue_on_teleport 
    or queueonteleport 
    or (fluxus and fluxus.queue_on_teleport)
    or (Delta and Delta.queue_on_teleport)
    or (getgenv and getgenv().queue_on_teleport)
local teleportScript = [[
    repeat task.wait() until game:IsLoaded()
    task.wait(1.2)
    if isfile and isfile("fAstHub_DG.lua") then
        loadstring(readfile("fAstHub_DG.lua"))()
    elseif isfile and isfile("fAstHub_AutoExec.lua") then
        loadstring(readfile("fAstHub_AutoExec.lua"))()
    end
]]
if qot then
    pcall(function() qot(teleportScript) end)
    if not getgenv()._fAstTeleportHooked then
        getgenv()._fAstTeleportHooked = true
        LocalPlayer.OnTeleport:Connect(function(state)
            pcall(function() qot(teleportScript) end)
        end)
    end
end

-- 3. ฟังก์ชันออริจินัลแท้ๆ จาก BaseActionManager & GameManager (พร้อม Timeout โหลดปลอดภัยบนมือถือ)
local BaseActionManager = nil
local CleanOriginalCompute = nil
pcall(function()
    local mods = ReplicatedStorage:WaitForChild("Modules", 15)
    local bam = mods and mods:WaitForChild("BaseActionManager", 15)
    if bam then
        BaseActionManager = require(bam)
        CleanOriginalCompute = BaseActionManager._computeImpactResolution
    end
end)

local GameManager = nil
local CharacterController = nil
local PlayerInputController = nil
local function ResolveGameControllers()
    if CharacterController and PlayerInputController then return true end
    pcall(function()
        local gmMod = ReplicatedStorage:WaitForChild("GameManager", 15)
        if gmMod then
            GameManager = require(gmMod)
            CharacterController = GameManager:GetController("CharacterController")
            PlayerInputController = GameManager:GetController("PlayerInputController")
        end
    end)
    return CharacterController ~= nil
end
ResolveGameControllers()

-- รายการบอสที่สามารถเลือกสู้ได้ (พร้อมเพิ่ม The Headless Shogun)
local BossList = {
    {Id = "Any", Display = "Auto (Any)"},
    {Id = "Shogun", Display = "The Headless Shogun"},
    {Id = "Jack", Display = "Jack"},
    {Id = "Silene", Display = "Silene"},
    {Id = "Benkei", Display = "Benkei"},
    {Id = "NephraAmmut", Display = "Nephra & Ammut"},
    {Id = "Tremor", Display = "Tremor"}
}

local currentBossIndex = 2 -- Default to The Headless Shogun

local DifficultyList = {
    {Id = "Auto", Display = "Auto (Max)"},
    {Id = "Nightmare", Display = "Nightmare"},
    {Id = "Hard", Display = "Hard"},
    {Id = "Normal", Display = "Normal"}
}

local currentDiffIndex = 1

-- // 4. CONFIG (พร้อมระบบบันทึกค่าข้ามห้อง fAstHub_Config.json) // --
local HttpService = game:GetService("HttpService")
local savedCfg = {}
pcall(function()
    if isfile and readfile and isfile("fAstHub_Config.json") then
        local decoded = HttpService:JSONDecode(readfile("fAstHub_Config.json"))
        if type(decoded) == "table" then
            savedCfg = decoded
        end
    end
end)

local oldCfg = getgenv().fAstConfig or {}
local function pickBool(a, b, default)
    if type(a) == "boolean" then return a end
    if type(b) == "boolean" then return b end
    return default
end

getgenv().fAstConfig = {
    MenuKeybind = oldCfg.MenuKeybind or (savedCfg.MenuKeyName and Enum.KeyCode[savedCfg.MenuKeyName]) or Enum.KeyCode.RightControl,
    AutoParry = pickBool(oldCfg.AutoParry, savedCfg.AutoParry, true),
    ParryKeybind = oldCfg.ParryKeybind or (savedCfg.ParryKeyName and Enum.KeyCode[savedCfg.ParryKeyName]) or Enum.KeyCode.V,
    AutoBoss = pickBool(oldCfg.AutoBoss, savedCfg.AutoBoss, true),
    AutoReturnLobby = pickBool(oldCfg.AutoReturnLobby, savedCfg.AutoReturnLobby, true),
    AutoClaimRewards = pickBool(oldCfg.AutoClaimRewards, savedCfg.AutoClaimRewards, false),
    SelectedBoss = oldCfg.SelectedBoss or savedCfg.SelectedBoss or "The Headless Shogun",
    SelectedBossId = oldCfg.SelectedBossId or savedCfg.SelectedBossId or "Shogun",
    SelectedDifficulty = oldCfg.SelectedDifficulty or savedCfg.SelectedDifficulty or "Auto (Max)",
    SelectedDifficultyId = oldCfg.SelectedDifficultyId or savedCfg.SelectedDifficultyId or "Auto"
}

local function SaveConfig()
    pcall(function()
        if writefile and getgenv().fAstConfig then
            local c = getgenv().fAstConfig
            local data = HttpService:JSONEncode({
                MenuKeyName = c.MenuKeybind and c.MenuKeybind.Name or "RightControl",
                AutoParry = c.AutoParry,
                ParryKeyName = c.ParryKeybind and c.ParryKeybind.Name or "V",
                AutoBoss = c.AutoBoss,
                AutoReturnLobby = c.AutoReturnLobby,
                AutoClaimRewards = c.AutoClaimRewards,
                SelectedBoss = c.SelectedBoss,
                SelectedBossId = c.SelectedBossId,
                SelectedDifficulty = c.SelectedDifficulty,
                SelectedDifficultyId = c.SelectedDifficultyId
            })
            writefile("fAstHub_Config.json", data)
        end
    end)
end

-- ค้นหา index ปัจจุบันของ Boss และ Difficulty จาก config
for idx, b in ipairs(BossList) do
    if b.Display == getgenv().fAstConfig.SelectedBoss or b.Id == getgenv().fAstConfig.SelectedBossId then
        currentBossIndex = idx
        break
    end
end

for idx, d in ipairs(DifficultyList) do
    if d.Display == getgenv().fAstConfig.SelectedDifficulty or d.Id == getgenv().fAstConfig.SelectedDifficultyId then
        currentDiffIndex = idx
        break
    end
end

-- ฟังก์ชันเลือกระดับความยากที่ใช้งานได้จริงตามการปลดล็อคของตัวละคร
local function GetResolvedDifficulty(bossId)
    local diffId = getgenv().fAstConfig.SelectedDifficultyId or "Auto"
    local ep = nil
    pcall(function() ep = GameManager:GetController("EventProgressController") end)

    if diffId == "Auto" or diffId == "Auto (Max)" or not diffId then
        if ep and ep.IsDifficultyUnlocked then
            if ep:IsDifficultyUnlocked(bossId, "Nightmare") then
                return "Nightmare"
            elseif ep:IsDifficultyUnlocked(bossId, "Hard") then
                return "Hard"
            else
                return "Normal"
            end
        end
        return "Normal"
    end

    if ep and ep.IsDifficultyUnlocked then
        if ep:IsDifficultyUnlocked(bossId, diffId) then
            return diffId
        else
            if diffId == "Nightmare" and ep:IsDifficultyUnlocked(bossId, "Hard") then
                return "Hard"
            end
            return "Normal"
        end
    end

    return diffId
end

-- HUD Toast Notification
local function ShowHUDToast(text, color)
    local sg = guiParent:FindFirstChild("fAstToastGui") or Instance.new("ScreenGui")
    sg.Name = "fAstToastGui"
    sg.ResetOnSpawn = false
    sg.Parent = guiParent

    local oldToast = sg:FindFirstChild("Toast")
    if oldToast then oldToast:Destroy() end

    local Toast = Instance.new("Frame")
    Toast.Name = "Toast"
    Toast.Size = UDim2.new(0, 210, 0, 36)
    Toast.Position = UDim2.new(0.5, -105, 0.15, 0)
    Toast.BackgroundColor3 = Color3.fromRGB(15, 15, 20)
    Toast.BorderSizePixel = 0
    Toast.Parent = sg

    local tc = Instance.new("UICorner")
    tc.CornerRadius = UDim.new(0, 8)
    tc.Parent = Toast

    local ts = Instance.new("UIStroke")
    ts.Thickness = 1.5
    ts.Color = color or Color3.fromRGB(140, 60, 255)
    ts.Parent = Toast

    local tl = Instance.new("TextLabel")
    tl.Size = UDim2.new(1, 0, 1, 0)
    tl.BackgroundTransparency = 1
    tl.Font = Enum.Font.GothamBold
    tl.Text = text
    tl.TextColor3 = color or Color3.fromRGB(255, 255, 255)
    tl.TextSize = 13
    tl.Parent = Toast

    task.delay(1.2, function()
        if Toast and Toast.Parent then
            TweenService:Create(Toast, TweenInfo.new(0.2, Enum.EasingStyle.Quad, Enum.EasingDirection.Out), {BackgroundTransparency = 1}):Play()
            TweenService:Create(tl, TweenInfo.new(0.2, Enum.EasingStyle.Quad, Enum.EasingDirection.Out), {TextTransparency = 1}):Play()
            task.wait(0.2)
            Toast:Destroy()
        end
    end)
end

-- // 5. IMMUNITY HOOK: ป้องกันไฟและสกิลพื้นของบอสทุกตัว 100% // --
local function HookAllBossHazards()
    local mb = ReplicatedStorage:FindFirstChild("MiniBossKits")
    if not mb then return end
    for _, bossKit in ipairs(mb:GetChildren()) do
        local hz = bossKit:FindFirstChild("Hazards")
        if hz then
            for _, hazard in ipairs(hz:GetChildren()) do
                local clientMod = hazard:FindFirstChild("Client")
                if clientMod and clientMod:IsA("ModuleScript") then
                    pcall(function()
                        local mod = require(clientMod)
                        if type(mod) == "table" and type(mod.touches) == "function" then
                            mod.touches = function() return false end
                        end
                    end)
                end
            end
        end
    end
end
HookAllBossHazards()

-- // 5. TARGETING & BOSS DETECTION SYSTEM // --
local function GetActualPlayerHumanoid()
    local handler = CharacterController:GetLocalCharacterHandler()
    if handler and handler.Humanoid and handler.Humanoid.Parent and handler.Humanoid:IsDescendantOf(workspace) then
        return handler.Humanoid
    end
    local pc = workspace:FindFirstChild("Player_Client")
    local pcHum = pc and pc:FindFirstChildOfClass("Humanoid")
    if pcHum and pcHum.Parent and pcHum:IsDescendantOf(workspace) then
        return pcHum
    end
    local wp = workspace:FindFirstChild("Player")
    local wpHum = wp and wp:FindFirstChildOfClass("Humanoid")
    if wpHum and wpHum.Parent and wpHum:IsDescendantOf(workspace) then
        return wpHum
    end
    local char = LocalPlayer.Character
    local charHum = char and char:FindFirstChildOfClass("Humanoid")
    if charHum and charHum.Parent and charHum:IsDescendantOf(workspace) then
        return charHum
    end
    local pNameModel = workspace:FindFirstChild(LocalPlayer.Name)
    local pNameHum = pNameModel and pNameModel:FindFirstChildOfClass("Humanoid")
    if pNameHum and pNameHum.Parent and pNameHum:IsDescendantOf(workspace) then
        return pNameHum
    end
    return nil
end

local function GetMyRoot()
    local handler = CharacterController:GetLocalCharacterHandler()
    if handler and handler.Root and handler.Root.Parent and handler.Root:IsDescendantOf(workspace) then
        return handler.Root
    end
    local pc = workspace:FindFirstChild("Player_Client")
    if pc and pc:FindFirstChild("HumanoidRootPart") then
        return pc.HumanoidRootPart
    end
    local wp = workspace:FindFirstChild("Player")
    if wp and wp:FindFirstChild("HumanoidRootPart") then
        return wp.HumanoidRootPart
    end
    local char = LocalPlayer.Character
    return char and char:FindFirstChild("HumanoidRootPart")
end

-- [ฟังก์ชันช่วยปลดล็อคมุมกล้องและหยุดทุกระบบเมื่ออยู่นอกการต่อสู้หรือปิดบอท]
local function ReleaseCameraLock()
    pcall(function()
        local tlc = GameManager and GameManager:GetController("TargetLockController")
        if tlc then
            tlc:SetForcedTargetLock(nil)
            tlc:SetTarget(nil)
            tlc.CriticalStrikeTarget = nil
        end
    end)
    pcall(function()
        if PlayerInputController and PlayerInputController.CurrentInput then
            PlayerInputController.CurrentInput.MoveDirection = Vector3.new(0, 0, 0)
        end
        local handler = CharacterController and CharacterController:GetLocalCharacterHandler()
        if handler then
            handler.TargetLock = nil
            handler.OverrideLookDirection = nil
            handler.DesiredLookDirection = nil
            handler.DesiredMoveDirection = Vector3.new(0, 0, 0)
            handler._desiredQueuedAction = nil
            handler._desiredQueuedActionDuration = nil
            if handler.ActionManager then
                local am = handler.ActionManager
                if am._clearQueuedAction then
                    pcall(function() am:_clearQueuedAction(true) end)
                end
                am._queuedActionType = nil
                am._queuedActionProperties = nil
                am._queuedAction = nil
                am._lastQueuedTime = nil
                if am.CurrentAction and am.CurrentAction.CanCancel then
                    pcall(function() am:CancelCurrentAction() end)
                end
            end
        end
        local cam = workspace.CurrentCamera
        local hum = GetActualPlayerHumanoid()
        if cam then
            if hum and (cam.CameraSubject ~= hum or not cam.CameraSubject.Parent or not cam.CameraSubject:IsDescendantOf(workspace)) then
                cam.CameraSubject = hum
            end
            if cam.CameraType ~= Enum.CameraType.Custom then
                cam.CameraType = Enum.CameraType.Custom
            end
        end
    end)
end

-- [ฟังก์ชันหยุดการโจมตี ล้างคิวออกทั้งหมด 100% ป้องกันการต่อยค้างใน Lobby]
local function HardStopAllAttacks(handler, am)
    pcall(function()
        if not handler then
            handler = CharacterController and CharacterController:GetLocalCharacterHandler()
        end
        if handler then
            handler._desiredQueuedAction = nil
            handler._desiredQueuedActionDuration = nil
            handler.DesiredMoveDirection = Vector3.new(0, 0, 0)
            if not am then am = handler.ActionManager end
        end
        if am then
            if am._clearQueuedAction then
                pcall(function() am:_clearQueuedAction(true) end)
            end
            am._queuedActionType = nil
            am._queuedActionProperties = nil
            am._queuedAction = nil
            am._lastQueuedTime = nil
            if am.CurrentAction and am.CurrentAction.CanCancel then
                pcall(function() am:CancelCurrentAction() end)
            end
        end
        if PlayerInputController and PlayerInputController.CurrentInput then
            PlayerInputController.CurrentInput.MoveDirection = Vector3.new(0, 0, 0)
        end
        ReleaseCameraLock()
    end)
end

-- [ตรวจสอบว่าผู้เล่นอยู่ใน Lobby / Hub หรืออยู่นอกสนามประลองหรือไม่]
local function IsInLobby()
    local myRoot = GetMyRoot()
    if not myRoot then return true end

    -- 1. พิกัด Lobby ฮาโลวีน (X > 0 และ Z > -15000 โดยทั่วไปอยู่ที่ X ~ 2725, Z ~ -10797)
    if myRoot.Position.X > 0 and myRoot.Position.Z > -15000 then
        if workspace:FindFirstChild("HalloweenEventHubMap") or workspace:FindFirstChild("LobbyMap") then
            return true
        end
    end

    -- 2. แผนที่ Lobby ปกติ
    if workspace:FindFirstChild("LobbyMap") and not workspace:FindFirstChild("HalloweenEventHubMap") then
        local lm = workspace.LobbyMap
        if myRoot:IsDescendantOf(lm) or (myRoot.Position.Y > 200) then
            return true
        end
    end

    -- 3. หน้าจอผลการต่อสู้ขึ้น (จบการแข่งขันแล้ว)
    local pgui = LocalPlayer:FindFirstChild("PlayerGui")
    if pgui then
        local rGui = pgui:FindFirstChild("MiniBossResultsGui")
        if rGui and rGui.Enabled then return true end
    end

    -- 4. อยู่ใน SafeZone
    local char = LocalPlayer.Character
    if char and (char:GetAttribute("InSafeZone") == true) then
        return true
    end

    return false
end

local function IsBossAlive(model)
    if not model or not model.Parent or not model:IsDescendantOf(workspace) then return false end
    if model == LocalPlayer.Character or model.Name == "Player_Client" or model.Name == "Player" then return false end

    -- กรองผู้เล่นจริงทั้งหมดออก (ผู้เล่นไม่ใช่บอสเด็ดขาด)
    if Players:GetPlayerFromCharacter(model) ~= nil then
        return false
    end

    -- กรอง NPC ใน Lobby/Hub (เช่น Jack, GraveKeeper, CandyShop)
    if model.Parent and (model.Parent.Name == "NPCs" or model.Parent.Name == "NPCSpots") then
        return false
    end
    if model.Name == "Jack" or model.Name == "GraveKeeper" or model.Name == "CandyShop" then
        return false
    end
    if workspace:FindFirstChild("HalloweenEventHubMap") and model:IsDescendantOf(workspace.HalloweenEventHubMap) then
        return false
    end
    if workspace:FindFirstChild("LobbyMap") and model:IsDescendantOf(workspace.LobbyMap) then
        return false
    end

    -- บอสติดสถานะตาย / จบการต่อสู้ (หยุดตีทันที 100%)
    if model:GetAttribute("Dead") == true or model:GetAttribute("IsDead") == true then
        return false
    end

    local attrHealth = model:GetAttribute("Health")
    if attrHealth ~= nil and attrHealth <= 0 then
        return false
    end

    local npcHealth = model:GetAttribute("NPCHealth")
    if npcHealth ~= nil and npcHealth <= 0 then
        return false
    end

    local hum = model:FindFirstChildOfClass("Humanoid")
    if hum and hum.Health <= 0 then
        return false
    end

    local pgui = LocalPlayer:FindFirstChild("PlayerGui")
    local rGui = pgui and pgui:FindFirstChild("MiniBossResultsGui")
    if rGui and rGui.Enabled then
        return false
    end

    return true
end

local function IsCombatOpponent(model)
    if not IsBossAlive(model) then return false end
    local myRoot = GetMyRoot()
    local bRoot = model:FindFirstChild("HumanoidRootPart")
    if not myRoot or not bRoot then return false end

    -- ต้องอยู่ในสนามประลองเดียวกัน (ไม่เกิน 350 studs) เพื่อไม่ให้ไปดึงบอสของผู้เล่นคนอื่นที่อยู่อีกสนาม (ห่างออกไป 6,000+ studs)
    if (bRoot.Position - myRoot.Position).Magnitude > 350 then
        return false
    end

    local char = LocalPlayer.Character
    local myInCombat = char and (char:GetAttribute("InCombat") == true)
    local myMatch = LocalPlayer:GetAttribute("InMatch")
    local myGroup = char and char:GetAttribute("HitboxGroup")

    -- ถ้าตัวเราไม่ได้อยู่ในแมตช์และไม่ได้อยู่ในสถานะต่อสู้ แปลว่ายืนอยู่ใน Lobby/Hub -> ไม่มีเป้าหมายบอส
    if not myInCombat and myMatch == nil then
        return false
    end

    local modelMatch = model:GetAttribute("InMatch")
    if modelMatch ~= nil and myMatch ~= nil and modelMatch ~= myMatch then
        return false
    end

    local modelGroup = model:GetAttribute("HitboxGroup")
    if myGroup ~= nil and modelGroup ~= nil and modelGroup ~= myGroup then
        return false
    end

    if Players:GetPlayerFromCharacter(model) ~= nil then
        return false
    end

    if model:GetAttribute("MiniBossKit") ~= nil or string.find(model.Name, "^MiniBoss_") then
        return true
    end
    if model:GetAttribute("NPCBehavior") ~= nil or model:GetAttribute("NPCDisplayName") ~= nil then
        return true
    end
    return false
end

local function FindBossTarget(chosenBoss)
    if IsInLobby() then return nil end
    local myRoot = GetMyRoot()
    if not myRoot then return nil end
    local char = LocalPlayer.Character

    -- 1. ตรวจสอบคู่ต่อสู้ในแมตช์/สนามประลอง
    local candidates = {}
    local seen = {}
    local function evaluateModel(obj)
        if obj and not seen[obj] and obj:IsA("Model") and obj ~= char and obj.Name ~= "Player_Client" then
            seen[obj] = true
            local hum = obj:FindFirstChildOfClass("Humanoid")
            local root = obj:FindFirstChild("HumanoidRootPart")
            if hum and root and IsCombatOpponent(obj) then
                local plr = Players:GetPlayerFromCharacter(obj)
                if not plr or plr ~= LocalPlayer then
                    table.insert(candidates, obj)
                end
            end
        end
    end

    for _, obj in ipairs(workspace:GetChildren()) do
        evaluateModel(obj)
    end

    local matchDir = workspace:FindFirstChild("MatchDirectory")
    if matchDir then
        for _, obj in ipairs(matchDir:GetDescendants()) do
            evaluateModel(obj)
        end
    end

    local arenas = workspace:FindFirstChild("Arenas")
    if arenas then
        for _, obj in ipairs(arenas:GetDescendants()) do
            evaluateModel(obj)
        end
    end

    -- 2. Fallback จาก TargetLockController (ต้องเป็นคู่ต่อสู้ที่ผ่าน IsCombatOpponent เท่านั้น)
    if #candidates == 0 then
        pcall(function()
            local tlc = GameManager:GetController("TargetLockController")
            if tlc and tlc.Target and tlc.Target.Parent and tlc.Target.Parent ~= char and IsCombatOpponent(tlc.Target.Parent) then
                table.insert(candidates, tlc.Target.Parent)
            end
        end)
    end

    if #candidates == 0 then return nil end

    -- ถ้าตรงกับบอสที่เลือก ให้เลือกตัวนั้นก่อน (รองรับ The Headless Shogun, Jack, Silene, Benkei, Nephra & Ammut, Tremor)
    if chosenBoss and chosenBoss ~= "Auto (Any)" and chosenBoss ~= "Any" then
        local cLower = string.lower(chosenBoss)
        for _, m in ipairs(candidates) do
            local nLower = string.lower(m.Name)
            local kitLower = string.lower(tostring(m:GetAttribute("MiniBossKit") or ""))
            local dispLower = string.lower(tostring(m:GetAttribute("NPCDisplayName") or ""))
            local titleLower = string.lower(tostring(m:GetAttribute("NPCTitleText") or ""))
            if string.find(nLower, cLower) 
               or string.find(kitLower, cLower) 
               or string.find(dispLower, cLower) 
               or string.find(titleLower, cLower)
               or (string.find(cLower, "shogun") and (string.find(nLower, "shogun") or string.find(kitLower, "shogun") or string.find(dispLower, "shogun")))
               or (chosenBoss == "Nephra & Ammut" and (string.find(nLower, "nephra") or string.find(nLower, "ammut"))) then
                return m
            end
        end
    end

    -- เลือกตัวที่ใกล้ตัวละครจริง (Player_Client) ที่สุด
    table.sort(candidates, function(a, b)
        local ra = a:FindFirstChild("HumanoidRootPart")
        local rb = b:FindFirstChild("HumanoidRootPart")
        if ra and rb then
            return (ra.Position - myRoot.Position).Magnitude < (rb.Position - myRoot.Position).Magnitude
        end
        return false
    end)
    return candidates[1]
end

-- ค้นหาศัตรูเป้าหมาย (รองรับทั้งบอสและคู่ต่อสู้ในสนามประลอง)
local function FindAnyTarget()
    if IsInLobby() then return nil end

    if getgenv().fAstConfig then
        local b = FindBossTarget(getgenv().fAstConfig.SelectedBoss)
        if b and IsBossAlive(b) then return b end
    end

    local tlcTarget = nil
    pcall(function()
        local tlc = GameManager:GetController("TargetLockController")
        if tlc and tlc.Target and tlc.Target.Parent and IsCombatOpponent(tlc.Target.Parent) then
            tlcTarget = tlc.Target.Parent
        end
    end)
    if tlcTarget then return tlcTarget end

    local myRoot = GetMyRoot()
    if not myRoot then return nil end
    local char = LocalPlayer.Character

    local closest, closestDist = nil, 85
    for _, m in ipairs(workspace:GetChildren()) do
        if m:IsA("Model") and m ~= char and m.Name ~= "Player_Client" and Players:GetPlayerFromCharacter(m) == nil then
            local r = m:FindFirstChild("HumanoidRootPart")
            local h = m:FindFirstChildOfClass("Humanoid")
            if r and h and IsCombatOpponent(m) then
                local d = (r.Position - myRoot.Position).Magnitude
                if d < closestDist then
                    closest = m
                    closestDist = d
                end
            end
        end
    end
    return closest
end

-- // 5.1 SILENT AIM / 100% HIT REGISTRATION HOOK (ตีและอันติโดนทุกครั้ง 100%) // --
local function GetPerfectStrikeCFrame(origCF)
    if IsInLobby() then return origCF end
    local target = FindAnyTarget()
    if target and IsBossAlive(target) then
        local bRoot = target:FindFirstChild("HumanoidRootPart")
        if bRoot then
            local bPos = bRoot.Position
            local myRoot = GetMyRoot()
            local myPos = (myRoot and myRoot.Position) or (typeof(origCF) == "CFrame" and origCF.Position) or bPos
            local toB = (bPos - myPos)
            local flat = Vector3.new(toB.X, 0, toB.Z)
            local unit = flat.Magnitude > 0.05 and flat.Unit or -bRoot.CFrame.LookVector
            -- ฮิตบ็อกซ์ของอาวุธจะยื่นออกไปข้างหน้าตัวละครประมาณ 4 studs (hitboxCFrame = 0, 0, -4)
            -- ดังนั้นการวางตำแหน่งอ้างอิงห่างจากบอส 2.5 studs หันหน้าเข้าหาบอส จะทำให้ตัวบอสอยู่กึ่งกลางฮิตบ็อกซ์ 100%
            local strikePos = bPos - unit * 2.5
            return CFrame.lookAt(strikePos, bPos)
        end
    end
    return origCF
end

task.spawn(function()
    pcall(function()
        local rem = ReplicatedStorage:WaitForChild("Remotes", 15)
        local pc = rem and rem:WaitForChild("PlayerCharacter", 15)
        local req = pc and pc:WaitForChild("Request", 15)
        local RequestHitboxOnImpact = req and req:WaitForChild("RequestHitboxOnImpact", 15)
        if not RequestHitboxOnImpact then return end

        -- 1. Hook ผ่าน hookmetamethod (__namecall) เพื่อดักจับการยิงผ่าน RemoteEvent:FireServer(...)
        if hookmetamethod and not getgenv()._fAstHitboxNamecallHooked then
            getgenv()._fAstHitboxNamecallHooked = true
            local oldNamecall
            oldNamecall = hookmetamethod(game, "__namecall", function(self, ...)
                local method = getnamecallmethod()
                if self == RequestHitboxOnImpact and method == "FireServer" then
                    local args = {...}
                    if #args >= 1 then
                        args[1] = GetPerfectStrikeCFrame(args[1])
                        return oldNamecall(self, unpack(args))
                    end
                end
                return oldNamecall(self, ...)
            end)
        end

        -- 2. Hook สำรองผ่าน hookfunction สำหรับกรณีเรียกตรงผ่าน dot (.FireServer)
        if type(hookfunction) == "function" and not getgenv()._fAstHitboxFuncHooked then
            getgenv()._fAstHitboxFuncHooked = true
            local oldHitboxFire
            oldHitboxFire = hookfunction(RequestHitboxOnImpact.FireServer, function(self, cf, t, id)
                if self == RequestHitboxOnImpact then
                    cf = GetPerfectStrikeCFrame(cf)
                end
                return oldHitboxFire(self, cf, t, id)
            end)
        end
    end)
end)

-- เช็คสกิลอันติของคู่ต่อสู้ใน PVP
local function IsUltimateAttack(impactData)
    if not impactData then return false end
    if impactData.triggerUltimate or impactData.unparryable then
        return true
    end
    if impactData.sourceModule then
        local modName = impactData.sourceModule.Name
        local fullName = impactData.sourceModule:GetFullName()
        if string.find(modName, "Ultimate") or string.find(fullName, "Ultimate") then
            return true
        end
    end
    if impactData.impactResults and impactData.impactResults.GetHit then
        if impactData.impactResults.GetHit.triggerUltimate then
            return true
        end
    end
    return false
end

-- // 6. HOOK DEFENSE & ULTIMATE ENGINE // --
local isPerformingUltimate = false
local ultCastTime = 0
local lastUltAttempt = 0

local function ApplyCleanHook(char)
    task.spawn(function()
        local handler = nil
        for _ = 1, 60 do
            handler = (char and CharacterController:GetCharacterHandler(char)) or CharacterController:GetLocalCharacterHandler()
            if handler and handler.ActionManager then break end
            task.wait(0.1)
        end
        if not handler or not handler.ActionManager then return end

        local am = handler.ActionManager

        -- [Ultimate 100% Snap Hook]: เมื่อใช้อันติไม่ว่าจะกดเองหรือระบบออโต้ จะพุ่งประกบหน้าเป้าหมายทันทีบน Player_Client
        local origTryQueue = am.TryQueueBasicAttack
        if origTryQueue and not am._fAstUltHooked then
            am._fAstUltHooked = true
            am.TryQueueBasicAttack = function(self, attackType, ...)
                if attackType == "Ultimate" then
                    local target = FindAnyTarget()
                    if target then
                        local bRoot = target:FindFirstChild("HumanoidRootPart")
                        local myRoot = handler.Root or GetMyRoot()
                        if bRoot and myRoot then
                            local toB = (bRoot.Position - myRoot.Position)
                            local flat = Vector3.new(toB.X, 0, toB.Z)
                            local unit = flat.Magnitude > 0.05 and flat.Unit or myRoot.CFrame.LookVector
                            local snapCF = CFrame.lookAt(Vector3.new(bRoot.Position.X - unit.X * 2.0, bRoot.Position.Y, bRoot.Position.Z - unit.Z * 2.0), bRoot.Position)
                            myRoot.CFrame = snapCF
                            myRoot.AssemblyLinearVelocity = Vector3.new(0, 0, 0)
                            handler._serverRootCFrame = snapCF
                            pcall(function()
                                PlayerCharacter.Request.UpdateCharacterCFrame:FireServer(snapCF)
                                PlayerCharacter.Request.SetDesiredLookDirection:FireServer(unit, 999)
                            end)
                        end
                    end
                end
                local res = origTryQueue(self, attackType, ...)
                if res and attackType == "Ultimate" then
                    isPerformingUltimate = true
                    ultCastTime = tick()
                end
                return res
            end
        end

        am._computeImpactResolution = function(self, impactData)
            local isFromBoss = false
            if impactData.attackerCharacter then
                local plr = Players:GetPlayerFromCharacter(impactData.attackerCharacter)
                if not plr or plr ~= LocalPlayer then isFromBoss = true end
            end

            -- ถ้าโดนโจมตีจากบอสและเปิด AutoBoss -> Parry 100%
            if isFromBoss and getgenv().fAstConfig and getgenv().fAstConfig.AutoBoss then
                -- ปลดล็อคท่าโกงบอส: บังคับลบเงื่อนไข unparryable / unblockable ทุกท่า (รวมถึง Thrust, Ichimonji, Wave ในระดับ 2 และ 3)
                impactData.unparryable = nil
                impactData.unblockable = nil
                impactData.undodgeable = nil

                -- เพิ่ม Posture Damage สะท้อนกลับใส่บอสเมื่อแพรี่ เพื่อให้การ์ดบอสแตกเร็วขึ้น ชนะง่ายขึ้น
                if impactData.impactResults then
                    if not impactData.impactResults.Parry then
                        impactData.impactResults.Parry = {
                            effect = "Parry",
                            postureDamage = -10,
                            postureDamageAttacker = 45,
                            staggerType = "Parry",
                            staggerDuration = 0.8,
                            staggerKnockback = 1
                        }
                    else
                        local pRes = impactData.impactResults.Parry
                        pRes.postureDamage = math.min(pRes.postureDamage or 0, -5)
                        pRes.postureDamageAttacker = math.max(pRes.postureDamageAttacker or 20, 45)
                    end
                end

                local oldP = handler.IsParrying
                handler.IsParrying = true
                local res = CleanOriginalCompute(self, impactData)
                handler.IsParrying = oldP

                -- เคาน์เตอร์ตีสวนกลับทันทีหลังแพรี่การโจมตีของบอส (Instant Counter Strike)
                task.spawn(function()
                    task.wait(0.04)
                    pcall(function()
                        if IsInLobby() then return end
                        local target = FindAnyTarget()
                        if not target or not IsBossAlive(target) then return end
                        if handler and handler.ActionManager then
                            local actMgr = handler.ActionManager
                            if handler._forceClearBlockInput then
                                handler:_forceClearBlockInput()
                            elseif actMgr.BlockAction then
                                actMgr.BlockAction._wantsToRelease = true
                            end
                            if actMgr._queuedActionType then
                                if actMgr._clearQueuedAction then
                                    pcall(function() actMgr:_clearQueuedAction(true) end)
                                end
                                actMgr._queuedActionType = nil
                                actMgr._queuedActionProperties = nil
                            end

                            -- [ถ้าเกจอันติเต็ม 100% ให้ปล่อยอันติสวนกลับทันทีที่แพรี่การ์ดบอสแตก!]
                            if handler:CanPerformUltimate() and (tick() - lastUltAttempt > 1.5) then
                                lastUltAttempt = tick()
                                isPerformingUltimate = true
                                ultCastTime = tick()
                                handler._desiredQueuedAction = "Ultimate"
                                handler._desiredQueuedActionDuration = 0.8
                                actMgr:TryQueueBasicAttack("Ultimate")
                                return
                            end

                            handler._desiredQueuedAction = "LightAttack"
                            actMgr:TryQueueBasicAttack("Light")
                        end
                    end)
                end)

                return res
            end

            -- ถ้าเป็นการเล่นใน PVP ทั่วไป (AutoParry)
            if not getgenv().fAstConfig or not getgenv().fAstConfig.AutoParry then
                return CleanOriginalCompute(self, impactData)
            end

            -- ไม่กันอันติของทีมตรงข้ามใน PVP
            if IsUltimateAttack(impactData) then
                return CleanOriginalCompute(self, impactData)
            end

            local oldP = handler.IsParrying
            handler.IsParrying = true
            local res = CleanOriginalCompute(self, impactData)
            handler.IsParrying = oldP

            -- เคาน์เตอร์ตีสวนกลับสำหรับ AutoParry ใน PVP ด้วยเช่นกัน
            task.spawn(function()
                task.wait(0.04)
                pcall(function()
                    if IsInLobby() then return end
                    local target = FindAnyTarget()
                    if not target or not IsBossAlive(target) then return end
                    if handler and handler.ActionManager then
                        local actMgr = handler.ActionManager
                        if handler._forceClearBlockInput then
                            handler:_forceClearBlockInput()
                        elseif actMgr.BlockAction then
                            actMgr.BlockAction._wantsToRelease = true
                        end
                        if actMgr._queuedActionType then
                            if actMgr._clearQueuedAction then
                                pcall(function() actMgr:_clearQueuedAction(true) end)
                            end
                            actMgr._queuedActionType = nil
                            actMgr._queuedActionProperties = nil
                        end
                        handler._desiredQueuedAction = "LightAttack"
                        actMgr:TryQueueBasicAttack("Light")
                    end
                end)
            end)

            return res
        end
    end)
end

-- // 7. AUTO RETURN TO LOBBY // --
local isReturningLobby = false

if LocalPlayer.Character then ApplyCleanHook(LocalPlayer.Character) end
if getgenv()._fAstCharAddedConn then pcall(function() getgenv()._fAstCharAddedConn:Disconnect() end) end
getgenv()._fAstCharAddedConn = LocalPlayer.CharacterAdded:Connect(function(c)
    isReturningLobby = false
    ApplyCleanHook(c)
end)

local function LeaveFinishedArenaOnce()
    -- 1. ยิง Remote ออกจากสนามมินิบอส (MiniBossFight.Request_Leave)
    pcall(function()
        local mb = ReplicatedStorage:FindFirstChild("Remotes") and ReplicatedStorage.Remotes:FindFirstChild("MiniBossFight")
        if mb and mb:FindFirstChild("Request_Leave") then
            mb.Request_Leave:FireServer()
        end
    end)

    -- 2. กดปุ่ม ReturnButton บน MiniBossResultsGui
    pcall(function()
        local pgui = LocalPlayer:FindFirstChild("PlayerGui")
        local rGui = pgui and pgui:FindFirstChild("MiniBossResultsGui")
        if rGui and rGui.Enabled then
            local btn = rGui.Screen.Stage:FindFirstChild("ReturnButton")
            if btn and getconnections then
                for _, c in ipairs(getconnections(btn.Activated)) do
                    c:Fire()
                end
            end
        end
    end)

    -- 3. ยิง Match RequestReturnToLobby สำรองกรณีเป็นสนามปกติ
    pcall(function()
        local remotes = ReplicatedStorage:FindFirstChild("Remotes")
        if remotes and remotes:FindFirstChild("Match") and remotes.Match:FindFirstChild("RequestReturnToLobby") then
            remotes.Match.RequestReturnToLobby:FireServer()
        end
    end)
end

local function TriggerAutoReturnToLobby(reason)
    if not getgenv().fAstConfig or (not getgenv().fAstConfig.AutoReturnLobby and not getgenv().fAstConfig.AutoBoss) then return end
    if isReturningLobby then return end
    isReturningLobby = true

    task.spawn(function()
        ShowHUDToast("🏆 บอสตายแล้ว! กำลังเตรียมรอบถัดไป...", Color3.fromRGB(50, 255, 150))
        task.wait(1.2)

        -- หากเปิด AutoBoss และไม่ได้เปิด AutoReturnLobby: ลองยิง Retry สู้ต่อได้ทันที
        if getgenv().fAstConfig.AutoBoss and not getgenv().fAstConfig.AutoReturnLobby then
            pcall(function()
                local mb = ReplicatedStorage:FindFirstChild("Remotes") and ReplicatedStorage.Remotes:FindFirstChild("MiniBossFight")
                if mb and mb:FindFirstChild("Request_Retry") then
                    mb.Request_Retry:FireServer()
                end
            end)
            task.wait(1.5)
            local char = LocalPlayer.Character
            if char and char:GetAttribute("InCombat") == true and FindBossTarget("Auto (Any)") ~= nil then
                isReturningLobby = false
                return
            end
        end

        for attempt = 1, 8 do
            local char = LocalPlayer.Character
            if attempt > 2 and (not char or char:GetAttribute("InSafeZone") == true or not FindBossTarget("Auto (Any)")) then
                break
            end

            LeaveFinishedArenaOnce()
            task.wait(0.8)
        end

        isReturningLobby = false
    end)
end

-- ดักจับสัญญาณบอสแพ้จากเซิร์ฟเวอร์โดยตรง
pcall(function()
    if getgenv()._fAstBannerConn then pcall(function() getgenv()._fAstBannerConn:Disconnect() end) end
    if getgenv()._fAstResultConn then pcall(function() getgenv()._fAstResultConn:Disconnect() end) end
    local mb = ReplicatedStorage:FindFirstChild("Remotes") and ReplicatedStorage.Remotes:FindFirstChild("MiniBossFight")
    if mb then
        if mb:FindFirstChild("Banner") then
            getgenv()._fAstBannerConn = mb.Banner.OnClientEvent:Connect(function(matchId, bannerType)
                if bannerType == "Victory" then
                    TriggerAutoReturnToLobby("BannerVictory")
                end
            end)
        end
        if mb:FindFirstChild("Result") then
            getgenv()._fAstResultConn = mb.Result.OnClientEvent:Connect(function()
                TriggerAutoReturnToLobby("MiniBossResult")
            end)
        end
    end
end)

-- // 7.6 AUTO CLAIM REWARDS ENGINE // --
local function ClaimAllRewards(silent)
    task.spawn(function()
        -- 1. เคลมรางวัล Like (+500 Coins +50 Gems)
        pcall(function()
            local remotes = ReplicatedStorage:FindFirstChild("Remotes") and ReplicatedStorage.Remotes:FindFirstChild("Player")
            if remotes and remotes:FindFirstChild("RequestLikesReward") then
                remotes.RequestLikesReward:FireServer()
            end
        end)

        -- 2. เคลมรางวัล Favorite (+1,000 Coins +75 Gems)
        pcall(function()
            local remotes = ReplicatedStorage:FindFirstChild("Remotes") and ReplicatedStorage.Remotes:FindFirstChild("Player")
            if remotes and remotes:FindFirstChild("RequestFavoriteReward") then
                remotes.RequestFavoriteReward:FireServer()
            end
        end)

        -- 3. เคลมรางวัล BattlePass อัตโนมัติ
        pcall(function()
            local remotes = ReplicatedStorage:FindFirstChild("Remotes") and ReplicatedStorage.Remotes:FindFirstChild("BattlePass")
            if remotes and remotes:FindFirstChild("Request_Claim") then
                remotes.Request_Claim:FireServer()
            end
        end)

        -- 4. เคลม EventProgress / Keepsake
        pcall(function()
            local remotes = ReplicatedStorage:FindFirstChild("Remotes") and ReplicatedStorage.Remotes:FindFirstChild("EventProgress")
            if remotes and remotes:FindFirstChild("Request_RedeemKey") then
                remotes.Request_RedeemKey:FireServer()
            end
        end)

        if not silent then
            ShowHUDToast("🎁 ส่งคำขอรับรางวัลทั้งหมดเรียบร้อย!", Color3.fromRGB(255, 100, 200))
        end
    end)
end

-- ลูปตรวจสอบเคลมรางวัลอัตโนมัติเบื้องหลัง
task.spawn(function()
    while getgenv()._fAstRunToken == myRunToken do
        task.wait(12)
        if getgenv()._fAstRunToken ~= myRunToken then break end
        if getgenv().fAstConfig and getgenv().fAstConfig.AutoClaimRewards then
            ClaimAllRewards(true)
        end
    end
end)

-- // 8. AUTO BOSS SMART COMBAT ENGINE (ตีตรงจังหวะ ไม่ตีมั่ว หันหาบอสเฉพาะตอนสู้) // --
local lastAttackTime = 0
local lastEquipTime = 0
local snappedFrames = 0
local hadBossFighting = false

-- [ฟังก์ชันช่วยปลดล็อคมุมกล้องเมื่ออยู่นอกการต่อสู้หรือปิดบอท]
local function ReleaseCameraLock()
    pcall(function()
        local tlc = GameManager:GetController("TargetLockController")
        if tlc then
            tlc:SetForcedTargetLock(nil)
            tlc:SetTarget(nil)
            tlc.CriticalStrikeTarget = nil
        end
    end)
    pcall(function()
        if PlayerInputController and PlayerInputController.CurrentInput then
            PlayerInputController.CurrentInput.MoveDirection = Vector3.new(0, 0, 0)
        end
        local handler = CharacterController:GetLocalCharacterHandler()
        if handler then
            handler.TargetLock = nil
            handler.OverrideLookDirection = nil
            handler.DesiredLookDirection = nil
            handler.DesiredMoveDirection = Vector3.new(0, 0, 0)
            handler._desiredQueuedAction = nil
            handler._desiredQueuedActionDuration = nil
            if handler.ActionManager then
                handler.ActionManager._queuedActionType = nil
                handler.ActionManager._queuedAction = nil
                if handler.ActionManager.CurrentAction and handler.ActionManager.CurrentAction.CanCancel then
                    pcall(function() handler.ActionManager:CancelCurrentAction() end)
                end
            end
        end
        local cam = workspace.CurrentCamera
        local hum = GetActualPlayerHumanoid()
        if cam then
            if hum and (cam.CameraSubject ~= hum or not cam.CameraSubject.Parent or not cam.CameraSubject:IsDescendantOf(workspace)) then
                cam.CameraSubject = hum
            end
            if cam.CameraType ~= Enum.CameraType.Custom then
                cam.CameraType = Enum.CameraType.Custom
            end
        end
    end)
end

-- Watchdog ป้องกันมุมกล้องหลุดส่องพื้นหรือค้างในช่องว่างเมื่อสลับแผนที่/ปิดบอท
if getgenv()._fAstCamWatchdog then pcall(function() getgenv()._fAstCamWatchdog:Disconnect() end) end
getgenv()._fAstCamWatchdog = RunService.RenderStepped:Connect(function()
    local cam = workspace.CurrentCamera
    if not cam then return end
    local cs = cam.CameraSubject
    if not cs or not cs.Parent or not cs:IsDescendantOf(workspace) then
        local hum = GetActualPlayerHumanoid()
        if hum then
            cam.CameraSubject = hum
            if cam.CameraType ~= Enum.CameraType.Custom then
                cam.CameraType = Enum.CameraType.Custom
            end
        end
    end
end)

getgenv()._BossCombatLoop = RunService.Heartbeat:Connect(function()
    if not getgenv().fAstConfig or not getgenv().fAstConfig.AutoBoss then
        if hadBossFighting then
            hadBossFighting = false
            snappedFrames = 0
            HardStopAllAttacks()
        end
        return
    end

    local handler = CharacterController:GetLocalCharacterHandler()
    if not handler or not handler.ActionManager then return end
    local myRoot = handler.Root or GetMyRoot()
    local myHum = handler.Humanoid
    if not myRoot or not myHum or myHum.Health <= 0 then return end
    local am = handler.ActionManager

    -- [Hard Stop ใน Lobby]: ถ้าอยู่ใน Lobby หรือ SafeZone ให้ล้างคิวโจมตีทั้งหมดและเก็บอาวุธทันที
    if IsInLobby() then
        HardStopAllAttacks(handler, am)
        if hadBossFighting then
            hadBossFighting = false
            isPerformingUltimate = false
            snappedFrames = 0
            ShowHUDToast("🏠 อยู่ในล็อบบี้ หยุดการโจมตีทั้งหมด", Color3.fromRGB(180, 180, 255))
        end
        if handler.EquippedWeapon and (tick() - lastEquipTime > 1.0) then
            lastEquipTime = tick()
            pcall(function()
                PlayerCharacter.Request.SetEquippedWeapon:FireServer(false)
            end)
        end
        return
    end

    -- ตรวจสอบว่าได้ Hook ระบบตีแม่นยำแล้วหรือยัง
    if not am._fAstUltHooked then
        ApplyCleanHook()
    end

    local targetBoss = FindBossTarget(getgenv().fAstConfig.SelectedBoss)

    -- [ตรวจสอบสถานะการต่อสู้]: บอสต้องยังมีชีวิตอยู่จริง (หยุดตี ปลดกล้อง และล้างคิวทันที 100%)
    if not targetBoss or not IsBossAlive(targetBoss) then
        HardStopAllAttacks(handler, am)
        if hadBossFighting then
            hadBossFighting = false
            isPerformingUltimate = false
            snappedFrames = 0
            ShowHUDToast("🏆 บอสตายแล้ว! หยุดโจมตีอัตโนมัติ", Color3.fromRGB(50, 255, 120))
            if TriggerAutoReturnToLobby then
                TriggerAutoReturnToLobby("BossDeathInCombat")
            end
        end
        if handler.EquippedWeapon and (tick() - lastEquipTime > 1.0) then
            lastEquipTime = tick()
            pcall(function()
                PlayerCharacter.Request.SetEquippedWeapon:FireServer(false)
            end)
        end
        return
    end

    local bRoot = targetBoss:FindFirstChild("HumanoidRootPart")
    if not bRoot or not IsBossAlive(targetBoss) then
        HardStopAllAttacks(handler, am)
        if hadBossFighting then
            hadBossFighting = false
            isPerformingUltimate = false
            snappedFrames = 0
        end
        return
    end

    local bPos = bRoot.Position
    local toBoss = (bPos - myRoot.Position)
    local dist = toBoss.Magnitude

    -- ตรวจสอบระยะต่อสู้ (ครอบคลุมทั้งสนามประลอง ไม่เกิน 400 studs)
    if dist > 400 then
        HardStopAllAttacks(handler, am)
        if hadBossFighting then
            hadBossFighting = false
            isPerformingUltimate = false
            snappedFrames = 0
        end
        return
    end

    -- สวมใส่อาวุธอัตโนมัติเมื่ออยู่ต่อหน้าบอสในสนามประลองเท่านั้น (dist <= 300)
    if not handler.EquippedWeapon and (tick() - lastEquipTime > 1.5) then
        lastEquipTime = tick()
        pcall(function()
            PlayerCharacter.Request.SetEquippedWeapon:FireServer(true)
        end)
    end

    hadBossFighting = true

    -- ปิด CanCollide ของ RemoteCollider ของบอสชั่วคราวเพื่อไม่ให้ตัวบอสดีดเราถอยหลัง
    pcall(function()
        local bHandler = CharacterController:GetCharacterHandler(targetBoss)
        if bHandler and bHandler.RemoteCollider then
            bHandler.RemoteCollider.CanCollide = false
        end
    end)

    -- [ตรวจจับสถานะอันติ]: ดูว่าอยู่ในจังหวะร่ายหรือท่าอนิเมชันอันติหรือไม่
    local currentAct = am.CurrentAction
    local actProps = currentAct and currentAct.Properties
    local actAttackName = actProps and tostring(actProps.attackName) or ""
    local isUltActionActive = (currentAct and (actAttackName == "Ultimate" or string.find(actAttackName, "Ultimate"))) or (isPerformingUltimate and (tick() - ultCastTime < 1.4))
    if not isUltActionActive then
        isPerformingUltimate = false
    end

    -- [A] ล็อคเป้าตัวละคร + ซิงค์ TargetLock ไปยังเซิร์ฟเวอร์เพื่อให้การพุ่งโจมตีหันเข้าหาบอสเสมอ
    local bLook = bRoot.CFrame.LookVector
    local flatLook = Vector3.new(bLook.X, 0, bLook.Z)
    if flatLook.Magnitude > 0.05 then
        flatLook = flatLook.Unit
    else
        flatLook = Vector3.new(0, 0, -1)
    end

    -- ตำแหน่งยืน 2.0 studs หน้าบอสและหันเข้าหาบอส
    local standPos = bPos + flatLook * 2.0
    local lookAtPos = Vector3.new(bPos.X, standPos.Y, bPos.Z)
    local targetCF = CFrame.lookAt(standPos, lookAtPos)

    local flatToBoss = Vector3.new(bPos.X - myRoot.Position.X, 0, bPos.Z - myRoot.Position.Z)
    local unit = flatToBoss.Magnitude > 0.01 and flatToBoss.Unit or -flatLook

    handler.TargetLock = bRoot
    handler.OverrideLookDirection = unit
    handler.DesiredLookDirection = unit
    handler.DesiredLookResponsiveness = 999

    pcall(function()
        local tlc = GameManager:GetController("TargetLockController")
        if tlc then
            if tlc.ForcedTargetLock ~= bRoot then
                tlc:SetForcedTargetLock(bRoot)
            end
            if tlc.Target ~= bRoot then
                tlc:SetTarget(bRoot)
            end
        end
    end)

    -- [B] ระบบซิงค์ฟิสิกส์ Client-Server (แก้ปัญหาตัวละครฟันลมอยู่กับที่)
    local isSim = handler.PhysicsComponent and handler.PhysicsComponent.IsPhysicsSimulated
    if isSim then
        myRoot.CFrame = targetCF
        myRoot.AssemblyLinearVelocity = Vector3.new(0, 0, 0)
        handler._serverRootCFrame = targetCF
        handler._interpolationResultCFrame = targetCF
        handler._bulkMoveCFrame = targetCF
        snappedFrames = snappedFrames + 1
        pcall(function()
            PlayerCharacter.Request.UpdateCharacterCFrame:FireServer(targetCF)
            PlayerCharacter.Request.SetDesiredLookDirection:FireServer(unit, 999)
        end)
    else
        snappedFrames = 0
        if dist <= 350 then
            myRoot.CFrame = targetCF
            myRoot.AssemblyLinearVelocity = Vector3.new(0, 0, 0)
            handler._serverRootCFrame = targetCF
            handler._interpolationResultCFrame = targetCF
            handler._bulkMoveCFrame = targetCF
            pcall(function()
                PlayerCharacter.Request.UpdateCharacterCFrame:FireServer(targetCF)
                PlayerCharacter.Request.SetDesiredLookDirection:FireServer(unit, 999)
            end)
        end
    end

    if handler.PhysicsComponent and handler.PhysicsComponent.AlignOrientation then
        handler.PhysicsComponent.AlignOrientation.CFrame = CFrame.lookAt(myRoot.Position, Vector3.new(bPos.X, myRoot.Position.Y, bPos.Z))
    end

    -- อัปเดต MoveDirection ใน PlayerInputController เพื่อไม่ให้ StepState ล้างค่าการเดินเข้าหาบอส
    local moveDir = (dist > 2.2) and unit or Vector3.new(0, 0, 0)
    handler.DesiredMoveDirection = moveDir
    if PlayerInputController and PlayerInputController.CurrentInput then
        PlayerInputController.CurrentInput.MoveDirection = moveDir
    end

    -- [C] ระบบโจมตีอัตโนมัติแม่นยำ 100% (ตีเมื่ออยู่ในระยะประชิด <= 3.8 studs ไม่ตีลมเด็ดขาด)
    local readyToStrike = (dist <= 3.8) or (isSim and snappedFrames >= 1 and dist <= 4.0)

    if not IsBossAlive(targetBoss) then
        HardStopAllAttacks(handler, am)
        if hadBossFighting then
            hadBossFighting = false
            isPerformingUltimate = false
            snappedFrames = 0
        end
        return
    end

    -- 1. ตรวจสอบสถานะศัตรูบล็อคแตก (Guard Break / Posture Break)
    local tlc = nil
    pcall(function() tlc = GameManager:GetController("TargetLockController") end)
    local critTarget = (tlc and tlc.CriticalStrikeTarget) or CharacterController.CriticalStrikeTarget
    local isOpenCrit = (bRoot:GetAttribute("OpenForCritical") == true) or ((targetBoss:GetAttribute("Posture") or 100) <= 0)
    local isBlockBroken = isOpenCrit or (critTarget and critTarget.Parent and IsBossAlive(critTarget.Parent))

    local canUlt = false
    pcall(function() canUlt = handler:CanPerformUltimate() end)

    if isUltActionActive then
        -- กำลังออกท่าอันติ: ติดตามและล็อคตัวละครประกบหน้าบอสต่อเนื่องตลอดอนิเมชัน ไม่ให้บอสฉีกหนีหรือหลบหลุดฮิตบ็อกซ์
        if bRoot and IsBossAlive(targetBoss) then
            local toB = (bPos - myRoot.Position)
            local flat = Vector3.new(toB.X, 0, toB.Z)
            local ultUnit = flat.Magnitude > 0.05 and flat.Unit or -flatLook
            local ultStickCF = CFrame.lookAt(bPos - ultUnit * 2.2, bPos)
            myRoot.CFrame = ultStickCF
            myRoot.AssemblyLinearVelocity = Vector3.new(0, 0, 0)
            handler.DesiredLookDirection = ultUnit
            handler.OverrideLookDirection = ultUnit
            pcall(function()
                PlayerCharacter.Request.UpdateCharacterCFrame:FireServer(ultStickCF)
                PlayerCharacter.Request.SetDesiredLookDirection:FireServer(ultUnit, 999)
            end)
        end
    elseif readyToStrike and IsBossAlive(targetBoss) then
        -- ปลดบล็อกถ้าติดการ์ดหรือค้างบล็อกอยู่
        if am.BlockAction and am.BlockAction.CanCancel and not handler.IsParrying then
            if handler._forceClearBlockInput then
                handler:_forceClearBlockInput()
            else
                am.BlockAction._wantsToRelease = true
            end
        end

        -- Watchdog ป้องกันคิวตีติดค้างเกิน 0.35 วินาที
        if am._queuedActionType then
            if not am._lastQueuedTime then am._lastQueuedTime = tick() end
            if tick() - am._lastQueuedTime > 0.35 then
                am._queuedActionType = nil
                am._queuedActionProperties = nil
                am._lastQueuedTime = nil
            end
        else
            am._lastQueuedTime = tick()
        end

        -- 2. ระบบอันติตามเมื่อศัตรูบล็อคแตก หรือจังหวะการ์ดร้าว (Ultimate Engine)
        local bossPosture = targetBoss:GetAttribute("Posture") or 100
        local bossMaxPosture = targetBoss:GetAttribute("MaxPosture") or 150
        local isPostureCracked = (bossPosture < bossMaxPosture * 0.65)
        local shouldUnleashUlt = isBlockBroken or isPostureCracked or (tick() - lastUltAttempt > 2.5)

        local ultSuccess = false
        if canUlt and shouldUnleashUlt and (tick() - lastUltAttempt > 1.2) then
            lastUltAttempt = tick()
            myRoot.CFrame = targetCF
            if handler._forceClearBlockInput then handler:_forceClearBlockInput() end
            if am._queuedActionType then
                am._queuedActionType = nil
                am._queuedActionProperties = nil
            end
            if am.CurrentAction and am.CurrentAction.CanCancel then
                pcall(function() am:CancelCurrentAction() end)
            end
            handler._desiredQueuedAction = "Ultimate"
            handler._desiredQueuedActionDuration = 0.8
            ultSuccess = am:TryQueueBasicAttack("Ultimate")
            if ultSuccess then
                isPerformingUltimate = true
                ultCastTime = tick()
            end
        end

        -- 3. ถ้าบล็อคแตกแต่อันติยังไม่พร้อม ให้แทงปิดฉาก Critical Strike แทน
        if isBlockBroken and not ultSuccess and not isPerformingUltimate then
            if am and am.CurrentAction and am.CurrentAction.CanCancel then
                pcall(function() am:CancelCurrentAction() end)
            end
            pcall(function()
                PlayerCharacter.Request.CriticalStrike:FireServer(targetBoss)
            end)
        end

        -- 4. โจมตีปกติแบบต่อเนื่องไม่ขาดตอน (Relentless Combo) เพื่อเร่งให้ศัตรูบล็อคแตก
        if not isBlockBroken and not ultSuccess and not isPerformingUltimate then
            local canQueue = false
            if not currentAct then
                canQueue = true
            else
                canQueue = currentAct.CanQueueActions or currentAct.CanQueueBasicAttacks or currentAct.CanCancel or currentAct.CanChainBasicAttack
            end

            if (canQueue or not am.CurrentAction) and not am._queuedActionType and IsBossAlive(targetBoss) then
                handler._desiredQueuedAction = "LightAttack"
                local qOk = am:TryQueueBasicAttack("Light")
                if not qOk and currentAct and currentAct.CanCancel then
                    pcall(function() am:CancelCurrentAction() end)
                    am:TryQueueBasicAttack("Light")
                end
            end
        end
    else
        -- บอสฉีกหนีเกินระยะ หรือบอสตาย: ล้างคิวโจมตีค้างทันที
        HardStopAllAttacks(handler, am)
    end
end)

-- // 8. MODERN CYBER-AESTHETIC GLASS UI (fAst Hub) // --
pcall(function()
    if gethui and gethui():FindFirstChild("fAstHub_DG") then gethui().fAstHub_DG:Destroy() end
    if CoreGui:FindFirstChild("fAstHub_DG") then CoreGui.fAstHub_DG:Destroy() end
    if pgui:FindFirstChild("fAstHub_DG") then pgui.fAstHub_DG:Destroy() end
end)

local ScreenGui = Instance.new("ScreenGui")
ScreenGui.Name = "fAstHub_DG"
ScreenGui.ResetOnSpawn = false
ScreenGui.DisplayOrder = 99999
ScreenGui.IgnoreGuiInset = true
ScreenGui.ZIndexBehavior = Enum.ZIndexBehavior.Sibling
ScreenGui.Parent = guiParent

local Main = Instance.new("Frame")
Main.Name = "MainFrame"
Main.Size = UDim2.new(0, 338, 0, 440)
Main.Position = UDim2.new(0.04, 0, 0.15, 0)
Main.BackgroundColor3 = Color3.fromRGB(15, 13, 24)
Main.BorderSizePixel = 0
Main.Active = true
Main.Visible = true -- แสดงผล UI ทันที 100% เมื่อรันสคิปต์บนมือถือ Delta
Main.ClipsDescendants = true
Main.Parent = ScreenGui

-- ระบบปรับขนาดอัตโนมัติสำหรับหน้าจอมือถือ / แท็บเล็ต (Mobile Auto UIScale)
local uiScale = Instance.new("UIScale")
uiScale.Parent = Main
local function AdjustResponsiveScale()
    local cam = workspace.CurrentCamera
    if cam and cam.ViewportSize.Y > 0 then
        local vH = cam.ViewportSize.Y
        if vH < 475 then
            uiScale.Scale = math.clamp(vH / 475, 0.65, 1.0)
        else
            uiScale.Scale = 1.0
        end
    end
end
AdjustResponsiveScale()
if workspace.CurrentCamera then
    workspace.CurrentCamera:GetPropertyChangedSignal("ViewportSize"):Connect(AdjustResponsiveScale)
end

-- Helper สำหรับผูกปุ่มให้ทำงานแม่นยำ 100% ทั้งเมาส์บน PC และระบบสัมผัส (Touch) บนมือถือ Delta
local function BindClick(btn, callback)
    local lastClick = 0
    local function trigger()
        if tick() - lastClick < 0.22 then return end
        lastClick = tick()
        callback()
    end
    btn.Activated:Connect(trigger)
    btn.MouseButton1Click:Connect(trigger)
end

local MainGrad = Instance.new("UIGradient")
MainGrad.Color = ColorSequence.new({
    ColorSequenceKeypoint.new(0, Color3.fromRGB(24, 19, 40)),
    ColorSequenceKeypoint.new(0.5, Color3.fromRGB(16, 14, 26)),
    ColorSequenceKeypoint.new(1, Color3.fromRGB(11, 9, 18))
})
MainGrad.Rotation = 45
MainGrad.Parent = Main

local MainCorner = Instance.new("UICorner")
MainCorner.CornerRadius = UDim.new(0, 14)
MainCorner.Parent = Main

local MainStroke = Instance.new("UIStroke")
MainStroke.Thickness = 1.6
MainStroke.Color = Color3.fromRGB(155, 75, 255)
MainStroke.ApplyStrokeMode = Enum.ApplyStrokeMode.Border
MainStroke.Parent = Main

-- TopBar (Header)
local TopBar = Instance.new("Frame")
TopBar.Name = "TopBar"
TopBar.Size = UDim2.new(1, 0, 0, 46)
TopBar.BackgroundColor3 = Color3.fromRGB(26, 21, 42)
TopBar.BorderSizePixel = 0
TopBar.Parent = Main

local TopCorner = Instance.new("UICorner")
TopCorner.CornerRadius = UDim.new(0, 14)
TopCorner.Parent = TopBar

local TopGrad = Instance.new("UIGradient")
TopGrad.Color = ColorSequence.new({
    ColorSequenceKeypoint.new(0, Color3.fromRGB(35, 27, 56)),
    ColorSequenceKeypoint.new(1, Color3.fromRGB(20, 16, 32))
})
TopGrad.Parent = TopBar

local TopLine = Instance.new("Frame")
TopLine.Name = "AccentLine"
TopLine.Size = UDim2.new(1, 0, 0, 1.5)
TopLine.Position = UDim2.new(0, 0, 1, -1.5)
TopLine.BackgroundColor3 = Color3.fromRGB(140, 60, 240)
TopLine.BorderSizePixel = 0
TopLine.Parent = TopBar

local Title = Instance.new("TextLabel")
Title.Name = "Title"
Title.Size = UDim2.new(0, 85, 1, 0)
Title.Position = UDim2.new(0, 14, 0, 0)
Title.BackgroundTransparency = 1
Title.Font = Enum.Font.GothamBold
Title.Text = "fAst Hub"
Title.TextColor3 = Color3.fromRGB(245, 240, 255)
Title.TextSize = 16
Title.TextXAlignment = Enum.TextXAlignment.Left
Title.Parent = TopBar

local KeyChip = Instance.new("TextButton")
KeyChip.Name = "KeyChip"
KeyChip.Size = UDim2.new(0, 86, 0, 20)
KeyChip.Position = UDim2.new(0, 95, 0.5, -10)
KeyChip.BackgroundColor3 = Color3.fromRGB(20, 17, 30)
KeyChip.BorderSizePixel = 0
KeyChip.Text = ""
KeyChip.ZIndex = 20
KeyChip.Parent = TopBar

local ChipCorner = Instance.new("UICorner")
ChipCorner.CornerRadius = UDim.new(0, 6)
ChipCorner.Parent = KeyChip

local ChipStroke = Instance.new("UIStroke")
ChipStroke.Thickness = 1
ChipStroke.Color = Color3.fromRGB(70, 55, 105)
ChipStroke.Parent = KeyChip

local ChipText = Instance.new("TextLabel")
ChipText.Size = UDim2.new(1, 0, 1, 0)
ChipText.BackgroundTransparency = 1
ChipText.Font = Enum.Font.GothamMedium
ChipText.Text = "[" .. (getgenv().fAstConfig.MenuKeybind and getgenv().fAstConfig.MenuKeybind.Name or "RightControl") .. "]"
ChipText.TextColor3 = Color3.fromRGB(170, 140, 240)
ChipText.TextSize = 10.5
ChipText.ZIndex = 21
ChipText.Parent = KeyChip

local CloseBtn = Instance.new("TextButton")
CloseBtn.Name = "CloseBtn"
CloseBtn.Size = UDim2.new(0, 28, 0, 28)
CloseBtn.Position = UDim2.new(1, -36, 0.5, -14)
CloseBtn.BackgroundColor3 = Color3.fromRGB(36, 30, 52)
CloseBtn.BorderSizePixel = 0
CloseBtn.Font = Enum.Font.GothamBold
CloseBtn.Text = "X"
CloseBtn.TextColor3 = Color3.fromRGB(255, 110, 110)
CloseBtn.TextSize = 13
CloseBtn.ZIndex = 25
CloseBtn.Active = true
CloseBtn.Parent = TopBar

local CloseCorner = Instance.new("UICorner")
CloseCorner.CornerRadius = UDim.new(1, 0)
CloseCorner.Parent = CloseBtn

CloseBtn.MouseEnter:Connect(function()
    TweenService:Create(CloseBtn, TweenInfo.new(0.15), {BackgroundColor3 = Color3.fromRGB(180, 35, 45), TextColor3 = Color3.fromRGB(255, 255, 255)}):Play()
end)
CloseBtn.MouseLeave:Connect(function()
    TweenService:Create(CloseBtn, TweenInfo.new(0.15), {BackgroundColor3 = Color3.fromRGB(36, 30, 52), TextColor3 = Color3.fromRGB(255, 110, 110)}):Play()
end)

-- Dragging System (ไม่ลากหากคลิกโดนปุ่ม CloseBtn หรือ KeyChip)
local dragging, dragInput, dragStart, startPos
TopBar.InputBegan:Connect(function(input)
    if input.UserInputType == Enum.UserInputType.MouseButton1 or input.UserInputType == Enum.UserInputType.Touch then
        local mPos = input.Position
        local cPos = CloseBtn.AbsolutePosition
        local cSize = CloseBtn.AbsoluteSize
        if mPos.X >= cPos.X and mPos.X <= cPos.X + cSize.X and mPos.Y >= cPos.Y and mPos.Y <= cPos.Y + cSize.Y then
            return
        end
        local kPos = KeyChip.AbsolutePosition
        local kSize = KeyChip.AbsoluteSize
        if mPos.X >= kPos.X and mPos.X <= kPos.X + kSize.X and mPos.Y >= kPos.Y and mPos.Y <= kPos.Y + kSize.Y then
            return
        end
        dragging = true
        dragStart = input.Position
        startPos = Main.Position
        input.Changed:Connect(function()
            if input.UserInputState == Enum.UserInputState.End then
                dragging = false
            end
        end)
    end
end)
TopBar.InputChanged:Connect(function(input)
    if input.UserInputType == Enum.UserInputType.MouseMovement or input.UserInputType == Enum.UserInputType.Touch then
        dragInput = input
    end
end)
UserInputService.InputChanged:Connect(function(input)
    if input == dragInput and dragging then
        local delta = input.Position - dragStart
        Main.Position = UDim2.new(startPos.X.Scale, startPos.X.Offset + delta.X, startPos.Y.Scale, startPos.Y.Offset + delta.Y)
    end
end)

-- Content Frame
local Content = Instance.new("Frame")
Content.Name = "Content"
Content.Size = UDim2.new(1, -20, 1, -56)
Content.Position = UDim2.new(0, 10, 0, 52)
Content.BackgroundTransparency = 1
Content.BorderSizePixel = 0
Content.Parent = Main

local UIList = Instance.new("UIListLayout")
UIList.SortOrder = Enum.SortOrder.LayoutOrder
UIList.Padding = UDim.new(0, 6)
UIList.Parent = Content

-- Helper: Create Standard Card Row with Sticker Image
local function CreateRowCard(name, height, iconAssetId, iconTint, titleText, titleColor)
    local card = Instance.new("Frame")
    card.Name = name
    card.Size = UDim2.new(1, 0, 0, height)
    card.BackgroundColor3 = Color3.fromRGB(22, 19, 34)
    card.BorderSizePixel = 0
    card.Parent = Content

    local cardCorner = Instance.new("UICorner")
    cardCorner.CornerRadius = UDim.new(0, 10)
    cardCorner.Parent = card

    local cardStroke = Instance.new("UIStroke")
    cardStroke.Thickness = 1
    cardStroke.Color = Color3.fromRGB(48, 40, 70)
    cardStroke.Parent = card

    -- Left Sticker Badge
    local iconBadge = Instance.new("Frame")
    iconBadge.Size = UDim2.new(0, 28, 0, 28)
    iconBadge.Position = UDim2.new(0, 8, 0.5, -14)
    iconBadge.BackgroundColor3 = Color3.fromRGB(30, 25, 46)
    iconBadge.BorderSizePixel = 0
    iconBadge.Parent = card

    local ibCorner = Instance.new("UICorner")
    ibCorner.CornerRadius = UDim.new(0, 7)
    ibCorner.Parent = iconBadge

    local ibStroke = Instance.new("UIStroke")
    ibStroke.Thickness = 1
    ibStroke.Color = iconTint or Color3.fromRGB(85, 60, 130)
    ibStroke.Parent = iconBadge

    local iconImg = Instance.new("ImageLabel")
    iconImg.Size = UDim2.new(0, 18, 0, 18)
    iconImg.Position = UDim2.new(0.5, -9, 0.5, -9)
    iconImg.BackgroundTransparency = 1
    iconImg.Image = iconAssetId
    if iconTint then
        iconImg.ImageColor3 = iconTint
    end
    iconImg.ScaleType = Enum.ScaleType.Fit
    iconImg.Parent = iconBadge

    -- Clean Vertically-Centered English Title
    local lbl = Instance.new("TextLabel")
    lbl.Name = "TitleLabel"
    lbl.Size = UDim2.new(0.58, 0, 0, 20)
    lbl.Position = UDim2.new(0, 44, 0.5, -10)
    lbl.BackgroundTransparency = 1
    lbl.Font = Enum.Font.GothamBold
    lbl.Text = titleText
    lbl.TextColor3 = titleColor or Color3.fromRGB(255, 255, 255)
    lbl.TextSize = 13
    lbl.TextXAlignment = Enum.TextXAlignment.Left
    lbl.Parent = card

    return card
end

-- Helper: Create Standard Modern Switch
local function CreateSwitch(parent, onColor)
    local switch = Instance.new("TextButton")
    switch.Name = "Switch"
    switch.Size = UDim2.new(0, 46, 0, 24)
    switch.Position = UDim2.new(1, -54, 0.5, -12)
    switch.BackgroundColor3 = Color3.fromRGB(40, 36, 56)
    switch.BorderSizePixel = 0
    switch.Text = ""
    switch.AutoButtonColor = false
    switch.Parent = parent

    local swCorner = Instance.new("UICorner")
    swCorner.CornerRadius = UDim.new(1, 0)
    swCorner.Parent = switch

    local swStroke = Instance.new("UIStroke")
    swStroke.Thickness = 1
    swStroke.Color = Color3.fromRGB(65, 58, 88)
    swStroke.Parent = switch

    local knob = Instance.new("Frame")
    knob.Name = "Knob"
    knob.Size = UDim2.new(0, 18, 0, 18)
    knob.Position = UDim2.new(0, 3, 0.5, -9)
    knob.BackgroundColor3 = Color3.fromRGB(255, 255, 255)
    knob.BorderSizePixel = 0
    knob.Parent = switch

    local knCorner = Instance.new("UICorner")
    knCorner.CornerRadius = UDim.new(1, 0)
    knCorner.Parent = knob

    local function SetState(val)
        local targetPos = val and UDim2.new(1, -21, 0.5, -9) or UDim2.new(0, 3, 0.5, -9)
        local targetBg = val and onColor or Color3.fromRGB(40, 36, 56)
        local targetStroke = val and onColor or Color3.fromRGB(65, 58, 88)

        TweenService:Create(knob, TweenInfo.new(0.16, Enum.EasingStyle.Quad, Enum.EasingDirection.Out), {Position = targetPos}):Play()
        TweenService:Create(switch, TweenInfo.new(0.16, Enum.EasingStyle.Quad, Enum.EasingDirection.Out), {BackgroundColor3 = targetBg}):Play()
        TweenService:Create(swStroke, TweenInfo.new(0.16, Enum.EasingStyle.Quad, Enum.EasingDirection.Out), {Color = targetStroke}):Play()
    end

    return switch, SetState
end

-- ==========================================================
-- ROW 1: UI Toggle Keybind
-- ==========================================================
local MenuKeyRow = CreateRowCard("MenuKeyRow", 42, "rbxassetid://10734950309", Color3.fromRGB(175, 125, 255), "UI Keybind", Color3.fromRGB(205, 170, 255))
local MenuKeyBtn = Instance.new("TextButton")
MenuKeyBtn.Name = "MenuKeybindBtn"
MenuKeyBtn.Size = UDim2.new(0, 95, 0, 26)
MenuKeyBtn.Position = UDim2.new(1, -103, 0.5, -13)
MenuKeyBtn.BackgroundColor3 = Color3.fromRGB(36, 30, 52)
MenuKeyBtn.BorderSizePixel = 0
MenuKeyBtn.Font = Enum.Font.GothamBold
MenuKeyBtn.Text = "[" .. (getgenv().fAstConfig.MenuKeybind and getgenv().fAstConfig.MenuKeybind.Name or "RightControl") .. "]"
MenuKeyBtn.TextColor3 = Color3.fromRGB(255, 255, 255)
MenuKeyBtn.TextSize = 11.5
MenuKeyBtn.Parent = MenuKeyRow

local MenuKeyCorner = Instance.new("UICorner")
MenuKeyCorner.CornerRadius = UDim.new(0, 6)
MenuKeyCorner.Parent = MenuKeyBtn

local MenuKeyStroke = Instance.new("UIStroke")
MenuKeyStroke.Thickness = 1
MenuKeyStroke.Color = Color3.fromRGB(85, 65, 125)
MenuKeyStroke.Parent = MenuKeyBtn

local listeningMenu = false
local function StartListeningMenuKey()
    if listeningMenu then return end
    listeningMenu = true
    MenuKeyBtn.Text = "[...]"
    MenuKeyBtn.TextColor3 = Color3.fromRGB(255, 215, 0)
    if ChipText then
        ChipText.Text = "[...]"
        ChipText.TextColor3 = Color3.fromRGB(255, 215, 0)
    end

    local connection
    connection = UserInputService.InputBegan:Connect(function(input, processed)
        if input.UserInputType == Enum.UserInputType.Keyboard then
            getgenv().fAstConfig.MenuKeybind = input.KeyCode
            SaveConfig()
            local keyName = input.KeyCode.Name
            MenuKeyBtn.Text = "[" .. keyName .. "]"
            MenuKeyBtn.TextColor3 = Color3.fromRGB(255, 255, 255)
            if ChipText then
                ChipText.Text = "[" .. keyName .. "]"
                ChipText.TextColor3 = Color3.fromRGB(170, 140, 240)
            end
            ShowHUDToast("UI Toggle Key: " .. keyName, Color3.fromRGB(175, 125, 255))
            listeningMenu = false
            connection:Disconnect()
        end
    end)
end

BindClick(MenuKeyBtn, StartListeningMenuKey)

-- ==========================================================
-- ROW 2: Auto Parry Keybind
-- ==========================================================
local KeyRow = CreateRowCard("KeyRow", 42, "rbxassetid://121486627050870", Color3.fromRGB(255, 215, 110), "Parry Keybind", Color3.fromRGB(255, 215, 110))
local KeyBtn = Instance.new("TextButton")
KeyBtn.Name = "KeybindBtn"
KeyBtn.Size = UDim2.new(0, 95, 0, 26)
KeyBtn.Position = UDim2.new(1, -103, 0.5, -13)
KeyBtn.BackgroundColor3 = Color3.fromRGB(36, 30, 52)
KeyBtn.BorderSizePixel = 0
KeyBtn.Font = Enum.Font.GothamBold
KeyBtn.Text = "[" .. getgenv().fAstConfig.ParryKeybind.Name .. "]"
KeyBtn.TextColor3 = Color3.fromRGB(255, 255, 255)
KeyBtn.TextSize = 11.5
KeyBtn.Parent = KeyRow

local KeyBtnCorner = Instance.new("UICorner")
KeyBtnCorner.CornerRadius = UDim.new(0, 6)
KeyBtnCorner.Parent = KeyBtn

local KeyBtnStroke = Instance.new("UIStroke")
KeyBtnStroke.Thickness = 1
KeyBtnStroke.Color = Color3.fromRGB(75, 60, 110)
KeyBtnStroke.Parent = KeyBtn

local listening = false
BindClick(KeyBtn, function()
    if listening then return end
    listening = true
    KeyBtn.Text = "[...]"
    KeyBtn.TextColor3 = Color3.fromRGB(255, 215, 0)

    local connection
    connection = UserInputService.InputBegan:Connect(function(input, processed)
        if input.UserInputType == Enum.UserInputType.Keyboard then
            getgenv().fAstConfig.ParryKeybind = input.KeyCode
            SaveConfig()
            KeyBtn.Text = "[" .. input.KeyCode.Name .. "]"
            KeyBtn.TextColor3 = Color3.fromRGB(255, 255, 255)
            ShowHUDToast("Parry Key: " .. input.KeyCode.Name, Color3.fromRGB(255, 215, 0))
            listening = false
            connection:Disconnect()
        end
    end)
end)

-- ==========================================================
-- ROW 3: Auto Parry
-- ==========================================================
local ParryRow = CreateRowCard("ParryRow", 42, "rbxassetid://7734056608", Color3.fromRGB(185, 120, 255), "Auto Parry", Color3.fromRGB(210, 160, 255))
local ParrySwitch, SetParrySwitchState = CreateSwitch(ParryRow, Color3.fromRGB(150, 70, 255))

local function SetParryState(val)
    getgenv().fAstConfig.AutoParry = val
    SetParrySwitchState(val)
    SaveConfig()
end

BindClick(ParrySwitch, function()
    SetParryState(not getgenv().fAstConfig.AutoParry)
    local txt = getgenv().fAstConfig.AutoParry and "AUTO PARRY: ON" or "AUTO PARRY: OFF"
    local col = getgenv().fAstConfig.AutoParry and Color3.fromRGB(50, 255, 120) or Color3.fromRGB(255, 70, 70)
    ShowHUDToast(txt, col)
end)

-- ==========================================================
-- ROW 3: Target Boss Selector (Dropdown)
-- ==========================================================
local BossRow = CreateRowCard("BossRow", 42, "rbxassetid://10734975486", Color3.fromRGB(255, 185, 75), "Target Boss", Color3.fromRGB(255, 185, 75))
BossRow.ClipsDescendants = true

local BossBtn = Instance.new("TextButton")
BossBtn.Name = "BossSelectBtn"
BossBtn.Size = UDim2.new(0, 130, 0, 28)
BossBtn.Position = UDim2.new(1, -138, 0, 7)
BossBtn.BackgroundColor3 = Color3.fromRGB(36, 30, 54)
BossBtn.BorderSizePixel = 0
BossBtn.Font = Enum.Font.GothamBold
BossBtn.Text = BossList[currentBossIndex].Display .. "  v"
BossBtn.TextColor3 = Color3.fromRGB(255, 215, 110)
BossBtn.TextSize = 11.5
BossBtn.Parent = BossRow

local BossBtnCorner = Instance.new("UICorner")
BossBtnCorner.CornerRadius = UDim.new(0, 6)
BossBtnCorner.Parent = BossBtn

local BossBtnStroke = Instance.new("UIStroke")
BossBtnStroke.Thickness = 1
BossBtnStroke.Color = Color3.fromRGB(85, 65, 125)
BossBtnStroke.Parent = BossBtn

local DropdownContainer = Instance.new("Frame")
DropdownContainer.Name = "DropdownContainer"
DropdownContainer.Size = UDim2.new(1, -16, 0, #BossList * 27 + 6)
DropdownContainer.Position = UDim2.new(0, 8, 0, 40)
DropdownContainer.BackgroundColor3 = Color3.fromRGB(15, 13, 22)
DropdownContainer.BorderSizePixel = 0
DropdownContainer.Visible = false
DropdownContainer.ClipsDescendants = true
DropdownContainer.Parent = BossRow

local DropdownCorner = Instance.new("UICorner")
DropdownCorner.CornerRadius = UDim.new(0, 8)
DropdownCorner.Parent = DropdownContainer

local DropdownStroke = Instance.new("UIStroke")
DropdownStroke.Thickness = 1.2
DropdownStroke.Color = Color3.fromRGB(130, 65, 220)
DropdownStroke.Parent = DropdownContainer

local DropdownLayout = Instance.new("UIListLayout")
DropdownLayout.SortOrder = Enum.SortOrder.LayoutOrder
DropdownLayout.Padding = UDim.new(0, 2)
DropdownLayout.Parent = DropdownContainer

local DropdownPadding = Instance.new("UIPadding")
DropdownPadding.PaddingTop = UDim.new(0, 3)
DropdownPadding.PaddingBottom = UDim.new(0, 3)
DropdownPadding.PaddingLeft = UDim.new(0, 4)
DropdownPadding.PaddingRight = UDim.new(0, 4)
DropdownPadding.Parent = DropdownContainer

local isDropdownOpen = false
local dropdownItemBtns = {}

local function UpdateDropdownItems()
    for _, btn in ipairs(dropdownItemBtns) do
        local bDisplay = btn:GetAttribute("BossDisplay")
        if bDisplay == getgenv().fAstConfig.SelectedBoss then
            btn.BackgroundColor3 = Color3.fromRGB(75, 35, 130)
            btn.TextColor3 = Color3.fromRGB(255, 230, 120)
            btn.Text = "  > " .. bDisplay
        else
            btn.BackgroundColor3 = Color3.fromRGB(24, 20, 34)
            btn.TextColor3 = Color3.fromRGB(195, 190, 215)
            btn.Text = "     " .. bDisplay
        end
    end
end

local ToggleDiffDropdown = nil

local function ToggleDropdown(forceClose)
    if forceClose then
        isDropdownOpen = false
    else
        isDropdownOpen = not isDropdownOpen
        if isDropdownOpen and ToggleDiffDropdown then
            ToggleDiffDropdown(true)
        end
    end

    local expandedRowH = 42 + (#BossList * 27 + 8)
    local targetRowH = isDropdownOpen and expandedRowH or 42
    local targetMainH = isDropdownOpen and (440 + (#BossList * 27 + 8)) or 440
    local arrow = isDropdownOpen and "  ^" or "  v"

    BossBtn.Text = getgenv().fAstConfig.SelectedBoss .. arrow

    if isDropdownOpen then
        DropdownContainer.Visible = true
        UpdateDropdownItems()
    end

    TweenService:Create(BossRow, TweenInfo.new(0.2, Enum.EasingStyle.Quad, Enum.EasingDirection.Out), {Size = UDim2.new(1, 0, 0, targetRowH)}):Play()
    TweenService:Create(Main, TweenInfo.new(0.2, Enum.EasingStyle.Quad, Enum.EasingDirection.Out), {Size = UDim2.new(0, 338, 0, targetMainH)}):Play()

    if not isDropdownOpen then
        task.delay(0.2, function()
            if not isDropdownOpen then
                DropdownContainer.Visible = false
            end
        end)
    end
end

for idx, b in ipairs(BossList) do
    local ItemBtn = Instance.new("TextButton")
    ItemBtn.Name = "Item_" .. b.Id
    ItemBtn.Size = UDim2.new(1, 0, 0, 25)
    ItemBtn.BackgroundColor3 = Color3.fromRGB(24, 20, 34)
    ItemBtn.BorderSizePixel = 0
    ItemBtn.Font = Enum.Font.GothamSemibold
    ItemBtn.Text = "     " .. b.Display
    ItemBtn.TextColor3 = Color3.fromRGB(195, 190, 215)
    ItemBtn.TextSize = 11.5
    ItemBtn.TextXAlignment = Enum.TextXAlignment.Left
    ItemBtn:SetAttribute("BossDisplay", b.Display)
    ItemBtn.Parent = DropdownContainer

    local ItemCorner = Instance.new("UICorner")
    ItemCorner.CornerRadius = UDim.new(0, 5)
    ItemCorner.Parent = ItemBtn

    table.insert(dropdownItemBtns, ItemBtn)

    BindClick(ItemBtn, function()
        currentBossIndex = idx
        getgenv().fAstConfig.SelectedBoss = b.Display
        getgenv().fAstConfig.SelectedBossId = b.Id
        SaveConfig()
        ShowHUDToast("Selected: " .. b.Display, Color3.fromRGB(255, 185, 75))
        ToggleDropdown(true)
        if getgenv().fAstConfig.AutoBoss then
            StartBossFightNow()
        end
    end)
end

BindClick(BossBtn, function()
    ToggleDropdown()
end)

-- ==========================================================
-- ROW 4: Boss Difficulty Selector (Dropdown)
-- ==========================================================
local DiffRow = CreateRowCard("DiffRow", 42, "rbxassetid://10709791437", Color3.fromRGB(255, 95, 95), "Difficulty", Color3.fromRGB(255, 125, 125))
DiffRow.ClipsDescendants = true

local DiffBtn = Instance.new("TextButton")
DiffBtn.Name = "DiffSelectBtn"
DiffBtn.Size = UDim2.new(0, 130, 0, 28)
DiffBtn.Position = UDim2.new(1, -138, 0, 7)
DiffBtn.BackgroundColor3 = Color3.fromRGB(36, 30, 54)
DiffBtn.BorderSizePixel = 0
DiffBtn.Font = Enum.Font.GothamBold
DiffBtn.Text = (DifficultyList[currentDiffIndex] and DifficultyList[currentDiffIndex].Display or "Auto (Max)") .. "  v"
DiffBtn.TextColor3 = Color3.fromRGB(255, 145, 145)
DiffBtn.TextSize = 11.5
DiffBtn.Parent = DiffRow

local DiffBtnCorner = Instance.new("UICorner")
DiffBtnCorner.CornerRadius = UDim.new(0, 6)
DiffBtnCorner.Parent = DiffBtn

local DiffBtnStroke = Instance.new("UIStroke")
DiffBtnStroke.Thickness = 1
DiffBtnStroke.Color = Color3.fromRGB(115, 55, 85)
DiffBtnStroke.Parent = DiffBtn

local DiffDropdownContainer = Instance.new("Frame")
DiffDropdownContainer.Name = "DiffDropdownContainer"
DiffDropdownContainer.Size = UDim2.new(1, -16, 0, #DifficultyList * 27 + 6)
DiffDropdownContainer.Position = UDim2.new(0, 8, 0, 40)
DiffDropdownContainer.BackgroundColor3 = Color3.fromRGB(15, 13, 22)
DiffDropdownContainer.BorderSizePixel = 0
DiffDropdownContainer.Visible = false
DiffDropdownContainer.ClipsDescendants = true
DiffDropdownContainer.Parent = DiffRow

local DiffDropdownCorner = Instance.new("UICorner")
DiffDropdownCorner.CornerRadius = UDim.new(0, 8)
DiffDropdownCorner.Parent = DiffDropdownContainer

local DiffDropdownStroke = Instance.new("UIStroke")
DiffDropdownStroke.Thickness = 1.2
DiffDropdownStroke.Color = Color3.fromRGB(220, 65, 95)
DiffDropdownStroke.Parent = DiffDropdownContainer

local DiffDropdownLayout = Instance.new("UIListLayout")
DiffDropdownLayout.SortOrder = Enum.SortOrder.LayoutOrder
DiffDropdownLayout.Padding = UDim.new(0, 2)
DiffDropdownLayout.Parent = DiffDropdownContainer

local DiffDropdownPadding = Instance.new("UIPadding")
DiffDropdownPadding.PaddingTop = UDim.new(0, 3)
DiffDropdownPadding.PaddingBottom = UDim.new(0, 3)
DiffDropdownPadding.PaddingLeft = UDim.new(0, 4)
DiffDropdownPadding.PaddingRight = UDim.new(0, 4)
DiffDropdownPadding.Parent = DiffDropdownContainer

local isDiffDropdownOpen = false
local diffDropdownItemBtns = {}

local function UpdateDiffDropdownItems()
    for _, btn in ipairs(diffDropdownItemBtns) do
        local dDisplay = btn:GetAttribute("DiffDisplay")
        if dDisplay == getgenv().fAstConfig.SelectedDifficulty then
            btn.BackgroundColor3 = Color3.fromRGB(130, 35, 65)
            btn.TextColor3 = Color3.fromRGB(255, 230, 120)
            btn.Text = "  > " .. dDisplay
        else
            btn.BackgroundColor3 = Color3.fromRGB(24, 20, 34)
            btn.TextColor3 = Color3.fromRGB(215, 190, 205)
            btn.Text = "     " .. dDisplay
        end
    end
end

ToggleDiffDropdown = function(forceClose)
    if forceClose then
        isDiffDropdownOpen = false
    else
        isDiffDropdownOpen = not isDiffDropdownOpen
        if isDiffDropdownOpen then
            ToggleDropdown(true)
        end
    end

    local expandedRowH = 42 + (#DifficultyList * 27 + 8)
    local targetRowH = isDiffDropdownOpen and expandedRowH or 42
    local targetMainH = isDiffDropdownOpen and (440 + (#DifficultyList * 27 + 8)) or 440
    local arrow = isDiffDropdownOpen and "  ^" or "  v"

    DiffBtn.Text = getgenv().fAstConfig.SelectedDifficulty .. arrow

    if isDiffDropdownOpen then
        DiffDropdownContainer.Visible = true
        UpdateDiffDropdownItems()
    end

    TweenService:Create(DiffRow, TweenInfo.new(0.2, Enum.EasingStyle.Quad, Enum.EasingDirection.Out), {Size = UDim2.new(1, 0, 0, targetRowH)}):Play()
    TweenService:Create(Main, TweenInfo.new(0.2, Enum.EasingStyle.Quad, Enum.EasingDirection.Out), {Size = UDim2.new(0, 338, 0, targetMainH)}):Play()

    if not isDiffDropdownOpen then
        task.delay(0.2, function()
            if not isDiffDropdownOpen then
                DiffDropdownContainer.Visible = false
            end
        end)
    end
end

for idx, d in ipairs(DifficultyList) do
    local ItemBtn = Instance.new("TextButton")
    ItemBtn.Name = "DiffItem_" .. d.Id
    ItemBtn.Size = UDim2.new(1, 0, 0, 25)
    ItemBtn.BackgroundColor3 = Color3.fromRGB(24, 20, 34)
    ItemBtn.BorderSizePixel = 0
    ItemBtn.Font = Enum.Font.GothamSemibold
    ItemBtn.Text = "     " .. d.Display
    ItemBtn.TextColor3 = Color3.fromRGB(215, 190, 205)
    ItemBtn.TextSize = 11.5
    ItemBtn.TextXAlignment = Enum.TextXAlignment.Left
    ItemBtn:SetAttribute("DiffDisplay", d.Display)
    ItemBtn.Parent = DiffDropdownContainer

    local ItemCorner = Instance.new("UICorner")
    ItemCorner.CornerRadius = UDim.new(0, 5)
    ItemCorner.Parent = ItemBtn

    table.insert(diffDropdownItemBtns, ItemBtn)

    BindClick(ItemBtn, function()
        currentDiffIndex = idx
        getgenv().fAstConfig.SelectedDifficulty = d.Display
        getgenv().fAstConfig.SelectedDifficultyId = d.Id
        SaveConfig()
        ShowHUDToast("Difficulty: " .. d.Display, Color3.fromRGB(255, 115, 115))
        ToggleDiffDropdown(true)
        if getgenv().fAstConfig.AutoBoss then
            StartBossFightNow()
        end
    end)
end

BindClick(DiffBtn, function()
    ToggleDiffDropdown()
end)

-- ==========================================================
-- ROW 4: Auto Boss
-- ==========================================================
local BossFightRow = CreateRowCard("BossFightRow", 42, "rbxassetid://10734975692", Color3.fromRGB(255, 125, 40), "Auto Boss", Color3.fromRGB(255, 140, 50))
local BossSwitch, SetBossSwitchState = CreateSwitch(BossFightRow, Color3.fromRGB(255, 125, 40))

-- คืนค่า RequestStartFight ดั้งเดิมเพื่อให้รับ arguments ครบทุกตัว
pcall(function()
    local ep = GameManager:GetController("EventProgressController")
    if ep and ep._origRequestStartFight then
        ep.RequestStartFight = ep._origRequestStartFight
    end
end)

local isStartingBossFight = false

local function IsInActiveFight()
    if IsInLobby() then return false end
    local char = LocalPlayer.Character or workspace:FindFirstChild("Player") or workspace:FindFirstChild("Player_Client")
    if not char then return false end
    if char:GetAttribute("InSafeZone") == true then
        return false
    end
    local targetBoss = FindBossTarget(getgenv().fAstConfig and getgenv().fAstConfig.SelectedBoss or "Auto (Any)")
    if targetBoss and IsBossAlive(targetBoss) then
        return true
    end
    return false
end

local function StartBossFightNow()
    if isStartingBossFight then return end
    if IsInActiveFight() then
        return
    end

    isStartingBossFight = true
    task.spawn(function()
        pcall(function()
            -- 1. หากไม่ได้อยู่ในห้องฮับฮาโลวีน (PlaceId 105077286193224) ให้ออกจากสนามหรือวาร์ปเข้าฮับ
            if game.PlaceId ~= 105077286193224 then
                ShowHUDToast("กำลังวาร์ปไปฮับฮาโลวีนเพื่อสู้บอส...", Color3.fromRGB(255, 180, 50))
                local eh = ReplicatedStorage:FindFirstChild("Remotes") and ReplicatedStorage.Remotes:FindFirstChild("EventHub")
                if eh and eh:FindFirstChild("Request_TravelToEventHub") then
                    eh.Request_TravelToEventHub:FireServer()
                else
                    pcall(function()
                        game:GetService("TeleportService"):Teleport(105077286193224)
                    end)
                end
                return
            end

            -- 2. หากยังค้างหน้าผลการต่อสู้เก่า ให้กดออกหรือปิดหน้าผล
            local pgui = LocalPlayer:FindFirstChild("PlayerGui")
            local rGui = pgui and pgui:FindFirstChild("MiniBossResultsGui")
            if rGui and rGui.Enabled then
                LeaveFinishedArenaOnce()
                task.wait(0.5)
            end

            if IsInActiveFight() then return end

            isReturningLobby = false
            local bId = getgenv().fAstConfig.SelectedBossId or "Shogun"
            if bId == "Any" or not bId then bId = "Shogun" end

            -- จุดคบเพลิง/ปลดล็อคหลุมศพให้อัตโนมัติถ้ายังไม่ได้จุด (สำหรับ The Headless Shogun และบอสตัวอื่น)
            pcall(function()
                local ep = GameManager:GetController("EventProgressController")
                if ep and ep.State and ep.State.Graves and ep.State.Graves[bId] and not ep.State.Graves[bId].Lit then
                    local epRemotes = ReplicatedStorage:FindFirstChild("Remotes") and ReplicatedStorage.Remotes:FindFirstChild("EventProgress")
                    if epRemotes and epRemotes:FindFirstChild("Request_LightLantern") then
                        epRemotes.Request_LightLantern:FireServer(bId)
                    end
                end
            end)

            local targetDiff = GetResolvedDifficulty(bId)
            ShowHUDToast("กำลังวาร์ปเข้าสู้บอส " .. bId .. " [" .. targetDiff .. "]...", Color3.fromRGB(255, 180, 50))

            -- 3. เรียกเริ่มสู้บอสผ่าน EventProgressController ตามระดับความยากที่เลือก
            local ep = GameManager:GetController("EventProgressController")
            if ep and ep.RequestStartFight then
                ep:RequestStartFight(bId, targetDiff)
            end

            -- ยิงตรงสำรองผ่าน RemoteEvent
            local epRemotes = ReplicatedStorage:FindFirstChild("Remotes") and ReplicatedStorage.Remotes:FindFirstChild("EventProgress")
            if epRemotes and epRemotes:FindFirstChild("Request_StartFight") then
                epRemotes.Request_StartFight:FireServer(bId, targetDiff)
            end

            -- หากมีหน้าต่าง MiniBossStartGui เด้งขึ้นมา ให้เลือกความยากและกดยืนยันอัตโนมัติ
            pcall(function()
                local pgui = LocalPlayer:FindFirstChild("PlayerGui")
                local sGui = pgui and pgui:FindFirstChild("MiniBossStartGui")
                if sGui and sGui.Enabled then
                    local stage = sGui:FindFirstChild("Screen") and sGui.Screen:FindFirstChild("Stage")
                    local col = stage and stage:FindFirstChild("Column")
                    local diffs = col and col:FindFirstChild("Difficulties")
                    local targetBtn = diffs and diffs:FindFirstChild(targetDiff)
                    if targetBtn and getconnections then
                        for _, c in ipairs(getconnections(targetBtn.Activated)) do
                            c:Fire()
                        end
                    end
                    local fightBtn = col and col:FindFirstChild("FightButton")
                    if fightBtn and getconnections then
                        for _, c in ipairs(getconnections(fightBtn.Activated)) do
                            c:Fire()
                        end
                    end
                end
            end)
        end)
        task.wait(2.0)
        isStartingBossFight = false
    end)
end

local function SetBossFightState(val)
    getgenv().fAstConfig.AutoBoss = val
    SetBossSwitchState(val)
    SaveConfig()
    if val then
        StartBossFightNow()
    else
        hadBossFighting = false
        snappedFrames = 0
        local handler = CharacterController:GetLocalCharacterHandler()
        HardStopAllAttacks(handler)
    end
end

-- ลูปตรวจสอบเข้าสู้บอสอัตโนมัติเมื่ออยู่นอกการต่อสู้ (Auto Re-Queue Boss Fight)
task.spawn(function()
    while getgenv()._fAstRunToken == myRunToken do
        task.wait(2.0)
        if getgenv()._fAstRunToken ~= myRunToken then break end
        if getgenv().fAstConfig and getgenv().fAstConfig.AutoBoss then
            local char = LocalPlayer.Character
            local myRoot = GetMyRoot()
            local handler = CharacterController:GetLocalCharacterHandler()
            local myHum = (handler and handler.Humanoid) or (char and char:FindFirstChildOfClass("Humanoid"))
            if not IsInActiveFight() and myRoot and myHum and myHum.Health > 0 and not isReturningLobby then
                StartBossFightNow()
                task.wait(4.0)
            end
        end
    end
end)

BindClick(BossSwitch, function()
    SetBossFightState(not getgenv().fAstConfig.AutoBoss)
    local txt = getgenv().fAstConfig.AutoBoss and "BOSS BOT: ON" or "BOSS BOT: OFF"
    local col = getgenv().fAstConfig.AutoBoss and Color3.fromRGB(255, 140, 50) or Color3.fromRGB(255, 70, 70)
    ShowHUDToast(txt, col)
end)

-- ==========================================================
-- ROW 5: Auto Return Lobby
-- ==========================================================
local ReturnRow = CreateRowCard("ReturnRow", 42, "rbxassetid://76916186329249", Color3.fromRGB(45, 215, 125), "Auto Return Lobby", Color3.fromRGB(60, 230, 140))
local ReturnSwitch, SetReturnSwitchState = CreateSwitch(ReturnRow, Color3.fromRGB(45, 215, 125))

local function SetReturnLobbyState(val)
    getgenv().fAstConfig.AutoReturnLobby = val
    SetReturnSwitchState(val)
    SaveConfig()
end

BindClick(ReturnSwitch, function()
    SetReturnLobbyState(not getgenv().fAstConfig.AutoReturnLobby)
    local txt = getgenv().fAstConfig.AutoReturnLobby and "AUTO RETURN: ON" or "AUTO RETURN: OFF"
    local col = getgenv().fAstConfig.AutoReturnLobby and Color3.fromRGB(50, 255, 120) or Color3.fromRGB(255, 70, 70)
    ShowHUDToast(txt, col)
end)

-- ==========================================================
-- ROW 6: Auto Claim Rewards
-- ==========================================================
local RewardsRow = CreateRowCard("RewardsRow", 42, "rbxassetid://82668203286354", Color3.fromRGB(255, 105, 185), "Auto Claim Rewards", Color3.fromRGB(255, 105, 185))
local RewardsSwitch, SetRewardsSwitchState = CreateSwitch(RewardsRow, Color3.fromRGB(255, 75, 175))

local function SetClaimRewardsState(val)
    getgenv().fAstConfig.AutoClaimRewards = val
    SetRewardsSwitchState(val)
    SaveConfig()
    if val then
        ClaimAllRewards(false)
    end
end

BindClick(RewardsSwitch, function()
    SetClaimRewardsState(not getgenv().fAstConfig.AutoClaimRewards)
    local txt = getgenv().fAstConfig.AutoClaimRewards and "AUTO REWARDS: ON" or "AUTO REWARDS: OFF"
    local col = getgenv().fAstConfig.AutoClaimRewards and Color3.fromRGB(255, 105, 185) or Color3.fromRGB(255, 70, 70)
    ShowHUDToast(txt, col)
end)

-- คืนค่าสถานะสวิตช์และระบบตามที่บันทึกไว้ใน config (จดจำฟังก์ชันที่เปิดไว้ 100%)
SetParrySwitchState(getgenv().fAstConfig.AutoParry)
SetBossSwitchState(getgenv().fAstConfig.AutoBoss)
SetReturnSwitchState(getgenv().fAstConfig.AutoReturnLobby)
SetRewardsSwitchState(getgenv().fAstConfig.AutoClaimRewards)

-- หากฟังก์ชันไหนเปิดค้างไว้ ให้เริ่มทำงานทันที
if getgenv().fAstConfig.AutoBoss then
    task.spawn(function()
        task.wait(1.0)
        if getgenv().fAstConfig and getgenv().fAstConfig.AutoBoss and not IsInActiveFight() then
            StartBossFightNow()
        end
    end)
end
if getgenv().fAstConfig.AutoClaimRewards then
    ClaimAllRewards(true)
end

-- ==========================================================
-- 9. FLOATING TOGGLE BUTTON (รองรับหน้าจอมือถือ & ตัวรัน Delta)
-- ==========================================================
local isMobile = UserInputService.TouchEnabled

local FloatingToggle = Instance.new("TextButton")
FloatingToggle.Name = "FloatingToggle"
FloatingToggle.Size = UDim2.new(0, 38, 0, 38)
FloatingToggle.Position = UDim2.new(0.02, 0, 0.22, 0)
FloatingToggle.BackgroundColor3 = Color3.fromRGB(22, 17, 36)
FloatingToggle.BackgroundTransparency = 0.45
FloatingToggle.BorderSizePixel = 0
FloatingToggle.Font = Enum.Font.GothamBold
FloatingToggle.Text = "⚡"
FloatingToggle.TextColor3 = Color3.fromRGB(255, 205, 75)
FloatingToggle.TextTransparency = 0.3
FloatingToggle.TextSize = 18
FloatingToggle.AutoButtonColor = false
FloatingToggle.ZIndex = 99999
FloatingToggle.Active = true
FloatingToggle.Parent = ScreenGui

local ftCorner = Instance.new("UICorner")
ftCorner.CornerRadius = UDim.new(1, 0)
ftCorner.Parent = FloatingToggle

local ftStroke = Instance.new("UIStroke")
ftStroke.Thickness = 1.6
ftStroke.Color = Color3.fromRGB(165, 85, 255)
ftStroke.Transparency = 0.45
ftStroke.ApplyStrokeMode = Enum.ApplyStrokeMode.Border
ftStroke.Parent = FloatingToggle

-- ระบบลากปุ่มลอยอิสระ (Drag Anywhere) รองรับทั้ง Touch บน Delta และ Mouse บน PC
local ftDragging = false
local ftDragStart = nil
local ftStartPos = nil
local ftWasDragged = false

FloatingToggle.InputBegan:Connect(function(input)
    if input.UserInputType == Enum.UserInputType.MouseButton1 or input.UserInputType == Enum.UserInputType.Touch then
        ftDragging = true
        ftWasDragged = false
        ftDragStart = input.Position
        ftStartPos = FloatingToggle.Position

        local conn
        conn = input.Changed:Connect(function()
            if input.UserInputState == Enum.UserInputState.End then
                ftDragging = false
                if conn then conn:Disconnect() end
            end
        end)
    end
end)

UserInputService.InputChanged:Connect(function(input)
    if ftDragging and (input.UserInputType == Enum.UserInputType.MouseMovement or input.UserInputType == Enum.UserInputType.Touch) then
        local delta = input.Position - ftDragStart
        if delta.Magnitude > 6 then
            ftWasDragged = true
        end
        FloatingToggle.Position = UDim2.new(
            ftStartPos.X.Scale,
            ftStartPos.X.Offset + delta.X,
            ftStartPos.Y.Scale,
            ftStartPos.Y.Offset + delta.Y
        )
    end
end)

-- Menu Visibility Controls
function ToggleVisibility()
    Main.Visible = not Main.Visible
    if not Main.Visible then
        ToggleDropdown(true)
        FloatingToggle.BackgroundTransparency = 0
        ftStroke.Transparency = 0
        FloatingToggle.TextTransparency = 0
    else
        FloatingToggle.BackgroundTransparency = 0.45
        ftStroke.Transparency = 0.45
        FloatingToggle.TextTransparency = 0.3
        pcall(function()
            UserInputService.MouseBehavior = Enum.MouseBehavior.Default
        end)
    end
end

BindClick(FloatingToggle, function()
    if not ftWasDragged then
        ToggleVisibility()
    end
    ftWasDragged = false
end)

local function CloseMenu()
    Main.Visible = false
    FloatingToggle.BackgroundTransparency = 0
    ftStroke.Transparency = 0
    FloatingToggle.TextTransparency = 0
    ToggleDropdown(true)
end

BindClick(CloseBtn, CloseMenu)
BindClick(KeyChip, ToggleVisibility)

-- Keybind Listeners (สำหรับ PC และคีย์บอร์ดที่ต่อกับมือถือ)
if getgenv()._fAstInputConn then
    pcall(function() getgenv()._fAstInputConn:Disconnect() end)
    getgenv()._fAstInputConn = nil
end
getgenv()._fAstInputConn = UserInputService.InputBegan:Connect(function(input, processed)
    local targetMenuKey = getgenv().fAstConfig and getgenv().fAstConfig.MenuKeybind or Enum.KeyCode.RightControl
    if input.KeyCode == targetMenuKey 
       or input.KeyCode == Enum.KeyCode.RightControl 
       or input.KeyCode == Enum.KeyCode.Insert 
       or input.KeyCode == Enum.KeyCode.RightAlt then
        ToggleVisibility()
        return
    end

    if processed then return end

    if input.KeyCode == (getgenv().fAstConfig and getgenv().fAstConfig.ParryKeybind) then
        SetParryState(not getgenv().fAstConfig.AutoParry)
        local statusText = getgenv().fAstConfig.AutoParry and "AUTO PARRY: ON" or "AUTO PARRY: OFF"
        local statusColor = getgenv().fAstConfig.AutoParry and Color3.fromRGB(50, 255, 120) or Color3.fromRGB(255, 70, 70)
        ShowHUDToast(statusText, statusColor)
    end
end)

local startKeyName = getgenv().fAstConfig and getgenv().fAstConfig.MenuKeybind and getgenv().fAstConfig.MenuKeybind.Name or "RightControl"
if isMobile then
    ShowHUDToast("⚡ fAst Hub พร้อมใช้งาน (แตะไอคอน ⚡ เพื่อเปิด/ปิดเมนู)", Color3.fromRGB(170, 90, 255))
else
    ShowHUDToast("⚡ fAst Hub พร้อมใช้งาน (กด [" .. startKeyName .. "] หรือคลิก ⚡ เพื่อเปิดเมนู)", Color3.fromRGB(170, 90, 255))
end
print("[cook45] fAst Hub V10 (Mobile & Delta Cross-Platform Edition) Active!")
print("[cook45] fAst Hub V10 (Modern Cyber Glass UI + Auto Rewards) Active!")
