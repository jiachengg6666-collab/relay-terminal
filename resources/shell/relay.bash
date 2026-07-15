[[ -f ~/.bashrc ]] && source ~/.bashrc

__relay_ready=0
__relay_preexec() {
  if [[ "$__relay_ready" == "1" ]]; then
    __relay_ready=0
    local cmd encoded
    cmd="$(HISTTIMEFORMAT= builtin history 1 | sed -E 's/^ *[0-9]+ *//')"
    encoded="$(printf '%s' "$cmd" | base64 | tr -d '\n')"
    printf '\033]633;B;%s\007' "$encoded"
  fi
}

__relay_prompt() {
  local status="$1"
  local cwd64
  cwd64="$(printf '%s' "$PWD" | base64 | tr -d '\n')"
  printf '\033]633;D;%s\007\033]633;P;Cwd=%s\007\033]633;A\007' "$status" "$cwd64"
  __relay_ready=1
}

trap '__relay_preexec' DEBUG
bind '"\C-g": unix-line-discard'
__relay_original_prompt_command="$PROMPT_COMMAND"
PROMPT_COMMAND='__relay_status=$?; __relay_ready=0; eval "$__relay_original_prompt_command"; __relay_prompt "$__relay_status"'
