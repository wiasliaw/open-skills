# demo — v1 coding-factory 以 Schema 2.0 建場

把 1.x 模板（`skills/graph-build/templates/coding-factory.json`）按
`SCHEMA-2.md` 的廠區／工站／製程抽象重建。這是 build-time 分層庫的樣子；
實際 project 端只會拿到 assemble 攤平後的一份 `.harness/graph.json`
（tasks catalog 內含，無 state_fields 區段）。

## 佈局

```
demo/
├── types.json                  # 型別目錄（純型別六欄；phase.values 是 {{phase_values}} slot）
├── tasks/                      # 製程目錄，19 個 TaskDef
├── nodes/                      # 工站，11 個（v1 的 9 個 + 拆分出的 build-direct、maintain）
├── graphs/coding-factory.json  # 組裝圖：slots、caps、工站引用、edges
└── coding-factory.examples.md  # phase 走法範例（非規範性，取代 v1 的 phase.path）
```

## v1 → v2 對應

| v1 | v2 |
|---|---|
| `phase.{key}.path` | 刪除；`approve-phase` 寫 `phase` state，edges guard 分流；走法見 examples.md |
| research node（llm + human_approval） | research 工站 = `research-request`（llm）+ `approve-phase`（human，寫 state:phase/contract_ref） |
| spec node | spec 工站 = `author-contract`（llm，包 openspec-propose）+ `approve-contract`（human） |
| ticket node | ticket 工站 = `decompose-tickets`，re_entry 照舊（隱含 per-ticket fail scope） |
| build node（pre_steps + llm + orchestrator verification + post_step） | build 工站管線：`provision-worktree` → `red-check` → `implement-ticket` → `verify-build` → `commit-work` |
| build 的 chore/maintenance 散文分支 | 拆成 build-direct、maintain 兩個工站，edges guard 分流 |
| `maintenance.restriction_overrides` | `fold-deltas` 製程自帶 restrictions，不再覆蓋 |
| review node | review 工站 = `review-change`（validator, runner reviewer） |
| wrap node（pre/post_steps + llm + reviewer verification） | wrap 工站管線：provision → `close-out` → `verify-wrap` → `commit-work` → `deliver` |
| 「failing verdict retries in place」散文 | `on: {"fail": "goto:<implement/close-out/fold-deltas>"}` 宣告 |
| 「send-back 時修同一份 proposal」散文 | `on: {"send-back": "goto:<authoring task>"}` 宣告 |
| ship / end terminal steps | terminal 工站的 script 製程（`archive-shipped` / `archive-abandoned`） |

## 建場時暴露的三個決定（已回寫 SCHEMA-2.md 或待議）

1. **`escalate` action**：管線第一個製程失敗既不能 `goto` 自己也不該直通
   棄單，新增 `escalate` 交給 orchestrator 升級機制（retry → advisor →
   human ruling）。已補進 SCHEMA-2.md 的 Action 表（🔸）。
2. **not-needed 改走 edge**：v1 的 end「只經 disposition、永不經 edge」；
   v2 把 human 製程的 not-needed 直接 surface 成工站出口、以 edge 接 end，
   路由語彙更單一。屬刻意偏離，過 advisor 時確認。
3. **`red-check` 需要新 script 面**：v1 由 orchestrator 散文承擔的
   「land tests → red commit → expect-red」在管線化後成為真實的 script
   製程，`work-unit.mjs` 需新增 `land-tests` / `expect-red` 子命令
   （或獨立 script）。
   已決（design D7/D8）：expect-red 已綠時 exit 11，red-check 的 run 行以
   `{command, codes: {"11": "ticket-invalid"}}` 確定性 surface `ticket-invalid`。
   另：`blocked` 一律 universal、不宣告（author-contract／spec 工站已移除）。
