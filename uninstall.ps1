#Requires -Version 5.1
<#
.SYNOPSIS
  卸载「模型选择器分组折叠」插件，恢复官方模型选择器。
.DESCRIPTION
  删除 patch 里带标记的整段（重新启用官方 ui-model-selection，移除本插件条目），
  再删掉 <profile>\node_modules 下的 junction。不会删除本项目目录，也不会动其他 patch 条目。
  patch 的安装前备份（*.bak-picker-groups-<毫秒>）保留在同一目录，需要时可手工对比。
.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File .\uninstall.ps1
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

if (-not (Test-Path $PatchPath)) { throw "找不到 $PatchPath" }

$text = Get-Content $PatchPath -Raw -Encoding UTF8
$begin = "# >>> $Marker"
$end   = "# <<< $Marker"
if ($text.Contains($begin)) {
  $pattern = [regex]::Escape($begin) + '.*?' + [regex]::Escape($end) + "`r?`n?"
  $text = [regex]::Replace($text, $pattern, '', 'Singleline')
  # 清清掉可能留下的连续空行
  $text = [regex]::Replace($text, "(\r?\n){3,}", "`r`n`r`n")
  [IO.File]::WriteAllText($PatchPath, $text, (New-Object Text.UTF8Encoding($false)))
  Write-Host "[1/2] 已从 patch 移除本插件条目：$PatchPath"
} else {
  Write-Host "[1/2] patch 里没有本插件条目，跳过"
}

if (Test-Path $LinkPath) {
  $item = Get-Item $LinkPath -Force
  if ($item.LinkType -eq 'Junction') {
    # 删 junction 本身，不会递归删除目标目录内容
    [IO.Directory]::Delete($LinkPath)
    Write-Host "[2/2] 已删除 junction：$LinkPath"
  } else {
    Write-Host "[2/2] $LinkPath 不是 junction，未删除（请手工确认）"
  }
} else {
  Write-Host "[2/2] junction 不存在，跳过"
}

Write-Host ''
Write-Host "完成。DSH 的 hmr 会重新组合 patch；官网选择器恢复后若仍无变化，刷新页面（Ctrl+Shift+R）。"
Write-Host "工程目录 $ProjectDir 仍保留，可随时重新运行 install.ps1。"
