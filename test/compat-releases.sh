#!/usr/bin/env bash
# Disposable-profile compatibility check.
#
# For each official DSH release: install that exact CLI into a throwaway DSH_HOME
# (the real ~/.dsh is never touched or even read), add the plugin from this
# checkout, confirm the bundle composes into the effective configuration, then
# remove it again. This is the evidence dsh.compatibility.dshReleases claims.
set -u
REPO="$(cd "$(dirname "$0")/.." && pwd)"
PLUGIN="${1:-xy-dsh-lamp}"
WORK="${DSH_COMPAT_DIR:-/tmp/dsh-compat}"
VERSIONS=("${@:2}")
if (( ${#VERSIONS[@]} == 0 )); then
  VERSIONS=("0.1.5-rc.1" "0.1.5-rc.2" "0.1.6-alpha.1" "0.1.6-alpha.2")
fi

mkdir -p "$WORK"
echo "插件: $PLUGIN"
echo "工作目录: $WORK"
echo

pass=0; fail=0
for V in "${VERSIONS[@]}"; do
  echo "═══ dsh $V ═══"
  SDK="$WORK/sdk-$V"
  export DSH_HOME="$WORK/home-$V"
  rm -rf "$SDK" "$DSH_HOME"
  mkdir -p "$SDK" "$DSH_HOME"

  # DSH_COMPAT_EXTRA_DEP lets a release be probed with one transitive
  # dependency pinned, for releases whose own dependency range is broken.
  # macOS ships bash 3.2, where an empty array under `set -u` is unbound, so
  # the expansion is guarded rather than written as "${extra[@]}".
  extra=()
  [[ -n "${DSH_COMPAT_EXTRA_DEP:-}" ]] && extra=("$DSH_COMPAT_EXTRA_DEP")
  if ! (cd "$SDK" && npm init -y >/dev/null 2>&1 && npm install --silent --no-audit --no-fund "@deepseek-ai/dsh@$V" ${extra[@]+"${extra[@]}"} >"$WORK/install-$V.log" 2>&1); then
    echo "  FAIL  装不上 @deepseek-ai/dsh@$V（见 $WORK/install-$V.log）"
    tail -3 "$WORK/install-$V.log" | sed 's/^/        /'
    fail=$((fail+1)); continue
  fi
  echo "  ok    安装 CLI"
  DSH="$SDK/node_modules/.bin/dsh"

  if ! "$DSH" plugin --profile compat add "link:$REPO/$PLUGIN" >"$WORK/add-$V.log" 2>&1; then
    echo "  FAIL  dsh plugin add 失败"; tail -3 "$WORK/add-$V.log" | sed 's/^/        /'
    fail=$((fail+1)); continue
  fi
  echo "  ok    install"

  ROWS=$("$DSH" --profile compat --dump-config 2>"$WORK/dump-$V.log" | grep -c "id: $PLUGIN" || true)
  if [[ "$ROWS" == "1" ]]; then
    echo "  ok    start/compose（dump-config 里恰好 1 行）"
  else
    echo "  FAIL  start/compose：dump-config 里 $PLUGIN 出现 $ROWS 行（应为 1）"
    tail -3 "$WORK/dump-$V.log" | sed 's/^/        /'
    fail=$((fail+1)); continue
  fi

  if ! "$DSH" plugin --profile compat remove "$PLUGIN" >"$WORK/remove-$V.log" 2>&1; then
    echo "  FAIL  uninstall 失败"; fail=$((fail+1)); continue
  fi
  LEFT=$("$DSH" --profile compat --dump-config 2>/dev/null | grep -c "id: $PLUGIN" || true)
  if [[ "$LEFT" == "0" ]]; then
    echo "  ok    uninstall（dump-config 回到 0 行）"
    pass=$((pass+1))
  else
    echo "  FAIL  uninstall 后仍有 $LEFT 行"; fail=$((fail+1))
  fi
done

echo
echo "结果：$pass 个版本通过，$fail 个失败"
exit $(( fail > 0 ? 1 : 0 ))
