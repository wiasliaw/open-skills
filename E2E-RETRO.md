# E2E Retro — demo run `2026-10-05-todo-backend`

第一次端到端跑完 harness（demo/：todo backend，6 tickets，約一小時 shipped）後的問題清單與修正計畫。各項修法已經過討論定案，實作前需過一輪 advisor。

## 這次 run 暴露的問題

### 結構性

1. **冷啟動缺口**：`base_ref_missing` 在 build 的 pre-step 才炸（log L-0021），但 unborn branch 在 clock-in 就能驗出。Run 燒掉兩個 human approval 之後才發現 repo 開不了 worktree。advisor 預言的第二個 blocker（`worktree_setup.copy` source 不存在）也如期炸了。
2. **Advisor 建議不具約束力**：advice-1 明示偏好「移除 copy entry」，orchestrator 選了 alternative（空 node_modules）且未記錄偏離理由；後果（L-0028 臨時修 .gitignore）無法歸因。更大的風險（npm install 寫穿 main）只因專案零依賴而沒爆。
3. **Memory 生命週期只有一半**：`memory.mjs` 有 validate 沒有 create，wrap worker 手寫 delta 格式；run 結束兩筆 delta 停在 pending，`pending_delta_threshold: 10` 之下沒有任何機制觸發 maintenance，truth 文件無限期落後。
4. **graph-build 訪談失效**：SKILL.md 寫了「every section/slot MUST be confirmed by the user」，demo build 一題未問，graph.json 與模板 1:1（9 nodes / 15 edges）。且 node/edge 拓撲本來就不在 Tier 2 訪談範圍——user 沒看過圖，無從提出 Tier 3 結構修改。

### 工具層

5. **Log 保真**：log.ndjson 的 description 是 LLM 轉述，commit message 被改寫（L-0046 vs 實際 854ff50）。
6. **Red run 掛死**：T-6 失敗測試洩漏 handles，orchestrator 即興加 `--test-force-exit`。→ **決定不修**：屬 tech stack 選擇問題（vitest 類 runner 自帶 force-exit），test runner 選擇歸 scaffold unit 的決策範圍。

### 通則

問題 2 與問題 4 同病：**散文裡的 MUST 沒有機械檢查點，執行者可以無痕跳過**。原則：凡「MUST 經人確認」的規則，都要配一個 artifact 加一個檢查點。

## 修正計畫（已定案）

### #2 `memory.mjs create`

加 `create --target <architecture|constraints> --type <...> --unit <id> [--depends-on <id>]`，內文從 `--file` 或 stdin 收，與 validator 共用同一份 schema。wrap SKILL.md 改為指示 worker 使用。

### #3 maintain 必經節點（取消 pending gate）

**決策：maintenance 每次 work-unit archive 都要做，不設 threshold。**

- graph 加 `maintain` 節點，位於 wrap 之後、ship 之前，每個 unit 必經。worker 摺 pending deltas（含殘留）進 ARCHITECTURE.md / CONSTRAINTS.md；reviewer 用 `memory.mjs validate` + budget 把關。
- ship 入口改硬不變量：`memory.mjs check` 回報 pending = 0 才准 archive。
- wrap 的 deltas 與 maintain 的文件修改都在 wu branch 上，一次 merge 帶回 main；main 上的 memory 恆為 consolidated，下游不再雙讀。
- `pending_delta_threshold` 從 config schema 移除；clock-in 查 pending 降為一致性檢查（非 0 = 上個 unit 異常中斷）。
- 註記：平行 unit 同摺一份文件會 merge 衝突；序列執行暫不處理，VCS.md 記「衝突時後 merge 者重摺」。

### #1 `worktree.mjs preflight` + scaffold unit type

**決策：只加 preflight，init 不做 baseline commit——scaffold project 本身是一個 work-unit。**

- `preflight` 子命令於 clock-in 執行：驗 `default_branch` 可解析、每個 copy source 存在。失敗 block 在 trigger，附行動指引。
- 循環解法：scaffold unit 是不開 worktree 的特例（repo 為空，無物可隔離），直接在 main checkout 工作，其「merge」即 initial commit。preflight 偵測 unborn branch 時指引「開 scaffold unit」。
- 待定邊界：scaffold 這個 unit type / phase 宣告在哪（graph 定義或 dispatch 規則）。

### #7 graph-build 訪談修復

- **訪談產物化**：訪談結果落檔（如 `.harness/graph-build-record.md`），每題記 question / recommendation（含來源）/ answer / 採納或更正。
- **validator attestation**：`graph.mjs validate` 加 `--interview <record>`，檢查覆蓋每個 slot 與 config section，缺題 reject（新 exit code）；`init.mjs write` 同理。把「跳過」從無痕變成必須偽造。
- **Tier 2 walkthrough**：複製模板前以人話呈現 nodes/edges（每 node 一行：職責、執行者、出口）與所有 declared variation points，問「這個流程符合你要的建設方式嗎？」；不符則同 session 進 Tier 3 編輯。
- **模板宣告更多 variation points**：delivery 之外，將常見分歧（research 節點有無、human gate 數量與位置、review 嚴格度）提升為 declared variants。

### #5 VCS.md

- init.mjs 模板加 `VCS.md` 骨架，登記 `memory.budgets`（小 budget，約 60 行）。
- 邊界：script 永不讀散文。可執行事實留在 config.json 與 graph 定義；VCS.md 負責（a）解釋意圖與取捨（為什麼 no-ff、為什麼不 push），（b）覆蓋 script 管不到的行為（worker commit message 慣例、何時開 fix unit 對準既有分支、tag 與版本慣例）。
- 寫法：引用 config/graph 的值不重抄；分歧以結構化為準，md 的失真由 maintain 修。
- 首批內容取自本次 run：bootstrap commit 規則（advice-1 那套）、commit message 慣例。

### #4 advice-decision

- escalation.md 加規則：advice 回來後 orchestrator 必記 `advice-decision` 事件（採納/偏離 + 理由）；`state.json` 的 `advisor_consults` 加 `resolution: {choice, reason}`。
- 升級規則：偏離 advisor 明示偏好後同 signature 問題再現，直接升級 human，不再問 advisor 第二輪。

### #6 Log 保真（小修）

state-writes.md 加規則：commit hash/message 等可機器擷取欄位，必須從 `git log -1 --format` 輸出原樣轉錄，不得轉述。

## 實作順序

**2 → 3 → 1 → 7 → 5 → 4**（外加 #6 小修隨手帶）。

理由：#3 是全局行為改變，先做讓後續 demo 重跑一次驗證新迴圈；#1 與 #3 都動 graph 語彙，接續做共用同一次 schema 變更；#2 是 #3 的工具前提。

## 動到的檔案

| # | 範圍 |
|---|------|
| 2 | `scripts/memory.mjs`、`skills/wrap/SKILL.md` |
| 3 | `skills/graph-build/templates/coding-factory.json`、graph-run references、`scripts/memory.mjs`、init schema |
| 1 | `scripts/worktree.mjs`、graph-run references |
| 7 | `skills/graph-build/SKILL.md`、`scripts/graph.mjs`、`scripts/init.mjs`、`templates/coding-factory.json` |
| 5 | `scripts/init.mjs` 模板、`skills/graph-build/references/bootstrap.md` |
| 4 | `skills/graph-run/references/escalation.md`、state schema |
| 6 | `skills/graph-run/references/state-writes.md` |

## 實作前

需過一輪 advisor，重點是兩個結構決策：

1. #3「maintain 做成必經節點 + ship 硬不變量」
2. #1「scaffold unit 不開 worktree、直接在 main checkout 工作」
