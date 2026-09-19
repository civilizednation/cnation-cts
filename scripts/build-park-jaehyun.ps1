param(
  [string]$SourcePath = "..\신경외과의사 박재현 001-289 完.txt"
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$resolvedSource = [System.IO.Path]::GetFullPath((Join-Path $projectRoot $SourcePath))
$bookRoot = Join-Path $projectRoot "data\books\park-jaehyun"
$volumeRoot = Join-Path $bookRoot "volumes"

if (-not (Test-Path -LiteralPath $resolvedSource)) {
  throw "원문 파일을 찾을 수 없습니다: $resolvedSource"
}

New-Item -ItemType Directory -Path $volumeRoot -Force | Out-Null

$text = [System.IO.File]::ReadAllText($resolvedSource, [System.Text.Encoding]::UTF8)
$pattern = '(?m)^(?<episode>\d+)화(?:\s+(?<subtitle>[^\r\n]+))?\s*\r?$'
$matches = [regex]::Matches($text, $pattern)

if ($matches.Count -ne 289) {
  throw "회차 제목을 289개 찾아야 하지만 $($matches.Count)개를 찾았습니다."
}

$chapters = [System.Collections.Generic.List[object]]::new()
for ($index = 0; $index -lt $matches.Count; $index++) {
  $match = $matches[$index]
  $episode = [int]$match.Groups['episode'].Value
  $subtitle = $match.Groups['subtitle'].Value.Trim()
  $contentStart = $match.Index + $match.Length
  $contentEnd = if ($index + 1 -lt $matches.Count) { $matches[$index + 1].Index } else { $text.Length }
  $content = $text.Substring($contentStart, $contentEnd - $contentStart)
  $content = ($content -replace "\r\n", "`n" -replace "\r", "`n").Trim()

  $chapters.Add([ordered]@{
    number = $episode
    title = if ($subtitle) { "$episode`화 $subtitle" } else { "$episode`화" }
    content = $content
  })
}

for ($index = 0; $index -lt $chapters.Count; $index++) {
  $expected = $index + 1
  if ($chapters[$index].number -ne $expected) {
    throw "회차 순서 오류: $expected 화 위치에 $($chapters[$index].number)화가 있습니다."
  }
}

$ranges = @(
  @(1, 100),
  @(101, 200),
  @(201, 289)
)
$catalogVolumes = [System.Collections.Generic.List[object]]::new()

for ($index = 0; $index -lt $ranges.Count; $index++) {
  $volume = $index + 1
  $startEpisode = $ranges[$index][0]
  $endEpisode = $ranges[$index][1]
  $volumeChapters = @($chapters | Where-Object { $_.number -ge $startEpisode -and $_.number -le $endEpisode })
  $fileName = "volume-{0:D2}.json" -f $volume
  $targetPath = Join-Path $volumeRoot $fileName

  $volumeObject = [ordered]@{
    volume = $volume
    title = "신경외과의사 박재현 $volume`권"
    startEpisode = $startEpisode
    endEpisode = $endEpisode
    chapterCount = $volumeChapters.Count
    chapters = $volumeChapters
  }
  $json = $volumeObject | ConvertTo-Json -Depth 6 -Compress
  [System.IO.File]::WriteAllText($targetPath, $json, [System.Text.UTF8Encoding]::new($false))

  $catalogVolumes.Add([ordered]@{
    volume = $volume
    title = "$volume`권"
    startEpisode = $startEpisode
    endEpisode = $endEpisode
    chapterCount = $volumeChapters.Count
    path = "./data/books/park-jaehyun/volumes/$fileName"
  })
}

$catalog = [ordered]@{
  id = "park-jaehyun"
  title = "신경외과의사 박재현"
  author = ""
  label = "의학 장편소설"
  mark = "朴"
  totalEpisodes = 289
  totalVolumes = 3
  generatedAt = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ssK")
  volumes = $catalogVolumes
}

$catalogJson = $catalog | ConvertTo-Json -Depth 5
[System.IO.File]::WriteAllText((Join-Path $bookRoot "catalog.json"), $catalogJson, [System.Text.UTF8Encoding]::new($false))

Write-Host "완료: 신경외과의사 박재현 289화를 3권으로 생성했습니다."
