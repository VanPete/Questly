# Questly API + Supabase diagnostics (PowerShell)
# Edit these two variables before running. Do NOT commit real secrets.
$BaseUrl = "https://thequestly.com"    # or "http://localhost:3000"
$Secret  = "REPLACE_WITH_CRON_SECRET"  # CRON_SECRET from .env.local

Write-Host "== /api/daily?debug=1 =="
try { Invoke-RestMethod -Uri "$BaseUrl/api/daily?debug=1" -Method GET | ConvertTo-Json -Depth 6 } catch { Write-Host $_ }

Write-Host "== /api/debug/daily-topics =="
try { Invoke-RestMethod -Uri "$BaseUrl/api/debug/daily-topics?secret=$Secret" -Method GET | ConvertTo-Json -Depth 6 } catch { Write-Host $_ }

Write-Host "== /api/debug/profile-state =="
try { Invoke-RestMethod -Uri "$BaseUrl/api/debug/profile-state?secret=$Secret" -Method GET | ConvertTo-Json -Depth 6 } catch { Write-Host $_ }

Write-Host "== /api/debug/bootstrap (forcing bootstrap) =="
try { Invoke-RestMethod -Uri "$BaseUrl/api/debug/bootstrap?secret=$Secret" -Method GET | ConvertTo-Json -Depth 6 } catch { Write-Host $_ }

Write-Host "== /api/debug/profile-state (after bootstrap) =="
try { Invoke-RestMethod -Uri "$BaseUrl/api/debug/profile-state?secret=$Secret" -Method GET | ConvertTo-Json -Depth 6 } catch { Write-Host $_ }

Write-Host "== /api/debug/env =="
try { Invoke-RestMethod -Uri "$BaseUrl/api/debug/env?secret=$Secret" -Method GET | ConvertTo-Json -Depth 6 } catch { Write-Host $_ }

Write-Host "Done. Copy the JSON blocks above." 

# Notes:
# 1. Must be run while you're logged in via a browser sharing session cookies if using localhost.
#    For localhost this script will NOT send browser cookies; prefer hitting endpoints in a browser tab when auth needed.
# 2. If /api/daily meta.source != function_or_direct or wanted length < 3, include its meta.debug in your report.
# 3. Use diagnostics.sql inside Supabase SQL editor and share outputs.