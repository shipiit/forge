# Provider setup — configure ShipIT Forge with any LLM

ShipIT Forge supports **Vertex AI Gemini**, **AWS Bedrock**, **OpenAI**, and **Anthropic**. Pick one,
get its credentials, and set the environment variables below. The same variables work everywhere —
the **CLI**, the **GitHub Action** (as repo/org secrets), and the **hosted App** (as server env).

Select the provider with `LLM_PROVIDER` (or the Action's `provider:` input). Quick reference:

| Provider | `LLM_PROVIDER` | Required variables | Default model |
|---|---|---|---|
| Anthropic | `anthropic` | `ANTHROPIC_API_KEY` | `claude-opus-4-8` |
| OpenAI | `openai` | `OPENAI_API_KEY` | `gpt-4o` |
| Vertex Gemini | `vertex` | `VERTEX_PROJECT`, creds (see below) | `gemini-2.5-pro` |
| Bedrock | `bedrock` | AWS creds, `AWS_REGION`, `BEDROCK_MODEL_ID` | `anthropic.claude-3-5-sonnet-20241022-v2:0` |

---

## 1. Anthropic

**Get a key:** https://console.anthropic.com → API Keys → Create Key (`sk-ant-…`).

```bash
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-xxxxxxxx
ANTHROPIC_MODEL=claude-opus-4-8   # optional
```

- **CLI:** `export ANTHROPIC_API_KEY=… && node dist/cli.js fix --repo . --task "…" --provider anthropic`
- **Action:** add secret `ANTHROPIC_API_KEY`; in the workflow `env:` set `ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}` and `provider: anthropic`.
- **App:** set `LLM_PROVIDER=anthropic` and `ANTHROPIC_API_KEY` on the server.

## 2. OpenAI

**Get a key:** https://platform.openai.com/api-keys → Create new secret key (`sk-…`).

```bash
LLM_PROVIDER=openai
OPENAI_API_KEY=sk-xxxxxxxx
OPENAI_MODEL=gpt-4o   # optional
```

- **CLI:** `export OPENAI_API_KEY=… && node dist/cli.js fix --repo . --task "…" --provider openai`
- **Action:** secret `OPENAI_API_KEY`; `env: OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}`, `provider: openai`.

## 3. Vertex AI Gemini (Google Cloud)

**Set up:**
1. Create / pick a GCP project; enable the **Vertex AI API**
   (https://console.cloud.google.com/apis/library/aiplatform.googleapis.com).
2. **IAM & Admin → Service Accounts** → create one → grant role **Vertex AI User**
   (`roles/aiplatform.user`).
3. **Keys → Add key → JSON** → download the key file. Keep it private.

```bash
LLM_PROVIDER=vertex
VERTEX_PROJECT=your-gcp-project
VERTEX_LOCATION=us-central1
VERTEX_MODEL=gemini-2.5-pro
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
```

- **CLI:** easiest is `node dist/cli.js setup` (paste the JSON or give its path), or export the vars above.
- **Action:** add secret `VERTEX_SA_JSON` (paste the whole JSON) and variable `VERTEX_PROJECT`; in the
  workflow `env:` set `LLM_PROVIDER: vertex`, `VERTEX_PROJECT: ${{ vars.VERTEX_PROJECT }}`,
  `VERTEX_CREDENTIALS_JSON: ${{ secrets.VERTEX_SA_JSON }}`, `provider: vertex`.
- **App on Cloud Run:** no key file needed — grant the Cloud Run service account `roles/aiplatform.user`
  (the [`deploy/cloudrun.sh`](./cloudrun.sh) script does this) and auth works via the runtime identity.

## 4. AWS Bedrock

**Set up:**
1. In the AWS console → **Bedrock → Model access**, request/enable access to the model you want
   (e.g. Anthropic Claude) in your region.
2. Create credentials (IAM user/role) with `bedrock:InvokeModel` permission, or run on infra with an
   IAM role that has it.

```bash
LLM_PROVIDER=bedrock
AWS_REGION=us-east-1
BEDROCK_MODEL_ID=anthropic.claude-3-5-sonnet-20241022-v2:0
AWS_ACCESS_KEY_ID=AKIA...        # or use an attached IAM role
AWS_SECRET_ACCESS_KEY=...
```

- **CLI:** export the AWS vars (or use a configured `~/.aws` profile) and run `--provider bedrock`.
- **Action:** add secrets `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`; `env:` set `LLM_PROVIDER: bedrock`,
  `AWS_REGION`, `BEDROCK_MODEL_ID`, `provider: bedrock`.

---

## Choosing a model per repo

`.github/agent.yml` can override the model without changing secrets:

```yaml
model: gemini-2.5-pro   # provider-specific id
```

## Vision (screenshots in issues/PRs)

All four providers' default models above are vision-capable, so Forge can read screenshots embedded in
issues and PRs automatically. If you switch to a text-only model, image content is skipped with a logged
warning.

## Troubleshooting

- **401/403** → wrong or missing key, or (Vertex/Bedrock) the service account/IAM lacks the model role.
- **Model not found** → set the right `*_MODEL` / `BEDROCK_MODEL_ID` for your provider/region, and for
  Bedrock make sure model access is enabled in that region.
- **Vertex "permission denied"** → grant `roles/aiplatform.user` and confirm `VERTEX_PROJECT`/`VERTEX_LOCATION`.
