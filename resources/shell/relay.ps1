$script:RelayLastExit = 0
$script:RelayOriginalPrompt = (Get-Command prompt -ErrorAction SilentlyContinue).ScriptBlock

function global:prompt {
  $relaySucceeded = $?
  $script:RelayLastExit = if ($relaySucceeded) { 0 } elseif ($null -ne $global:LASTEXITCODE -and $global:LASTEXITCODE -ne 0) { $global:LASTEXITCODE } else { 1 }
  $relayCwd = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes((Get-Location).Path))
  [Console]::Write("$([char]27)]633;D;$script:RelayLastExit$([char]7)$([char]27)]633;P;Cwd=$relayCwd$([char]7)$([char]27)]633;A$([char]7)")
  if ($null -ne $script:RelayOriginalPrompt) { & $script:RelayOriginalPrompt } else { "PS $((Get-Location).Path)> " }
}

if (Get-Module -ListAvailable PSReadLine) {
  Import-Module PSReadLine -ErrorAction SilentlyContinue
  if ((Get-Command Set-PSReadLineOption).Parameters.ContainsKey('AddToHistoryHandler')) {
    $script:RelayOriginalHistoryHandler = (Get-PSReadLineOption).AddToHistoryHandler
    Set-PSReadLineOption -AddToHistoryHandler {
      param($line)
      $shouldAdd = if ($null -ne $script:RelayOriginalHistoryHandler) { & $script:RelayOriginalHistoryHandler $line } else { $true }
      if (-not $shouldAdd) { return $false }
      $encoded = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($line))
      [Console]::Write("$([char]27)]633;B;$encoded$([char]7)")
      return $true
    }
  }
  Set-PSReadLineKeyHandler -Chord Ctrl+g -ScriptBlock {
    [Microsoft.PowerShell.PSConsoleReadLine]::RevertLine()
  }
}
