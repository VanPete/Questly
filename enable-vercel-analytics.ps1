# enable-vercel-analytics.ps1
# Run from your Next.js project root (where package.json and /app exist)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# 0) Guard
if (-not (Test-Path package.json) -or -not (Test-Path app)) {
  Write-Error "Run this from your Next.js project root (missing package.json or /app)."
  exit 1
}

# 1) Install @vercel/analytics using your package manager
if     (Test-Path "pnpm-lock.yaml") { $install = "pnpm add @vercel/analytics" }
elseif (Test-Path "yarn.lock")      { $install = "yarn add @vercel/analytics" }
else                                 { $install = "npm i @vercel/analytics" }

Write-Host "Installing @vercel/analytics..."
cmd /c $install

# 2) Patch app/layout.tsx
$layoutPath = "app\layout.tsx"
if (-not (Test-Path $layoutPath)) {
  Write-Error "Cannot find $layoutPath. Do you have an App Router layout?"
  exit 1
}

$content = Get-Content $layoutPath -Raw

# 2a) Add import line if missing
$importLine = "import { Analytics } from '@vercel/analytics/react';"
$importRegex = [regex]::Escape($importLine)

if ($content -notmatch $importRegex -and $content -notmatch "@vercel/analytics/react") {
  # Insert after the first existing import; otherwise prepend
  $lines = $content -split '\r?\n'
  $firstImport = ($lines | Select-String -Pattern '^import ' | Select-Object -First 1)
  if ($firstImport) {
    $idx = $firstImport.LineNumber
    $lines = @($lines[0..($idx-1)]) + $importLine + @($lines[$idx..($lines.Length-1)])
  } else {
    $lines = @($importLine) + $lines
  }
  $content = ($lines -join [Environment]::NewLine)
  Write-Host "Added import: $importLine"
} else {
  Write-Host "Import already present."
}

# 2b) Inject <Analytics /> before </body> if missing
if ($content -notmatch "<Analytics\s*/>") {
  if ($content -match "</body>") {
    $injection = "        <Analytics />" + [Environment]::NewLine + "      </body>"
    $content = $content.Replace("</body>", $injection)
    Write-Host "Injected <Analytics /> into layout."
  } else {
    Write-Warning "Could not find </body> tag; please add <Analytics /> inside your RootLayout body manually."
  }
} else {
  Write-Host "<Analytics /> already present."
}

# 2c) Save file
Set-Content -Path $layoutPath -Value $content -Encoding UTF8
Write-Host "Vercel Analytics wiring complete."
Write-Host ""
Write-Host "Next:"
Write-Host "  pnpm dev    # verify locally"
Write-Host "  git add -A && git commit -m 'enable vercel analytics' && git push"
Write-Host "  Check Vercel → Analytics for page views."
