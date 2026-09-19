#!/usr/bin/env bash
# Runs every suite that this machine can run, and says which ones it skipped.
# Nothing here touches your real ~/.dsh: each suite works in its own temp HOME.
set -u
cd "$(dirname "$0")"

pass=0
fail=0
skipped=()

run_node() {
  local file="$1" label="$2"
  if [[ ! -f "$file" ]]; then skipped+=("$label (missing)"); return; fi
  printf '\n\033[1m── %s\033[0m\n' "$label"
  if node "$file"; then pass=$((pass + 1)); else fail=$((fail + 1)); fi
}

run_python() {
  local file="$1" label="$2"
  if [[ ! -f "$file" ]]; then skipped+=("$label (missing)"); return; fi
  if ! python3 -c 'import playwright, PIL' 2>/dev/null; then
    skipped+=("$label (needs: pip install playwright pillow && python -m playwright install webkit)")
    return
  fi
  printf '\n\033[1m── %s\033[0m\n' "$label"
  if python3 "$file"; then pass=$((pass + 1)); else fail=$((fail + 1)); fi
}

run_node host.test.mjs "宿主逻辑：多会话 / 审批 / 提问 / 清理 / 语言"
run_node hud-lifecycle.test.mjs "HUD 进程：killOldHud 与编译回退"
run_python overlay.test.py "页面：渲染 / DOM diff / 闪烁 / 拖拽 / 右键"
run_python collapsed.test.py "收起态：一个任务一盏灯 / 关闭按钮"

printf '\n\033[1m结果\033[0m  %d 套通过, %d 套失败' "$pass" "$fail"
if (( ${#skipped[@]} )); then
  printf ', %d 套跳过' "${#skipped[@]}"
fi
printf '\n'
for s in "${skipped[@]:-}"; do [[ -n "$s" ]] && printf '  跳过：%s\n' "$s"; done
exit $(( fail > 0 ? 1 : 0 ))
