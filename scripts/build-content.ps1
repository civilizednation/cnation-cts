param(
  [string]$SourcePath = "..\닥터 최태수[퓨전] 1-3236(完).txt"
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$resolvedSource = [System.IO.Path]::GetFullPath((Join-Path $projectRoot $SourcePath))
$dataRoot = Join-Path $projectRoot "data"
$volumeRoot = Join-Path $dataRoot "volumes"

if (-not (Test-Path -LiteralPath $resolvedSource)) {
  throw "원문 파일을 찾을 수 없습니다: $resolvedSource"
}

New-Item -ItemType Directory -Path $volumeRoot -Force | Out-Null

$text = [System.IO.File]::ReadAllText($resolvedSource, [System.Text.Encoding]::UTF8)
$pattern = '(?m)^(?:(?<serial>\d{5})\s+(?<episode>\d+)화(?:\s+\([^\r\n]*\))?|<--\s*(?<commentEpisode>\d+)화\s*-->)\s*\r?$'
$matches = [regex]::Matches($text, $pattern)

if ($matches.Count -ne 3236) {
  throw "회차 제목을 3,236개 찾아야 하지만 $($matches.Count)개를 찾았습니다."
}

$chapters = [System.Collections.Generic.List[object]]::new()
for ($index = 0; $index -lt $matches.Count; $index++) {
  $match = $matches[$index]
  $episode = if ($match.Groups['episode'].Success) {
    [int]$match.Groups['episode'].Value
  } else {
    [int]$match.Groups['commentEpisode'].Value
  }

  $contentStart = $match.Index + $match.Length
  $contentEnd = if ($index + 1 -lt $matches.Count) { $matches[$index + 1].Index } else { $text.Length }
  $content = $text.Substring($contentStart, $contentEnd - $contentStart)
  $content = ($content -replace "\r\n", "`n" -replace "\r", "`n").Trim()

  $chapters.Add([ordered]@{
    number = $episode
    title = "$episode`화"
    content = $content
  })
}

$expected = 1
foreach ($chapter in $chapters) {
  if ($chapter.number -ne $expected) {
    throw "회차 순서 오류: $expected 화 위치에 $($chapter.number)화가 있습니다."
  }
  $expected++
}

$catalogVolumes = [System.Collections.Generic.List[object]]::new()
for ($volume = 1; $volume -le 27; $volume++) {
  $startEpisode = (($volume - 1) * 120) + 1
  $endEpisode = [Math]::Min($volume * 120, 3236)
  $volumeChapters = @($chapters | Where-Object { $_.number -ge $startEpisode -and $_.number -le $endEpisode })
  $volumeObject = [ordered]@{
    volume = $volume
    title = "닥터 최태수 $volume`권"
    startEpisode = $startEpisode
    endEpisode = $endEpisode
    chapterCount = $volumeChapters.Count
    chapters = $volumeChapters
  }

  $fileName = "volume-{0:D2}.json" -f $volume
  $targetPath = Join-Path $volumeRoot $fileName
  $json = $volumeObject | ConvertTo-Json -Depth 6 -Compress
  [System.IO.File]::WriteAllText($targetPath, $json, [System.Text.UTF8Encoding]::new($false))

  $catalogVolumes.Add([ordered]@{
    volume = $volume
    title = "$volume`권"
    startEpisode = $startEpisode
    endEpisode = $endEpisode
    chapterCount = $volumeChapters.Count
    path = "./data/volumes/$fileName"
  })
}

$catalog = [ordered]@{
  title = "닥터 최태수"
  author = "조석호"
  totalEpisodes = 3236
  totalVolumes = 27
  generatedAt = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ssK")
  volumes = $catalogVolumes
}

$catalogJson = $catalog | ConvertTo-Json -Depth 5
[System.IO.File]::WriteAllText((Join-Path $dataRoot "catalog.json"), $catalogJson, [System.Text.UTF8Encoding]::new($false))

Write-Host "완료: 3,236화를 27권으로 생성했습니다."
