import importlib.util
import io
import json
from pathlib import Path
import signal
import time
import unittest
from contextlib import redirect_stdout
from unittest.mock import patch
from email.message import Message
from urllib.error import HTTPError, URLError
from urllib.response import addinfourl

MODULE = Path(__file__).with_name("gemini_connection_control.py")
spec = importlib.util.spec_from_file_location("gemini_control", MODULE)
control = importlib.util.module_from_spec(spec)
spec.loader.exec_module(control)


class Response(io.BytesIO):
    def __init__(self, value, status=200):
        super().__init__(json.dumps(value).encode())
        self.status = status


def completed(value):
    return {"status": "completed", "steps": [
        {"type": "thought", "summary": [{"type": "text", "text": "private"}]},
        {"type": "model_output", "content": [{"type": "text", "text": json.dumps(value)}]},
    ]}


class ControlTests(unittest.TestCase):
    def run_with(self, opener, **kwargs):
        with patch.object(control.urllib.request, "build_opener", return_value=opener):
            return control.run_check("private-test-key", **kwargs)

    def test_matches_fixed_production_request_and_prints_no_key(self):
        calls = []

        class Opener:
            def open(self, request, **kwargs):
                calls.append(request)
                return Response(completed({"ok": True}))

        result = self.run_with(Opener())
        self.assertEqual(result["result"], "PASS")
        self.assertEqual(len(calls), 1)
        request = calls[0]
        self.assertEqual(request.full_url, "https://generativelanguage.googleapis.com/v1beta/interactions")
        self.assertEqual(request.get_method(), "POST")
        self.assertEqual(request.get_header("X-goog-api-key"), "private-test-key")
        self.assertEqual(json.loads(request.data), {
            "model": "gemini-3.8-flash", "input": '{"check":"connection"}',
            "system_instruction": "Return the JSON object with ok set to true.",
            "store": False, "stream": False, "background": False,
            "generation_config": {"max_output_tokens": 512, "thinking_level": "medium"},
            "response_format": {"type": "text", "mime_type": "application/json", "schema": {
                "type": "object", "properties": {"ok": {"type": "boolean"}},
                "required": ["ok"], "additionalProperties": False,
            }},
        })
        self.assertNotIn("private-test-key", json.dumps(result))

    def test_only_allowlisted_http_error_details_escape_without_retry(self):
        calls = []

        class Opener:
            def open(self, request, **kwargs):
                calls.append(request)
                body = json.dumps({"error": {"status": "UNAVAILABLE", "message": "private-test-key private detail"}}).encode()
                raise HTTPError(request.full_url, 503, "private detail", {}, io.BytesIO(body))

        result = self.run_with(Opener())
        self.assertEqual(result["http_status"], 503)
        self.assertEqual(result["provider_code"], "UNAVAILABLE")
        self.assertEqual(result["result"], "PROVIDER_HTTP_ERROR")
        self.assertEqual(len(calls), 1)
        self.assertNotIn("private", json.dumps(result))

    def test_incomplete_or_errored_outputs_never_pass(self):
        for value in [
            {**completed({"ok": True}), "status": "incomplete"},
            {**completed({"ok": True}), "errors": [{"message": "private"}]},
            {"status": "completed", "steps": [{"type": "model_output", "error": {"code": 13}, "content": [{"type": "text", "text": '{"ok":true}'}]}]},
            {"status": "completed", "steps": [{"type": "function_call"}]},
            completed({"ok": False}), completed({"ok": True, "extra": "private"}),
            {"status": "completed", "output_text": '{"ok":true}'},
        ]:
            class Opener:
                def open(self, *_args, **_kwargs):
                    return Response(value)
            result = self.run_with(Opener())
            self.assertNotEqual(result["result"], "PASS")
            self.assertNotIn("private", json.dumps(result))

    def test_wall_deadline_interrupts_and_restores_signal_handler(self):
        previous = signal.getsignal(signal.SIGALRM)

        class Opener:
            def open(self, *_args, **_kwargs):
                time.sleep(1)

        started = time.monotonic()
        result = self.run_with(Opener(), timeout_seconds=0.03)
        self.assertEqual(result["result"], "TIMEOUT")
        self.assertLess(time.monotonic() - started, 0.5)
        self.assertEqual(signal.getsignal(signal.SIGALRM), previous)

    def test_transport_errors_are_bounded_and_private(self):
        class Opener:
            def open(self, *_args, **_kwargs):
                raise URLError("private-test-key private destination")

        result = self.run_with(Opener())
        self.assertEqual(result["result"], "TRANSPORT_ERROR")
        self.assertNotIn("private", json.dumps(result))

    def test_oversized_response_is_rejected(self):
        class Opener:
            def open(self, *_args, **_kwargs):
                return Response({**completed({"ok": True}), "padding": "x" * 70000})

        result = self.run_with(Opener())
        self.assertEqual(result["result"], "UNSUPPORTED_RESPONSE")

    def test_non_json_numeric_constants_are_rejected_like_production(self):
        class Opener:
            def open(self, *_args, **_kwargs):
                response = Response(completed({"ok": True}))
                response.seek(0, 2)
                # A valid-looking answer wrapped in invalid JSON must fail.
                data = response.getvalue()[:-1] + b', "invalid": NaN}'
                response.close()
                value = io.BytesIO(data)
                value.status = 200
                return value

        self.assertNotEqual(self.run_with(Opener())["result"], "PASS")

    def test_redirects_never_forward_the_key_to_another_host(self):
        calls = []
        native_build = control.urllib.request.build_opener

        class FakeHTTPS(control.urllib.request.HTTPSHandler):
            def https_open(self, request):
                calls.append(request.full_url)
                headers = Message()
                headers["Location"] = "https://key-leak.invalid/"
                response = addinfourl(io.BytesIO(b"{}"), headers, request.full_url, 302)
                response.msg = "Found"
                return response

        with patch.object(control.urllib.request, "build_opener", side_effect=lambda *handlers: native_build(FakeHTTPS(), *handlers)):
            result = control.run_check("private-test-key")
        self.assertEqual(result["http_status"], 302)
        self.assertEqual(result["result"], "PROVIDER_HTTP_ERROR")
        self.assertEqual(calls, ["https://generativelanguage.googleapis.com/v1beta/interactions"])

    def test_notebook_embeds_reviewed_script_with_no_saved_output(self):
        notebook = json.loads(MODULE.with_suffix(".ipynb").read_text())
        cells = [cell for cell in notebook["cells"] if cell["cell_type"] == "code"]
        self.assertEqual(len(cells), 1)
        self.assertEqual("".join(cells[0]["source"]), MODULE.read_text())
        self.assertEqual(cells[0]["outputs"], [])
        self.assertIsNone(cells[0]["execution_count"])

    def test_input_fails_closed_when_masking_is_unavailable(self):
        output = io.StringIO()
        with patch.object(control.getpass, "getpass", side_effect=control.getpass.GetPassWarning()), patch.object(control, "run_check") as request, redirect_stdout(output):
            control.main()
        request.assert_not_called()
        self.assertIn("Hidden input is unavailable", output.getvalue())


if __name__ == "__main__":
    unittest.main()
