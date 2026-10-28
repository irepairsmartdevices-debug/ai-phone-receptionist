"""One fixed Gemini check for a Google Colab Linux runtime; no dependencies."""
import getpass
import json
import signal
import socket
import time
import urllib.error
import urllib.request
import warnings

ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/interactions"
MODEL = "gemini-3.8-flash"
PROVIDER_CODES = {
    "INVALID_ARGUMENT", "FAILED_PRECONDITION", "NOT_FOUND", "PERMISSION_DENIED",
    "UNAUTHENTICATED", "RESOURCE_EXHAUSTED", "UNAVAILABLE", "DEADLINE_EXCEEDED",
    "INTERNAL", "UNKNOWN", "ABORTED", "OUT_OF_RANGE", "UNIMPLEMENTED",
}
COMPLETION_STATUSES = {
    "completed", "incomplete", "failed", "cancelled", "queued", "in_progress",
    "budget_exceeded", "requires_action", "requires_continuation",
}


class _Deadline(Exception):
    pass


class _RejectRedirects(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def _deadline(_signum, _frame):
    raise _Deadline()


def _reject_constant(_value):
    raise ValueError()


def _completed_check(value):
    if not isinstance(value, dict) or value.get("status") != "completed":
        return False
    if value.get("errors") not in (None, []) or value.get("error") is not None:
        return False
    steps = value.get("steps")
    if not isinstance(steps, list):
        return False
    outputs = []
    for step in steps:
        if not isinstance(step, dict):
            return False
        if step.get("type") == "thought":
            continue
        if step.get("type") != "model_output" or step.get("error") is not None:
            return False
        outputs.append(step)
    if len(outputs) != 1:
        return False
    parts = outputs[0].get("content")
    if not isinstance(parts, list) or not parts:
        return False
    if any(not isinstance(part, dict) or part.get("type") != "text"
           or not isinstance(part.get("text"), str) for part in parts):
        return False
    try:
        answer = json.loads("".join(part["text"] for part in parts), parse_constant=_reject_constant)
    except (ValueError, TypeError):
        return False
    return isinstance(answer, dict) and set(answer) == {"ok"} and answer["ok"] is True


def run_check(key, timeout_seconds=30):
    """Return fixed diagnostic fields, never a key, request or provider message."""
    started = time.monotonic()
    report = {"model": MODEL, "result": "CHECK_ERROR"}
    handler_installed = False
    previous_handler = None
    try:
        if not isinstance(key, str) or not key.strip():
            report["result"] = "MISSING_KEY"
            return report
        # urllib's socket timeout alone is not a wall-clock limit. Colab runs
        # Python on Linux; a raising SIGALRM also bounds connect/header/body time.
        if not hasattr(signal, "setitimer") or signal.getitimer(signal.ITIMER_REAL)[0]:
            report["result"] = "UNSUPPORTED_RUNTIME"
            return report
        previous_handler = signal.getsignal(signal.SIGALRM)
        signal.signal(signal.SIGALRM, _deadline)
        handler_installed = True
        signal.setitimer(signal.ITIMER_REAL, timeout_seconds)
        body = {
            "model": MODEL,
            "input": '{"check":"connection"}',
            "system_instruction": "Return the JSON object with ok set to true.",
            "store": False, "stream": False, "background": False,
            "generation_config": {"max_output_tokens": 512, "thinking_level": "medium"},
            "response_format": {
                "type": "text", "mime_type": "application/json",
                "schema": {
                    "type": "object", "properties": {"ok": {"type": "boolean"}},
                    "required": ["ok"], "additionalProperties": False,
                },
            },
        }
        request = urllib.request.Request(
            ENDPOINT, data=json.dumps(body, separators=(",", ":")).encode(),
            headers={"Content-Type": "application/json", "x-goog-api-key": key.strip()},
            method="POST",
        )
        opener = urllib.request.build_opener(_RejectRedirects())
        try:
            response = opener.open(request, timeout=timeout_seconds)
        except urllib.error.HTTPError as error:
            response = error
        with response:
            report["http_status"] = response.status
            raw = response.read(65537)
        report["result"] = "PROVIDER_HTTP_ERROR" if response.status >= 300 else "UNSUPPORTED_RESPONSE"
        if len(raw) > 65536:
            return report
        try:
            value = json.loads(raw, parse_constant=_reject_constant)
        except (ValueError, UnicodeError):
            return report
        if not isinstance(value, dict):
            return report
        error = value.get("error")
        if isinstance(error, dict) and isinstance(error.get("status"), str) and error["status"] in PROVIDER_CODES:
            report["provider_code"] = error["status"]
        status = value.get("status")
        if isinstance(status, str) and status in COMPLETION_STATUSES:
            report["completion_status"] = status
        usage = value.get("usage")
        if isinstance(usage, dict):
            for name in ("total_input_tokens", "total_output_tokens", "total_thought_tokens"):
                count = usage.get(name)
                if type(count) is int and 0 <= count <= 10000000:
                    report[name] = count
        if response.status == 200 and _completed_check(value):
            report["result"] = "PASS"
        return report
    except (_Deadline, TimeoutError, socket.timeout):
        report["result"] = "TIMEOUT"
        return report
    except urllib.error.URLError as error:
        report["result"] = "TIMEOUT" if isinstance(error.reason, (TimeoutError, socket.timeout)) else "TRANSPORT_ERROR"
        return report
    except ValueError:
        report["result"] = "UNSUPPORTED_RUNTIME" if not handler_installed else "CHECK_ERROR"
        return report
    except Exception:
        report["result"] = "CHECK_ERROR"
        return report
    finally:
        if handler_installed:
            signal.setitimer(signal.ITIMER_REAL, 0)
            signal.signal(signal.SIGALRM, previous_handler)
        report["elapsed_seconds"] = round(time.monotonic() - started, 2)


def main():
    print("This sends one fixed connection test to Google, with no customer data.")
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", getpass.GetPassWarning)
            key = getpass.getpass("Paste the AI Receptionist API key used in Vercel (hidden): ")
    except getpass.GetPassWarning:
        print("Hidden input is unavailable. Open this test in Google Colab.")
        return
    except (EOFError, KeyboardInterrupt):
        print("Test cancelled.")
        return
    try:
        result = run_check(key)
    finally:
        key = ""
    print(json.dumps(result, indent=2))
    print("Share only this result with your assistant. Do not share the API key.")


if __name__ == "__main__":
    main()
