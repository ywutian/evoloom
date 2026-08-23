# Deploy the public demo to Google Cloud Run

EvoLoom's showcase image combines the classic Agent Canvas UI, the EvoLoom
ACP adapter, and a restricted public gateway. Model credentials remain in
Secret Manager and are never sent to the browser.

The commands below use placeholders so a fork can be deployed without access
to the maintainer's Google Cloud project or model relay.

## 1. Configure the deployment

```bash
export PROJECT_ID="<gcp-project-id>"
export REGION="us-central1"
export SERVICE_NAME="evoloom-demo"
export REPOSITORY="evoloom"
export RUNTIME_SERVICE_ACCOUNT="evoloom-runtime@${PROJECT_ID}.iam.gserviceaccount.com"
export HISTORY_BUCKET="${PROJECT_ID}-evoloom-history"
export IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/canvas:latest"
```

Choose one OpenAI-compatible endpoint and an allowlist supported by that
endpoint:

```bash
export OPENAI_BASE_URL="https://api.openai.com/v1"
export DEFAULT_MODEL="gpt-4o-mini"
export PUBLIC_MODELS="gpt-4o-mini"
```

Do not put the model API key in these variables, shell history, a Docker build
argument, or a checked-in file.

## 2. Create secrets

Create these Secret Manager resources before deployment:

| Secret | Purpose |
| --- | --- |
| `evoloom-model-api-key` | Credential for the configured model endpoint |
| `evoloom-access-key` | Random internal Agent Canvas session key and history-cookie signing key |
| `evoloom-canvas-secret` | Random Agent Canvas application secret |

Grant the runtime service account Secret Manager access only to those three
secrets. Enter secret values through Secret Manager or standard input; never
place them in a command committed to the repository.

## 3. Create persistent conversation storage

```bash
gcloud storage buckets create "gs://${HISTORY_BUCKET}" \
  --project="${PROJECT_ID}" \
  --location="${REGION}" \
  --uniform-bucket-level-access \
  --public-access-prevention

gcloud storage buckets update "gs://${HISTORY_BUCKET}" \
  --lifecycle-file=deploy/gcs-history-lifecycle.json

gcloud storage buckets add-iam-policy-binding "gs://${HISTORY_BUCKET}" \
  --member="serviceAccount:${RUNTIME_SERVICE_ACCOUNT}" \
  --role="roles/storage.objectUser"
```

The checked-in lifecycle deletes conversation objects after 30 days. The
browser's signed HttpOnly ownership cookie uses the same retention period.

## 4. Build the reproducible image

`Dockerfile.cloudrun` fetches the pinned Agent Canvas `v1.15.0` source archive,
verifies its SHA-256 checksum, applies the auditable classic EvoLoom overlay,
and builds the frontend before assembling the runtime image.

```bash
gcloud builds submit \
  --project="${PROJECT_ID}" \
  --region="${REGION}" \
  --config=cloudbuild.yaml \
  --substitutions="_IMAGE=${IMAGE}" \
  .
```

## 5. Deploy a zero-traffic candidate

```bash
gcloud run deploy "${SERVICE_NAME}" \
  --project="${PROJECT_ID}" \
  --region="${REGION}" \
  --image="${IMAGE}" \
  --tag=candidate \
  --no-traffic \
  --execution-environment=gen2 \
  --service-account="${RUNTIME_SERVICE_ACCOUNT}" \
  --cpu=2 \
  --memory=4Gi \
  --concurrency=20 \
  --min=0 \
  --max=1 \
  --timeout=900 \
  --set-env-vars="^@^OPENAI_BASE_URL=${OPENAI_BASE_URL}@MODEL=${DEFAULT_MODEL}@EVOLOOM_PUBLIC_MODELS=${PUBLIC_MODELS}@EVOLOOM_MAX_COST_USD=1@EVOLOOM_MAX_TURNS=20@EVOLOOM_CREATE_PER_VISITOR_PER_HOUR=5@EVOLOOM_CREATE_PER_CLIENT_PER_HOUR=10@EVOLOOM_CREATE_GLOBAL_PER_HOUR=60@EVOLOOM_DAILY_CONVERSATION_LIMIT=50@EVOLOOM_DAILY_USAGE_PATH=/home/openhands/.openhands/agent-canvas/conversations/.evoloom-usage.json" \
  --set-secrets="OPENAI_API_KEY=evoloom-model-api-key:latest,LOCAL_BACKEND_API_KEY=evoloom-access-key:latest,OH_SECRET_KEY=evoloom-canvas-secret:latest" \
  --add-volume="name=history,type=cloud-storage,bucket=${HISTORY_BUCKET},mount-options=implicit-dirs" \
  --add-volume-mount="volume=history,mount-path=/home/openhands/.openhands/agent-canvas/conversations"
```

Grant unauthenticated invocation only after reviewing the public gateway and
setting external abuse controls. Depending on organization policy, use either
an `allUsers` `roles/run.invoker` binding or Cloud Run's invoker-check setting.

## 6. Verify before shifting traffic

On the candidate URL, verify:

1. `/alive` returns 200 and `/canvas/` loads the classic UI.
2. A new browser can create, stream, stop, and reopen a conversation.
3. A second browser cannot list or directly access the first browser's session.
4. The configured model allowlist loads and unsupported models are rejected.
5. The conversation persists after deploying a second candidate revision that
   mounts the same bucket.
6. No secret value appears in Cloud Run or Cloud Build logs.

Only then route production traffic with `gcloud run services update-traffic`.
Keep the previous revision and immutable image digest available for rollback.

## Public-demo warning

The gateway is a defense boundary, not a substitute for account-level spend
controls. Before publishing the URL, configure provider quotas, Google Cloud
budget alerts, and an external request limit appropriate for an anonymous
portfolio demo.
