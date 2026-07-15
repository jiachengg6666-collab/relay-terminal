[[ -f "$HOME/.zshrc" ]] && source "$HOME/.zshrc"

autoload -Uz add-zsh-hook

__relay_clear_line() {
  BUFFER=''
  CURSOR=0
  zle redisplay
}
zle -N __relay_clear_line
bindkey '^G' __relay_clear_line

__relay_backward_delete_char() {
  if (( CURSOR > 0 )); then
    zle backward-delete-char
  fi
}
zle -N __relay_backward_delete_char
bindkey '^?' __relay_backward_delete_char
bindkey '^H' __relay_backward_delete_char
bindkey '^[[A' up-line-or-history
bindkey '^[[B' down-line-or-history
bindkey '^[OA' up-line-or-history
bindkey '^[OB' down-line-or-history

__relay_preexec() {
  local encoded="$(printf '%s' "$1" | base64 | tr -d '\n')"
  printf '\033]633;B;%s\007' "$encoded"
}

__relay_precmd() {
  local exit_status=$?
  local cwd64="$(printf '%s' "$PWD" | base64 | tr -d '\n')"
  printf '\033]633;D;%s\007\033]633;P;Cwd=%s\007\033]633;A\007' "$exit_status" "$cwd64"
}

preexec_functions=(__relay_preexec ${preexec_functions:#__relay_preexec})
precmd_functions=(__relay_precmd ${precmd_functions:#__relay_precmd})
