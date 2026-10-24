param(
  [string]$Archive,
  [string]$Destination = (Join-Path $env:APPDATA 'Godot/export_templates/4.7.2.stable')
)
$ErrorActionPreference = 'Stop'
$download = -not $Archive
if ($download) { $Archive = Join-Path ([IO.Path]::GetTempPath()) ('godot-templates-' + [guid]::NewGuid() + '.tpz') }
try {
  if ($download) {
    Invoke-WebRequest -Uri 'https://github.com/godotengine/godot-builds/releases/download/4.7.2-stable/Godot_v4.7.2-stable_export_templates.tpz' -OutFile $Archive
  }
  $expected = 'ca4d71c4d7b81dfc15d1a98baa07534aa95b03fdda78a0075b06672e1648d2e5f40980c9adc28d23e1b92e732ee7bf3461997aa804af74ec2fcd7a93ccb84079'
  if ((Get-FileHash -LiteralPath $Archive -Algorithm SHA512).Hash.ToLowerInvariant() -ne $expected) {
    throw 'Official Godot template archive SHA-512 mismatch.'
  }
  New-Item -ItemType Directory -Path $Destination -Force | Out-Null
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $zip = [IO.Compression.ZipFile]::OpenRead((Resolve-Path -LiteralPath $Archive))
  try {
    foreach ($name in @('windows_release_x86_64.exe', 'version.txt')) {
      $entry = $zip.GetEntry('templates/' + $name)
      if ($null -eq $entry) { throw "Official template archive is missing $name" }
      [IO.Compression.ZipFileExtensions]::ExtractToFile($entry, (Join-Path $Destination $name), $true)
    }
  } finally { $zip.Dispose() }
  Write-Host "Installed verified Godot 4.7.2 Windows release templates in $Destination"
} finally {
  if ($download -and (Test-Path -LiteralPath $Archive)) { Remove-Item -LiteralPath $Archive }
}
