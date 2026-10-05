---
name: use-worktree-trigger
description: The skill fires on a natural "prepare my environment before coding" request that never says the word worktree.
tags: [trigger, smoke]
allowed_tools: [Read, Glob, Grep, Skill]
runs: 3
expected_outcome: Claude invokes the use-worktree skill before touching any code.
---

我接下來要開始做 work unit `auth-refactor` 的實作，會動到 repo 裡的程式碼。先把這個 unit 的工作環境準備好。
