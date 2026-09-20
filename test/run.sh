#!/usr/bin/env bash
# Runs every suite that this machine can run, and says which ones it skipped.
# Nothing here touches your real ~/.dsh: each suite works in its own temp HOME.
set -u
cd "$(dirname "$0")"

pass=0
fail=0
skipped=()

# A suite counts as passed only when it both exits 0 AND says so. Trusting the
# exit code alone once hid a whole failing suite: the python ones printed
# "RESULT: FAILURES" and still exited 0, so the runner reported all green.
run() {
  local kind="$1" file="$2" label="$3"
  if [[ ! -f "$file" ]]; then skipped+=("$label (缺文件)"); return; fi
  printf '\n\033[1m── %s\033[0m\n' "$label"
  local out code
  out="$("$kind" "$file" 2>&1)"
  code=$?
  printf '%s\n' "$out"
  if [[ $code -eq 0 && "$out" == *"RESULT: ALL PASS"* ]]; then
    pass=$((pass + 1))
  else
    fail=$((fail + 1))
    printf '\033[31m   ↑ 这一套没过（退出码 %s）\033[0m\n' "$code"
  fi
}

run_node() { run node "$1" "$2"; }

run_python() {
  if ! python3 -c 'import playwright, PIL' 2>/dev/null; then
    skipped+=("$2 (需要: pip install playwright pillow && python -m playwright install webkit)")
    return
  fi
  run python3 "$1" "$2"
}

run_node host.test.mjs "宿主逻辑：多会话 / 审批 / 提问 / 清理 / 语言"
run_node hud-lifecycle.test.mjs "HUD 进程：killOldHud 与编译回退"
run_node question-nav.test.mjs "提问导航：模块注册 / apply 挂载三个槽位 / 主题层"
run_python overlay.test.py "页面：渲染 / DOM diff / 闪烁 / 拖拽 / 右键"
run_python collapsed.test.py "收起态：一个任务一盏灯 / 关闭按钮"
run_python backgrounds.test.py "背景：五种可选 / 注入无闪烁 / 落盘往返"

printf '\n\033[1m结果\033[0m  %d 套通过, %d 套失败' "$pass" "$fail"
(( ${#skipped[@]} )) && printf ', %d 套跳过' "${#skipped[@]}"
printf '\n'
for s in ${skipped[@]+"${skipped[@]}"}; do printf '  跳过：%s\n' "$s"; done
exit $(( fail > 0 ? 1 : 0 ))
