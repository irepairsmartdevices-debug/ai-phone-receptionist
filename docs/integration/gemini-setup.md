# Connect Google Gemini

The receptionist supports Gemini through the shared simulator and phone dialogue
engine. The exact `gemini-3.8-flash` model uses Google's Interactions API, matching
the owner's Google AI Studio export. Other configured Gemini models retain the
existing generateContent path. Gemini Live audio streaming is separate.
The existing repair integration supplies current prices and exact model variants.

## Private Vercel settings

1. Open [Google AI Studio API keys](https://aistudio.google.com/api-keys) and create
   an API key for your Google project. Check that project's Gemini API access,
   quota and billing settings. Do not send the key in chat.
2. In the **ai-phone-receptionist** Vercel project's Environment Variables, add or
   update these under **Production**:

| Key | Value |
| --- | --- |
| `AI_PROVIDER` | `gemini` |
| `GEMINI_API_KEY` | Your private Google key; choose **Secret** |
| `GEMINI_MODEL` | `gemini-3.8-flash`, or a supported version available in your project |

3. Save and redeploy the receptionist. Keep its repair-service, database and
   authentication settings. Its earlier OpenAI key can remain for explicit rollback;
   Gemini traffic does not silently fall back to OpenAI.
4. After the deployment is Ready, sign in and open **Settings → AI connection**.
   Select **Test Gemini connection**. A configured key alone is not a passed test.
5. Once the check passes, try a conversation: "My phone took a swim", supply its
   model and symptoms, then ask about a known repair price. Compare with the repair
   app. The check proves provider access, not every conversation outcome.

The explicit Gemini 3.8 Flash model uses `thinking_level: "medium"`, matching the
owner's export. Its Interactions request uses `store:false`, `stream:false` and
`background:false`, with the existing bounded public input and JSON schema. The
adapter reads completed model-output text steps from raw REST, ignores thoughts,
and rejects incomplete, errored, tool, nontext or ambiguous results. It does not
use the SDK-only `output_text` convenience field or send previous interaction IDs.
The exported Google Search tool is omitted because shop facts come from saved
answers and the repair integration. Output budgets remain 512 tokens for checks
and 2048 for plans; the exported 65,536-token default is not adopted. The earlier
explicit temperature override is omitted to match the exported generation config.
Other models retain their existing settings. Google's [official JavaScript
SDK quickstart](https://github.com/googleapis/js-genai#quickstart) also uses the
`gemini-flash-latest` alias, whose underlying model can change. Account/model availability must be verified with
the connection check. API usage is billed or quota-limited by your Google account;
no current price is assumed here.

The request contract follows Google's [structured-output cookbook](https://github.com/google-gemini/cookbook/blob/b06b824cf2ea29f9543ffa14adcee68b5f934a9b/quickstarts/JSON_mode.ipynb)
and [Interactions SDK types](https://github.com/googleapis/python-genai/blob/34b58fd1b2aa387dff5976bbefa1c1268958369f/google/genai/_gaos/types/interactions/createmodelinteraction.py).
Google also documents generateContent for the same model. Switching APIs is a
compatibility adjustment, not proof of the earlier timeout's cause. Verify the
deployed connection with the private key before claiming live provider access.
Use `AI_PROVIDER=openai` to deliberately restore the earlier OpenAI provider, or
`AI_PROVIDER=none` for deterministic saved answers and workflows; redeploy changes.

## Connection check messages

- Missing key: add `GEMINI_API_KEY` in the receptionist's Production environment.
- Rejected key: verify that key's Google project and API permissions.
- Unavailable model: set `GEMINI_MODEL` to a supported model available to the project.
- Usage limit: check Google's quota/billing for the selected project.
- Timeout/unavailable: retry later. No repeated automatic paid retries occur.
- Unsupported response: check the model supports structured JSON output.

After a new check, expand **Test details** to see its elapsed time, whether it
stopped before or after response headers, and any received HTTP status. A timeout
reported by the provider is separate from the app's own deadline. Connection codes
are limited to a fixed network-error allowlist; raw provider messages, URLs,
request bodies and credentials are never included. These details observe the same
single request and do not trigger extra requests.

The check also records the actual API path as a fixed label, validated deployment
commit, server region and Node version when available. Native Node HTTP events
can show the last observed milestone: request created, connection ready, request
body written, or final response headers received. Events are correlated by async
context and request identity, so simultaneous requests cannot exchange results.
Observers are removed when fetch settles. No headers, body, URL, address, key or
key-derived fingerprint is included in these milestones.

These are client-side observations. A body-written event does not establish that
Google accepted the request. No reported milestones means the runtime did not
provide observable events; it does not prove a network connection failed. The
30-second health deadline, eight-second customer deadline and provider transport
remain unchanged.

For HTTP 400 responses, details also show recognized provider status codes,
recognized API/project rejection reasons, and known request-setting names when
Google supplies them. Values come from fixed allowlists; error descriptions and
arbitrary field names are discarded. A setting mentioned in an error is a
diagnostic hint, not a claim that changing it will resolve the request.

Checks are administrator-only and protected by the normal same-origin rule. A
45-second shared reservation prevents concurrent button clicks from sending repeated
paid requests. Gemini connection tests allow up to 30 seconds for the provider;
customer conversation requests retain their eight-second fallback deadline. The
check route allows additional time for authorization and saving the result. Stored
results contain a private configuration fingerprint and safe status fields, not
the API key. The browser sees only the provider/model and check
result. Changing the selected key/model invalidates an earlier success. Errors do
not expose raw provider responses. A last successful check is historical evidence;
it is not a guarantee of future quota, uptime, or model access.

## Conversation boundaries

Gemini identifies intents, supplied details, approved topics and relevant current
catalog records. It selects a useful missing question and supported wording style.
The server supplies owner-written answers verbatim and resolves factual workflows.
Unknown prices, unlisted model variants, unsupported policies and diagnoses are not
invented. Ticket verification and booking confirmations keep their existing rules.
Phone-number setup remains separate from selecting Gemini.
