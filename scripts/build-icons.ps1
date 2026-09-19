param(
  [string]$SourcePath = "icons\icon-source.png"
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$projectRoot = Split-Path -Parent $PSScriptRoot
$resolvedSource = [System.IO.Path]::GetFullPath((Join-Path $projectRoot $SourcePath))
$iconRoot = Join-Path $projectRoot "icons"

if (-not (Test-Path -LiteralPath $resolvedSource)) {
  throw "아이콘 원본을 찾을 수 없습니다: $resolvedSource"
}

$source = [System.Drawing.Image]::FromFile($resolvedSource)
try {
  $targets = @(
    @{ Name = "icon-192.png"; Size = 192 },
    @{ Name = "icon-512.png"; Size = 512 },
    @{ Name = "apple-touch-icon.png"; Size = 180 }
  )

  foreach ($target in $targets) {
    $size = [int]$target.Size
    $bitmap = New-Object System.Drawing.Bitmap($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    try {
      $graphics.Clear([System.Drawing.ColorTranslator]::FromHtml("#18202a"))
      $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
      $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
      $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
      $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
      $graphics.DrawImage($source, 0, 0, $size, $size)
      $targetPath = Join-Path $iconRoot $target.Name
      $bitmap.Save($targetPath, [System.Drawing.Imaging.ImageFormat]::Png)
    } finally {
      $graphics.Dispose()
      $bitmap.Dispose()
    }
  }
} finally {
  $source.Dispose()
}

Write-Host "PWA 아이콘 192px, 512px, Apple 180px를 생성했습니다."
