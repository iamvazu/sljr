#!/usr/bin/env bash
# Acceptance Test #3 (steven-lenz-ai-team.md §8) — Sample Sports & Entertainment Lead Webhook
set -euo pipefail

: "${OMB_LEAD_WEBHOOK_URL:?Set OMB_LEAD_WEBHOOK_URL (e.g. https://desk.lenzrealestate.com/hooks/wh_...)}"
: "${OMB_LEAD_WEBHOOK_TOKEN:?Set OMB_LEAD_WEBHOOK_TOKEN}"

curl -fsS -X POST "$OMB_LEAD_WEBHOOK_URL" \
  -H "Authorization: Bearer $OMB_LEAD_WEBHOOK_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "lead_id": "lead_test_jordan_001",
    "received_at": "'"$(date -u +%Y-%m-%dT%H:%M:%SZ)"'",
    "source_page": "/#terrace",
    "scene": "terrace",
    "name": "Jordan Rivera",
    "email": "jordan@example.com",
    "phone": "+19255550123",
    "interest": "buying",
    "budget": "$4M-$6M",
    "timeline": "0-3 months",
    "areas": ["Danville", "Alamo"],
    "segment": "sports_entertainment",
    "message": "Relocating to the Bay Area on a short timeline, looking for gated privacy in Danville or Alamo.",
    "email_consent": true,
    "sms_consent": false,
    "consent_text_version": "2026-11-v1",
    "consent_timestamp": "'"$(date -u +%Y-%m-%dT%H:%M:%SZ)"'",
    "utm": { "source": "pitch-demo", "medium": "live", "campaign": "new-lenz" }
  }'
echo ""

