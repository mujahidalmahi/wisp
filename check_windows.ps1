Add-Type @"
  using System;
  using System.Runtime.InteropServices;
  using System.Text;
  public class WinApi {
    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
    [DllImport("user32.dll")]
    public static extern bool EnumWindows(EnumWindowsProc enumProc, IntPtr lParam);
    [DllImport("user32.dll")]
    public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
    [DllImport("user32.dll")]
    public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);
    [DllImport("user32.dll")]
    public static extern bool IsWindowVisible(IntPtr hWnd);
  }
"@

$pids = (Get-Process -Name *emulator*,*qemu* -ErrorAction SilentlyContinue).Id
Write-Output "Checking PIDs: $($pids -join ', ')"

[WinApi]::EnumWindows({ param($hWnd, $lParam)
  $wpid = 0
  [WinApi]::GetWindowThreadProcessId($hWnd, [ref]$wpid)
  if ($wpid -in $pids) {
    $sb = New-Object System.Text.StringBuilder 256
    [WinApi]::GetWindowText($hWnd, $sb, 256) | Out-Null
    $visible = [WinApi]::IsWindowVisible($hWnd)
    Write-Output "PID: $wpid, hWnd: $hWnd, Visible: $visible, Title: '$($sb.ToString())'"
  }
  return $true
}, [IntPtr]::Zero)
