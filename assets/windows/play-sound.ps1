param(
  [Parameter(Mandatory = $true)][string]$Path,
  [string]$Detach = 'false'
)
# Plays one audio file for a custom toastSound (src/platforms/sound.mjs). Runs as
# its own process so the notification hook never waits for the sound to end.
# -Detach relaunches this script hidden and returns at once: WSL calls it through
# interop, where a plain background child would not outlive the caller.
$ErrorActionPreference = 'Stop'

if ($Detach -eq 'true') {
  $self = (Get-Process -Id $PID).Path
  Start-Process -FilePath $self -WindowStyle Hidden -ArgumentList @(
    '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
    '-File', "`"$PSCommandPath`"", '-Path', "`"$Path`""
  )
  exit 0
}

# Longest clip waited for; a sound is an alert, not a track.
$maxSeconds = 30

try {
  if ([System.IO.Path]::GetExtension($Path).ToLowerInvariant() -eq '.wav') {
    # Play() returns at once; the process then waits out the clip, capped like the
    # other formats. Length comes from the WAV header (byte rate at offset 28).
    $player = New-Object System.Media.SoundPlayer $Path
    $player.Load()
    $bytes = [System.IO.File]::ReadAllBytes($Path)
    $byteRate = if ($bytes.Length -ge 44) { [BitConverter]::ToUInt32($bytes, 28) } else { 0 }
    $seconds = if ($byteRate -gt 0) { ($bytes.Length - 44) / $byteRate } else { $maxSeconds }
    $player.Play()
    $wait = [Math]::Min($seconds + 0.3, $maxSeconds)
    if ($wait -gt 0) { Start-Sleep -Milliseconds ([int]($wait * 1000)) }
  } else {
    Add-Type -AssemblyName PresentationCore
    $player = New-Object System.Windows.Media.MediaPlayer
    $player.Open([Uri]$Path)
    $player.Play()
    # NaturalDuration is only known once the media opened. No event handlers: a
    # MediaPlayer is bound to its creating thread and PowerShell would touch it
    # from another when it tears the subscription down.
    $deadline = (Get-Date).AddSeconds(3)
    while ((Get-Date) -lt $deadline -and -not $player.NaturalDuration.HasTimeSpan) { Start-Sleep -Milliseconds 50 }
    if (-not $player.NaturalDuration.HasTimeSpan) { $player.Close(); throw "cannot open this file (codec not installed?)" }
    $remaining = $player.NaturalDuration.TimeSpan - $player.Position
    $wait = [Math]::Min($remaining.TotalSeconds + 0.3, $maxSeconds)
    if ($wait -gt 0) { Start-Sleep -Milliseconds ([int]($wait * 1000)) }
    $player.Close()
  }
} catch {
  # The toast was made silent because this file was going to play; a short system
  # sound is better than no sound at all.
  try { [System.Media.SystemSounds]::Asterisk.Play(); Start-Sleep -Milliseconds 800 } catch {}
  [Console]::Error.WriteLine("play-sound.ps1: $($_.Exception.Message)")
  exit 3
}
