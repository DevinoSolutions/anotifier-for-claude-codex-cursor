# assets/windows/foreground.ps1 -- report the foreground window and the caller's ancestry.
# Read-only probe used by src/focus.mjs. Prints tab-separated lines:
#   FG<TAB>pid<TAB>image<TAB>parentPid<TAB>title     (absent when nothing is in the foreground)
#   CHAIN<TAB>pid<TAB>image                           (StartPid and each ancestor, nearest first)
# One Toolhelp32 snapshot, no CIM/WMI: a WMI query can take seconds on some machines.
param([uint32]$StartPid = 0)

$ErrorActionPreference = 'Stop'

Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
public static class AanFg {
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder text, int count);
  [DllImport("user32.dll")] static extern int GetWindowTextLength(IntPtr h);
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  struct PROCESSENTRY32 {
    public uint dwSize; public uint cntUsage; public uint th32ProcessID;
    public IntPtr th32DefaultHeapID; public uint th32ModuleID; public uint cntThreads;
    public uint th32ParentProcessID; public int pcPriClassBase; public uint dwFlags;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 260)] public string szExeFile;
  }
  [DllImport("kernel32.dll", SetLastError = true)] static extern IntPtr CreateToolhelp32Snapshot(uint flags, uint pid);
  [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] static extern bool Process32FirstW(IntPtr h, ref PROCESSENTRY32 e);
  [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] static extern bool Process32NextW(IntPtr h, ref PROCESSENTRY32 e);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);

  public static string[] Procs() {
    var rows = new List<string>();
    IntPtr snap = CreateToolhelp32Snapshot(2u, 0u); // TH32CS_SNAPPROCESS
    if (snap == IntPtr.Zero || snap == new IntPtr(-1)) { return rows.ToArray(); }
    var e = new PROCESSENTRY32(); e.dwSize = (uint)Marshal.SizeOf(typeof(PROCESSENTRY32));
    if (Process32FirstW(snap, ref e)) {
      do { rows.Add(e.th32ProcessID + "\t" + e.th32ParentProcessID + "\t" + e.szExeFile); }
      while (Process32NextW(snap, ref e));
    }
    CloseHandle(snap);
    return rows.ToArray();
  }

  public static string Foreground(out uint pid) {
    pid = 0;
    IntPtr h = GetForegroundWindow();
    if (h == IntPtr.Zero) { return null; }
    GetWindowThreadProcessId(h, out pid);
    int len = GetWindowTextLength(h);
    var sb = new StringBuilder(len + 1);
    GetWindowText(h, sb, sb.Capacity);
    return sb.ToString();
  }
}
'@

$names = @{}
$parents = @{}
foreach ($row in [AanFg]::Procs()) {
  $f = $row.Split("`t")
  $names[[uint32]$f[0]] = $f[2]
  $parents[[uint32]$f[0]] = [uint32]$f[1]
}

[uint32]$fgPid = 0
$title = [AanFg]::Foreground([ref]$fgPid)
if ($null -ne $title -and $fgPid -ne 0) {
  $clean = ($title -replace '[\t\r\n]+', ' ')
  $ppid = 0
  if ($parents.ContainsKey($fgPid)) { $ppid = $parents[$fgPid] }
  $img = ''
  if ($names.ContainsKey($fgPid)) { $img = $names[$fgPid] }
  Write-Output ("FG`t{0}`t{1}`t{2}`t{3}" -f $fgPid, $img, $ppid, $clean)
}

if ($StartPid -ne 0) {
  $id = $StartPid
  $seen = @{}
  for ($i = 0; $i -lt 32; $i++) {
    if ($seen.ContainsKey($id) -or -not $names.ContainsKey($id)) { break }
    $seen[$id] = $true
    Write-Output ("CHAIN`t{0}`t{1}" -f $id, $names[$id])
    if (-not $parents.ContainsKey($id)) { break }
    $id = $parents[$id]
  }
}
