# Gemini connection control

Open `gemini_connection_control.ipynb` in Google Colab and run its one code cell.
Use the private Google AI Studio **AI Receptionist** project key that is also
configured as `GEMINI_API_KEY` in Vercel. Enter it only in the masked prompt; share
only the printed result. The notebook contains the standalone Python script
verbatim and has no saved execution output.

This is a diagnostic artifact, not a production app change. It sends the exact
fixed connection-check request used by receptionist commit `56fd80b` from a
separate Linux runtime: same model, API, system instruction, JSON input/schema,
medium thinking, 512-token cap, disabled interaction storage/background/streaming,
and 30-second wall-clock deadline. It does not use customer data, retries, tools,
SDK defaults, Google Drive or environment/credential files. HTTP redirects are
refused, TLS verification remains enabled, and bodies are bounded to 64 KiB.
Only fixed status fields, elapsed time and recognized numeric token counts can be
printed; raw provider messages and keys are omitted.

Run the developer checks with:

```sh
python docs/diagnostics/test_gemini_connection_control.py
```

Validation: 10/10 tests passed, including the actual urllib redirect machinery,
a real short wall-clock deadline, strict JSON/health validation, private-error
omission, oversized responses and refusing unmasked input. An independent review
also ran these checks. A separately captured request from the production
TypeScript provider matched the Python request URL and parsed body exactly.
No real Google API request was sent during this validation.

Interpretation: a PASS establishes that this key/request worked from that runtime
at that time. A timeout or 503 is useful evidence but does not identify its cause.
A result outside Vercel must be compared with a nearby deployed-app check before
attributing a problem to a particular runtime; transient provider availability
can differ between attempts. The AI Studio rate-limit screenshot reports peak
usage over its selected window and does not prove today's remaining allowance.
