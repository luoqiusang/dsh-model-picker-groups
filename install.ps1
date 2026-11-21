#Requires -Version 5.1
<#
.SYNOPSIS
  把「模型选择器分组折叠」插件装进指定 DSH profile。
.DESCRIPTION
  做三件事（都可回滚，见 uninstall.ps1）：
    1. 在 <profile>\node_modules 下建 junction，指向本项目目录；
    2. 备份 <profile>\cordis.patch.yml 为带时间戳的 .bak-<毫秒>；
    3. 在 patch 末尾追加一段带标记的条目：禁用官方 ui-model-selection，插入本插件。
  DSH 的 hmr 插件会监视 profile 与 patch 文件，保存后实时生效，不需要重启 Host。
.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File .\install.ps1
  powershell -NoProfile -ExecutionPolicy Bypass -File .\install.ps1 -ProfileName web
#>
param(
  [string]$ProfileName = 'desktop'
)

$ErrorActionPreference = 'Stop'

$ProjectDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProfileDir = Join-Path (Join-Path $env:USERPROFILE '.dsh\profiles') $ProfileName
$PatchPath  = Join-Path $ProfileDir 'cordis.patch.yml'
$LinkPath   = Join-Path (Join-Path $ProfileDir 'node_modules') 'dsh-model-picker-groups'
$Marker     = 'dsh-model-picker-groups'

if (-not (Test-Path (Join-Path $ProjectDir 'lib\client.js'))) {
  throw "找不到 $ProjectDir\lib\client.js，请在插件工程目录里运行本脚本。"
}
if (-not (Test-Path $PatchPath)) {
  throw "找不到 $PatchPath，profile 名称是否正确？"
}

# 1. junction（已存在就复用；若存在但不是 junction/指向别处则报错，不擅自删除）
if (Test-Path $LinkPath) {
  $item = Get-Item $LinkPath -Force
  if ($item.LinkType -ne 'Junction') {
    throw "$LinkPath 已存在且不是 junction，请先手工确认再处理。"
  }
  $target = @($item.Target)[0]
  if ($target -ne $ProjectDir) {
    throw "$LinkPath 指向 $target，不是本项目 $ProjectDir；请先运行 uninstall.ps1。"
  }
  Write-Host "[1/3] junction 已存在，跳过：$LinkPath -> $target"
} else {
  New-Item -ItemType Junction -Path $LinkPath -Target $ProjectDir | Out-Null
  Write-Host "[1/3] 已建 junction：$LinkPath -> $ProjectDir"
}

# 2. 备份 patch
$stamp  = [DateTimeOffset]::Now.ToUnixTimeMilliseconds()
$backup = "$PatchPath.bak-picker-groups-$stamp"
Copy-Item $PatchPath $backup
Write-Host "[2/3] 已备份 patch：$backup"

# 3. 追加 patch 条目（幂等：已存在标记就替换整段）
$text = Get-Content $PatchPath -Raw -Encoding UTF8
$begin = "# >>> $Marker"
$end   = "# <<< $Marker"
if ($text.Contains($begin)) {
  $pattern = [regex]::Escape($begin) + '.*?' + [regex]::Escape($end) + "`r?`n?"
  $text = [regex]::Replace($text, $pattern, '', 'Singleline')
  Write-Host "[3/3] patch 里已有旧段落，已先移除"
}
$block = @(
  ''
  "$begin ：对话框模型选择器按供应商分组折叠（本地插件接管官方 ui-model-selection）"
  '# 官方条目仍保留在组合里，只禁用；删掉下面两行即可回到官方选择器。'
  '# 想彻底移除本插件请运行 uninstall.ps1。'
  '- id: ui-model-selection'
  '  disabled: true'
  '- insert:'
  '    - id: model-picker-groups'
  '      name: dsh-model-picker-groups'
  "$end"
  ''
) -join "`r`n"
# 保证与原文之间有空行分隔
if (-not $text.EndsWith("`n")) { $text += "`r`n" }
$text += $block
[IO.File]::WriteAllText($PatchPath, $text, (New-Object Text.UTF8Encoding($false)))
Write-Host "[3/3] 已写入 patch 条目：$PatchPath"

Write-Host ''
Write-Host '完成。DSH 的 hmr 会监视 patch 文件，保存后约 1 秒生效；'
Write-Host '如果模型选择器没有变化，按 Ctrl+Shift+R 刷新页面，仍不行再用 uninstall.ps1 回滚。'
