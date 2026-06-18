#!/usr/bin/env bash
#
# One-command deploy of the ShipIT Forge webhook server to Google Cloud Run.
#
# Prereqs: `gcloud` installed + logged in (`gcloud auth login`), and a GitHub App
# already registered (you have APP_ID, WEBHOOK_SECRET, and the downloaded .pem key).
#
# Usage:
#   PROJECT=your-gcp-project-id \
#   APP_ID=123456 \
#   WEBHOOK_SECRET=your-webhook-secret \
#   PRIVATE_KEY_FILE=./shipit-forge.private-key.pem \
#   ./deploy/cloudrun.sh
#
# Optional overrides: REGION, SERVICE, VERTEX_MODEL, RUNTIME_SA, LLM_PROVIDER.
set -euo pipefail

PROJECT="${PROJECT:?Set PROJECT=your-gcp-project-id}"
REGION="${REGION:-us-central1}"
SERVICE="${SERVICE:-shipit-forge}"
VERTEX_MODEL="${VERTEX_MODEL:-gemini-2.5-pro}"
LLM_PROVIDER="${LLM_PROVIDER:-vertex}"

: "${APP_ID:?Set APP_ID (from your GitHub App settings)}"
: "${WEBHOOK_SECRET:?Set WEBHOOK_SECRET (from your GitHub App settings)}"
: "${PRIVATE_KEY_FILE:?Set PRIVATE_KEY_FILE=path to the App private-key .pem}"
test -f "$PRIVATE_KEY_FILE" || { echo "PRIVATE_KEY_FILE not found: $PRIVATE_KEY_FILE"; exit 1; }

echo "▸ Project=$PROJECT  Region=$REGION  Service=$SERVICE  Provider=$LLM_PROVIDER"

echo "▸ Enabling required APIs…"
gcloud services enable run.googleapis.com secretmanager.googleapis.com \
  cloudbuild.googleapis.com aiplatform.googleapis.com --project "$PROJECT"

echo "▸ Storing the GitHub App private key in Secret Manager (forge-private-key)…"
if ! gcloud secrets describe forge-private-key --project "$PROJECT" >/dev/null 2>&1; then
  gcloud secrets create forge-private-key --replication-policy=automatic --project "$PROJECT"
fi
gcloud secrets versions add forge-private-key --data-file="$PRIVATE_KEY_FILE" --project "$PROJECT"

PROJ_NUM="$(gcloud projects describe "$PROJECT" --format='value(projectNumber)')"
RUNTIME_SA="${RUNTIME_SA:-${PROJ_NUM}-compute@developer.gserviceaccount.com}"
echo "▸ Runtime service account: $RUNTIME_SA"

echo "▸ Granting the runtime SA access to the secret + Vertex AI…"
gcloud secrets add-iam-policy-binding forge-private-key \
  --member="serviceAccount:${RUNTIME_SA}" --role=roles/secretmanager.secretAccessor --project "$PROJECT" >/dev/null
# Vertex auth uses the runtime SA's identity (ADC) — no JSON key needed on the server.
gcloud projects add-iam-policy-binding "$PROJECT" \
  --member="serviceAccount:${RUNTIME_SA}" --role=roles/aiplatform.user >/dev/null

echo "▸ Deploying to Cloud Run (builds the Dockerfile)…"
gcloud run deploy "$SERVICE" \
  --source . \
  --project "$PROJECT" --region "$REGION" \
  --service-account "$RUNTIME_SA" \
  --allow-unauthenticated \
  --set-env-vars "LLM_PROVIDER=${LLM_PROVIDER},VERTEX_PROJECT=${PROJECT},VERTEX_LOCATION=${REGION},VERTEX_MODEL=${VERTEX_MODEL},APP_ID=${APP_ID},WEBHOOK_SECRET=${WEBHOOK_SECRET}" \
  --set-secrets "PRIVATE_KEY=forge-private-key:latest"

URL="$(gcloud run services describe "$SERVICE" --project "$PROJECT" --region "$REGION" --format='value(status.url)')"
echo ""
echo "✅ Deployed: $URL"
echo "➡  In your GitHub App settings, set the Webhook URL to:"
echo "      ${URL}/api/github/webhooks"
echo "➡  Then install the App on your org and open an issue (label: agent-fix) to test."
