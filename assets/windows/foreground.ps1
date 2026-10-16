# assets/windows/foreground.ps1 -- report the foreground window and who owns the agent's window.
# Read-only probe used by src/focus.mjs. Prints tab-separated lines:
#   FG<TAB>pid<TAB>image<TAB>parentPid<TAB>title     (absent when nothing is in the foreground)
#   CHAIN<TAB>pid<TAB>image                           (StartPid and its ancestors, nearest first)
#   OWNER<TAB>pid<TAB>image                           (the first chain member that owns a visible window)
#                                                     (none when the walk ends at a hidden WindowsTerminal.exe)
#
# The walk up the parent chain stops at the FIRST process that owns a visible top-level
# window (or whose console host does, for classic conhost.exe windows). Anything above it
# is a launcher, not the agent's window: a terminal started from Chrome must not make
# Chrome count. The walk also stops when a parent was created AFTER its child, which means
# the parent pid was reused by an unrelated process, and when a creation time cannot be read.
#
# No Add-Type: that invokes the C# compiler (csc.exe) and writes temp files. The P/Invoke
# shim is emitted in memory with System.Reflection.Emit instead. The process table comes from
# one Toolhelp32 snapshot, not CIM/WMI, which can take seconds.
param([uint32]$StartPid = 0)

$ErrorActionPreference = 'Stop'

$an = New-Object System.Reflection.AssemblyName 'AanFg'
$run = [System.Reflection.Emit.AssemblyBuilderAccess]::Run
try {
  $ab = [System.Reflection.Emit.AssemblyBuilder]::DefineDynamicAssembly($an, $run)   # .NET Core / pwsh
} catch {
  $ab = [AppDomain]::CurrentDomain.DefineDynamicAssembly($an, $run)                  # .NET Framework
}
$tb = $ab.DefineDynamicModule('AanFgModule').DefineType('Native', 'Public,Class,Sealed,Abstract')
function Def([string]$name, [string]$dll, [Type]$ret, [Type[]]$params) {
  $m = $tb.DefinePInvokeMethod($name, $dll, 'Public,Static,PinvokeImpl', 'Standard', $ret, $params, 'Winapi', 'Unicode')
  $m.SetImplementationFlags($m.GetMethodImplementationFlags() -bor 128)   # PreserveSig
}
Def GetForegroundWindow user32.dll ([IntPtr]) @()
Def GetWindowThreadProcessId user32.dll ([uint32]) @([IntPtr], [IntPtr])
Def GetWindowTextLengthW user32.dll ([int]) @([IntPtr])
Def GetWindowTextW user32.dll ([int]) @([IntPtr], [IntPtr], [int])
Def CreateToolhelp32Snapshot kernel32.dll ([IntPtr]) @([uint32], [uint32])
Def Process32FirstW kernel32.dll ([bool]) @([IntPtr], [IntPtr])
Def Process32NextW kernel32.dll ([bool]) @([IntPtr], [IntPtr])
Def OpenProcess kernel32.dll ([IntPtr]) @([uint32], [bool], [uint32])
Def GetProcessTimes kernel32.dll ([bool]) @([IntPtr], [IntPtr], [IntPtr], [IntPtr], [IntPtr])
Def CloseHandle kernel32.dll ([bool]) @([IntPtr])
$n = $tb.CreateType()
$m = [System.Runtime.InteropServices.Marshal]

# PROCESSENTRY32W by byte offset (avoids declaring a struct type).
if ([IntPtr]::Size -eq 8) { $entrySize = 568; $offParent = 32; $offName = 44 }
else                      { $entrySize = 556; $offParent = 24; $offName = 36 }
$entry = $m::AllocHGlobal($entrySize)
$names = @{}
$parents = @{}
$consoleHosts = @{}   # parent pid -> pids of its conhost.exe / OpenConsole.exe children
$snap = $n::CreateToolhelp32Snapshot(2, 0)   # TH32CS_SNAPPROCESS
if ($snap -ne [IntPtr]::Zero -and $snap -ne [IntPtr]::new(-1)) {
  $m::WriteInt32($entry, 0, $entrySize)
  $ok = $n::Process32FirstW($snap, $entry)
  while ($ok) {
    $p = [uint32]$m::ReadInt32($entry, 8)
    $pp = [uint32]$m::ReadInt32($entry, $offParent)
    $nm = $m::PtrToStringUni([IntPtr]($entry.ToInt64() + $offName))
    $names[$p] = $nm
    $parents[$p] = $pp
    if ($nm -ieq 'conhost.exe' -or $nm -ieq 'OpenConsole.exe') {
      if (-not $consoleHosts.ContainsKey($pp)) { $consoleHosts[$pp] = @() }
      $consoleHosts[$pp] += $p
    }
    $ok = $n::Process32NextW($snap, $entry)
  }
  [void]$n::CloseHandle($snap)
}

# Foreground window.
$h = $n::GetForegroundWindow()
if ($h -ne [IntPtr]::Zero) {
  $pidBuf = $m::AllocHGlobal(4)
  [void]$n::GetWindowThreadProcessId($h, $pidBuf)
  $fgPid = [uint32]$m::ReadInt32($pidBuf, 0)
  $len = $n::GetWindowTextLengthW($h)
  $title = ''
  if ($len -gt 0) {
    $tbuf = $m::AllocHGlobal(2 * ($len + 1))
    [void]$n::GetWindowTextW($h, $tbuf, $len + 1)
    $title = $m::PtrToStringUni($tbuf)
  }
  if ($fgPid -ne 0) {
    $img = ''; if ($names.ContainsKey($fgPid)) { $img = $names[$fgPid] }
    $ppid = 0; if ($parents.ContainsKey($fgPid)) { $ppid = $parents[$fgPid] }
    $clean = ($title -replace '[\t\r\n]+', ' ')
    Write-Output ("FG`t{0}`t{1}`t{2}`t{3}" -f $fgPid, $img, $ppid, $clean)
  }
}

# Creation time as a FILETIME tick count, or $null when it cannot be read.
$timeBuf = $m::AllocHGlobal(32)
function Get-Created([uint32]$id) {
  $ph = $n::OpenProcess(0x1000, $false, $id)   # PROCESS_QUERY_LIMITED_INFORMATION
  if ($ph -eq [IntPtr]::Zero) { return $null }
  try {
    if (-not $n::GetProcessTimes($ph, $timeBuf, [IntPtr]($timeBuf.ToInt64() + 8), [IntPtr]($timeBuf.ToInt64() + 16), [IntPtr]($timeBuf.ToInt64() + 24))) { return $null }
    return $m::ReadInt64($timeBuf, 0)
  } finally { [void]$n::CloseHandle($ph) }
}

function Has-Window([uint32]$id) {
  try { return ([System.Diagnostics.Process]::GetProcessById([int]$id).MainWindowHandle -ne [IntPtr]::Zero) }
  catch { return $false }
}

# The process that owns a visible window on behalf of $id: $id itself, or its console host.
function Get-WindowOwner([uint32]$id) {
  if (Has-Window $id) { return $id }
  if ($consoleHosts.ContainsKey($id)) {
    foreach ($c in $consoleHosts[$id]) { if (Has-Window $c) { return $c } }
  }
  return $null
}

if ($StartPid -ne 0) {
  $id = $StartPid
  $created = Get-Created $id
  $seen = @{}
  for ($i = 0; $i -lt 32; $i++) {
    if ($seen.ContainsKey($id) -or -not $names.ContainsKey($id)) { break }
    $seen[$id] = $true
    Write-Output ("CHAIN`t{0}`t{1}" -f $id, $names[$id])
    $owner = Get-WindowOwner $id
    if ($null -ne $owner) {
      Write-Output ("OWNER`t{0}`t{1}" -f $owner, $names[$owner])
      break
    }
    # A Windows Terminal with no visible window (quake mode, hidden to the tray) is still
    # the agent's terminal: stop here with no OWNER rather than climb to its launcher.
    if ($names[$id] -ieq 'WindowsTerminal.exe') { break }
    if (-not $parents.ContainsKey($id)) { break }
    $parent = $parents[$id]
    if ($parent -eq 0 -or -not $names.ContainsKey($parent)) { break }
    $parentCreated = Get-Created $parent
    if ($null -eq $created -or $null -eq $parentCreated -or $parentCreated -gt $created) { break }   # reused pid or unknown
    $id = $parent
    $created = $parentCreated
  }
}
