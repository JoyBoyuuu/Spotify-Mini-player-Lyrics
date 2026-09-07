# Spotify Mini Player Lyrics

[English version guide](./README.md) | **中文導覽**

在 Windows 版 Spotify 原生迷你播放器中，顯示同步歌詞與可選的繁體中文翻譯。

精簡的半透明歌詞框會疊在專輯圖片上，顯示目前與前後歌詞，並跟隨播放進度及拖曳時間軸同步更新。

> **安裝完成後，直接開啟 Spotify 播放音樂即可。** PowerShell 可以關掉；一般使用不需要 Node.js、npm，也不需要另外執行背景程式。

## 快速導覽

- [安裝擴充功能](#安裝)
- [迷你播放器操作](#迷你播放器操作)
- [更新版本](#更新)
- [設定繁體中文翻譯](#選用繁體中文翻譯)
- [常見問題](#常見問題)
- [修改原始碼](#開發者說明)

## 使用需求

- Windows 與 Spotify 桌面版
- 已安裝並可正常使用的 [Spicetify](https://spicetify.app/docs/getting-started)
- 可連線至歌詞來源的網路

如果尚未安裝 Spicetify，請先依官方指南完成設定。設定前先開啟 Spotify 並登入帳號。

原文歌詞不需要翻譯代理服務；繁中翻譯需要完成下方的[選用設定](#選用繁體中文翻譯)。

## 安裝

### 1. 下載檔案

開啟 [miniLyrics.js](./miniLyrics.js)，點擊檔案工具列的 **Download raw file**（下載原始檔案）。

請儲存成 `miniLyrics.js`，不需要手動複製程式碼，也不要把整個 GitHub 網頁另存成 HTML。

一般使用只需要這一個檔案，不需要下載或 clone 整個專案。

### 2. 放進 Extensions 資料夾

按 **Win + R**，貼上下列路徑並按 Enter：

```text
%APPDATA%\spicetify\Extensions
```

把下載的 `miniLyrics.js` 複製進去。如果出現同名檔案提示，選擇取代。

如果資料夾不存在，先開啟 `%APPDATA%\spicetify`，再建立名為 `Extensions` 的資料夾。如果連 Spicetify 資料夾都不存在，請先完成 Spicetify 安裝。

檔名必須是 `miniLyrics.js`，不能是 `miniLyrics.js.txt` 或 `miniLyrics (1).js`。可在檔案總管開啟「副檔名」顯示來確認。

### 3. 啟用擴充功能

開啟 PowerShell，貼上下列指令並執行：

```powershell
spicetify config extensions miniLyrics.js
spicetify apply
```

這兩行可在任何資料夾執行。只複製指令，不要一起複製 `PS C:\...` 之類的終端機提示字元。

如果以前啟用過 `miniLyricsV18.js` 等舊版檔案，也要[停用舊項目](#仍顯示舊版效果或出現兩個歌詞框)。

### 4. 開啟迷你播放器

在 Spotify 播放歌曲，再使用播放區域的 Mini Player 按鈕開啟原生迷你播放器。套用後若沒有出現效果，可先關閉再重新開啟 Spotify。

找到相符的同步歌詞後就會自動顯示，此時可以關閉 PowerShell。

本擴充功能是在 Spotify 既有的迷你播放器中加入歌詞，不會另外建立獨立的桌面播放器。

## 迷你播放器操作

| 控制項 | 功能 |
| --- | --- |
| 右上角短線 | 將歌詞收合成小膠囊；再點膠囊即可展開。 |
| 左上角「譯」 | 開關翻譯。較亮表示啟用，較暗表示停用；需先設定翻譯服務。 |
| 游標停留在歌詞上兩秒 | 淡出歌詞框，讓底下的播放控制更清楚。 |
| 游標離開歌詞區 | 恢復歌詞框。 |

收合與翻譯設定會被記住，換歌或重新開啟迷你播放器後仍然有效。

歌詞會隨播放捲動，支援多行顯示，拖曳時間軸也會同步更新。找不到同步歌詞或資料無法使用時，會顯示置中的口語提示與單色像素小貓；如果系統啟用減少動態效果，小貓會保持靜止。

## 更新

一般使用者只需：

1. 使用 **Download raw file** 下載最新版 [miniLyrics.js](./miniLyrics.js)。
2. 取代 `%APPDATA%\spicetify\Extensions` 裡的同名檔案。
3. 在 PowerShell 執行：

   ```powershell
   spicetify apply
   ```

4. 如果效果沒有更新，重新開啟 Spotify。

不需要重新啟用相同檔名，也不需要執行 `npm run verify`。只更新「下載」資料夾裡的檔案，不會更新 Spicetify 實際載入的版本。

### Spotify 更新後

Spotify 更新可能覆蓋 Spicetify 套用的修改。如果擴充功能消失，請依照下方的[修復步驟](#spicetify-自訂效果消失或-apply-失敗)處理。

## 選用繁體中文翻譯

原文歌詞來自 [LRCLIB](https://lrclib.net/)；翻譯使用網易雲音樂既有的翻譯歌詞，再透過 OpenCC 轉為繁體中文。

所有非中文歌詞都會嘗試翻譯，包含英文歌。網站有整行翻譯時會優先採用；混合語言若拆成多個片段，則依序組合翻譯，並保留屬於該行、但尚未翻譯的英文片段。

這不是機器翻譯服務，部分歌曲或句子可能沒有可用翻譯。沒有翻譯時，原文歌詞仍會保留。

### 1. 部署專案附帶的代理服務

Spotify 受到瀏覽器 CORS 限制，無法直接請求網易雲歌詞，因此需要 Cloudflare 帳號與你自己的 Cloudflare Worker：

1. 開啟 [netease-cors-worker.js](./netease-cors-worker.js)，複製完整內容。
2. 在 Cloudflare 的 Workers 管理頁建立 Worker。
3. 用該檔案內容取代預設程式碼，然後部署。
4. 複製部署後的 HTTPS 網址，例如 `https://YOUR-WORKER.workers.dev/`。

Worker 是獨立部署的服務，不要放進 Spicetify 的 Extensions 資料夾。它只允許請求本擴充功能使用的網易雲主機及歌詞／搜尋端點。

### 2. 開啟 Spotify 開發者工具

在 PowerShell 執行：

```powershell
spicetify enable-devtools
spicetify apply
```

必要時重新開啟 Spotify，再按 **Ctrl + Shift + I**，切換至 **Console** 分頁。

### 3. 儲存代理網址

在 **Spotify 開發者工具的 Console** 貼上下列程式碼，不是在 PowerShell 執行。將範例網址換成你的 Worker 網址，並保留結尾的 `?url=`：

```javascript
localStorage.setItem(
  "miniLyrics.neteaseProxy",
  "https://YOUR-WORKER.workers.dev/?url="
);
```

在同一個 Console 檢查儲存結果：

```javascript
localStorage.getItem("miniLyrics.neteaseProxy");
```

應回傳包含 `?url=` 的完整網址。重新載入 Spotify，並確認「譯」按鈕已啟用。

此時可以關閉開發者工具。這個設定只需要做一次，或在 Worker 網址改變時重新設定。

翻譯會在背景載入，可能比原文晚幾秒出現。成功配對的結果會快取在本機，且只有目前播放的歌詞行會顯示翻譯。

## 常見問題

### 完全沒有出現

先在 PowerShell 檢查檔案與啟用狀態：

```powershell
Test-Path "$env:APPDATA\spicetify\Extensions\miniLyrics.js"
spicetify config extensions
```

第一行應回傳 `True`；第二行結果應包含 `miniLyrics.js`。

- 檔案不存在：重新做安裝步驟 2。
- 檔名未啟用：重新做安裝步驟 3。
- 畫面只有小膠囊：點一下即可展開歌詞。
- 確認開啟的是 Spotify 原生迷你播放器。
- 以上都正常時，執行 `spicetify apply`，完全關閉 Spotify 後再開啟。

正常情況不需要每次開啟 Spotify 都重做這些步驟。

### 仍顯示舊版效果或出現兩個歌詞框

Spicetify 會把擴充功能名稱加入清單，啟用新檔名不會自動移除舊項目。

先看 `spicetify config extensions` 的結果。例如 `miniLyricsV18.js` 也有啟用時，執行：

```powershell
spicetify config extensions miniLyricsV18.js-
spicetify config extensions miniLyrics.js
spicetify apply
```

將 `miniLyricsV18.js` 換成你實際的舊版檔名。結尾的 `-` 只停用該項目，不會刪除檔案。其他無關的擴充功能可以保持啟用。

也請確認取代的是 Extensions 裡的檔案，而不是只有「下載」資料夾或開發專案裡的版本。

### Spicetify 自訂效果消失或 apply 失敗

如果是 Spotify 更新後開始發生，先執行：

```powershell
spicetify backup apply
```

如果需要更新 Spicetify，透過安裝腳本安裝的版本可使用 `spicetify upgrade`；透過套件管理工具安裝的版本，則使用原本的套件管理工具更新。

仍無法使用時，嘗試：

```powershell
spicetify restore backup apply
```

這會還原 Spotify 原始檔案，再重新套用目前設定的自訂效果，不會清除你的擴充功能設定。完成後重新開啟 Spotify。

如果最新 Spotify 尚未受到支援，請查看 [Spicetify FAQ](https://spicetify.app/docs/faq) 與 [issue tracker](https://github.com/spicetify/cli/issues)。如果所有主題與擴充功能都受影響，請先處理 Spicetify 相容性問題。

### PowerShell 找不到 spicetify 或 Spicetify 找不到 Spotify

- **無法辨識指令：** 完成 [Spicetify 安裝](https://spicetify.app/docs/getting-started)，重新開啟 PowerShell，再試 `spicetify --version`。
- **找不到 Spotify 或 prefs 檔案：** 先開啟 Spotify 並登入，再依官方 [prefs 路徑排錯說明](https://spicetify.app/docs/faq)處理。

### 部分歌曲沒有歌詞或時間不準

歌詞是否可用取決於 LRCLIB 資料及歌曲資訊。現場版、重製版或其他錄音版本可能與現有歌詞不相符。

先試另一首歌。如果其他歌曲正常，代表安裝成功，問題可能只影響該首歌。

如果拖曳時間軸或換歌後歌詞不再同步，先更新擴充功能並重新開啟 Spotify；仍有問題時，請回報歌曲及重現步驟。

### 原文正常但沒有翻譯

依序檢查：

1. **「譯」是否啟用？** 如果字是暗的，點一下開啟。停用狀態會跨歌曲保留。
2. **代理是否已設定？** 在 Spotify 開發者工具的 Console 執行 `localStorage.getItem("miniLyrics.neteaseProxy")`。若回傳 `null` 或舊網址，重新做翻譯設定。
3. **Worker 是否已部署且能連線？** 使用完整設定網址，包含 `?url=`。
4. **歌曲是否有翻譯歌詞？** 網易雲可能沒有可用配對，請試其他歌曲。

直接開啟未帶 `url` 參數的 Worker 網址，可能會收到缺少網址參數的錯誤；這不一定代表部署失敗。

翻譯晚幾秒出現或只有部分句子有翻譯，可能是正常情況。不同分行方式或錄音版本會影響配對；韓文羅馬拼音也只會在對齊可信時替換成原生文字。

### Console 出現其他錯誤

Spotify、Marketplace 及其他擴充功能都可能產生自己的錯誤。`remote-config-resolver` 或其他 manifest 訊息本身不代表 Mini Player Lyrics 出問題。回報時請優先找 `[MiniLyrics]` 相關訊息。

## 回報問題

請建立 [issue](https://github.com/JoyBoyuuu/Spotify-Mini-player-Lyrics/issues)，並提供：

- Windows、Spotify 與 Spicetify 版本
- 發生問題的歌曲，以及其他歌曲是否正常
- 是原文歌詞失敗，還是只有翻譯失敗
- 其他 Spicetify 擴充功能是否正常
- 重現步驟及相關 `[MiniLyrics]` 錯誤

附上下列 PowerShell 檢查結果：

```powershell
spicetify --version
spicetify config extensions
Test-Path "$env:APPDATA\spicetify\Extensions\miniLyrics.js"
```

請勿提供密碼、驗證權杖或其他私人憑證。

## 開發者說明

一般使用者可以略過。本節需要 Node.js 與 npm。

請修改 `src/` 裡的檔案。根目錄的 `miniLyrics.js` 是產生檔，下次 build 時會被覆蓋。

在專案資料夾執行：

```powershell
npm run verify
node scripts/test-translation-policy.cjs
```

第一個指令會產生擴充功能並檢查 JavaScript 語法；第二個會執行翻譯規則回歸測試。這些檢查不能取代 Spotify 內的實際介面測試。

安裝本機 build：

```powershell
Copy-Item ".\miniLyrics.js" "$env:APPDATA\spicetify\Extensions\miniLyrics.js" -Force
spicetify apply
```

| 檔案或資料夾 | 用途 |
| --- | --- |
| `src/` | 原始碼，包含 UI、歌詞來源、翻譯及無歌詞提示 |
| `scripts/build.cjs` | 原始碼組合順序與單檔 build |
| `scripts/test-translation-policy.cjs` | 翻譯規則檢查 |
| `miniLyrics.js` | 產生後安裝到 Spicetify 的檔案 |
| `netease-cors-worker.js` | 選用代理服務，需另外部署到 Cloudflare |
| `package.json` | Build 指令設定 |

新增原始碼檔案時，要在 `scripts/build.cjs` 註冊。各檔案會合併到同一個函式作用域，並非獨立載入的模組。只要重新 build 而不執行語法檢查時，可使用 `npm run build`。

## 資料來源與免責聲明

歌詞在執行時從 LRCLIB 取得；設定翻譯後也會使用網易雲資料。本專案不內附歌詞資料庫，可用性與準確度取決於來源資料及配對品質。

Spotify Mini Player Lyrics 是非官方社群專案，與 Spotify、Spicetify、LRCLIB、網易雲、Cloudflare 或 OpenCC 無隸屬關係，也未獲上述服務背書。
