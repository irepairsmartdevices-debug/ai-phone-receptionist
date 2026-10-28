# Connect Google Gemini

The receptionist supports Gemini through the shared simulator and phone dialogue
engine. This uses Gemini generateContent; Gemini Live audio streaming is separate.
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
| `GEMINI_MODEL` | `gemini-flash-latest`, or a supported version available in your project |

3. Save and redeploy the receptionist. Keep its repair-service, database and
   authentication settings. Its earlier OpenAI key can remain for explicit rollback;
   Gemini traffic does not silently fall back to OpenAI.
4. After the deployment is Ready, sign in and open **Settings → AI connection**.
   Select **Test Gemini connection**. A configured key alone is not a passed test.
5. Once the check passes, try a conversation: "My phone took a swim", supply its
   model and symptoms, then ask about a known repair price. Compare with the repair
   app. The check proves provider access, not every conversation outcome.

The model alias comes from [Google's official JavaScript SDK quickstart](https://github.com/googleapis/js-genai#quickstart).
Its underlying model can change. Account/model availability must be verified with
the connection check. API usage is billed or quota-limited by your Google account;
no current price is assumed here.
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
