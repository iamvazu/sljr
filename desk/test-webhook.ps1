# Acceptance Test #3 (steven-lenz-ai-team.md §8) — PowerShell Webhook Test
param(
  [Parameter(Mandatory=$true)][string]$WebhookUrl,
  [Parameter(Mandatory=$true)][string]$BearerToken
)

$now = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
$body = @{
  lead_id = "lead_test_jordan_001"
  received_at = $now
  source_page = "/#terrace"
  scene = "terrace"
  name = "Jordan Rivera"
  email = "jordan@example.com"
  phone = "+19255550123"
  interest = "buying"
  budget = "`$4M-`$6M"
  timeline = "0-3 months"
  areas = @("Danville", "Alamo")
  segment = "sports_entertainment"
  message = "Relocating to the Bay Area on a short timeline, looking for gated privacy in Danville or Alamo."
  email_consent = $true
  sms_consent = $false
  consent_text_version = "2026-11-v1"
  consent_timestamp = $now
  utm = @{ source = "pitch-demo"; medium = "live"; campaign = "new-lenz" }
} | ConvertTo-Json -Depth 4

Invoke-RestMethod -Method Post -Uri $WebhookUrl -Headers @{ Authorization = "Bearer $BearerToken" } -ContentType "application/json" -Body $body

