# coding-factory — phase 走法範例（非規範性）

路由的真值是 `graphs/coding-factory.json` 的 edges + guards；本檔只是人讀的
正規走法，validator 不讀它。phase 值由訪談填入 `{{phase_values}}` slot，
保留值 `maintenance` 必含。

## feat — 需要新契約的能力

trigger → research → spec → ticket → build →（每張 ticket 循環）→ review → wrap → ship

- build 完成一張 ticket 且還有 pending 時回 ticket 選下一張（selection-only 再入）。
- review fail 走 build-direct（整體變更修正）再回 review，不回 build；ticket 發現契約矛盾回 spec。

## fix — 既有契約已涵蓋的缺陷

trigger → research → ticket → build →（每張 ticket 循環）→ review → wrap → ship

- 不經 spec；research 的核可同時記下涵蓋此缺陷的既有契約（contract_ref）。
- ticket 發現契約矛盾時回 research（契約不歸本單元改）。
- review fail 走 build-direct（整體變更修正）再回 review，不回 build。

## chore — 不動行為與契約的雜務

trigger → research → build-direct → review → wrap → ship

- 無 ticket 分解，整個變更一次實作、一次驗。

## maintenance — memory apply（僅 maintenance-due 觸發）

trigger → research → maintain → review → wrap → ship

- maintain 摺疊 pending delta 進 current-truth 文件並翻 status，
  受自己的一組 restrictions 管（不碰 VCS、只動 .harness/ 的記憶文件）。

## 共同結尾

- 任一 human 製程判 not-needed → end（棄單終點，worktree 強制移除、
  drafts 原地保留歸檔）。
- wrap 通過獨立檢核後 commit → push → 開 delivery channel → 移除 worktree
  → ship（成功終點，handoff 複製到資料夾根、歸檔）。
