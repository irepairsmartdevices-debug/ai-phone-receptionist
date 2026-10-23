import { createHmac, timingSafeEqual } from "node:crypto";
export function validateTwilioSignature(
  url: string,
  params: Record<string, string>,
  signature: string,
  token: string,
) {
  if (!token || !signature) return false;
  const payload =
    url +
    Object.keys(params)
      .sort()
      .map((k) => k + params[k])
      .join("");
  const expected = createHmac("sha1", token).update(payload).digest("base64");
  const a = Buffer.from(expected),
    b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}
export const escapeXml = (value: string) =>
  value.replace(
    /[<>&'\"]/g,
    (c) =>
      ({
        "<": "&lt;",
        ">": "&gt;",
        "&": "&amp;",
        "'": "&apos;",
        '"': "&quot;",
      })[c]!,
  );
export function voiceResponse(
  text: string,
  nextUrl: string,
  transferNumber?: string,
) {
  if (transferNumber && !/^\+[1-9]\d{7,14}$/.test(transferNumber))
    throw Error("Transfer destination must use E164");
  const safe = escapeXml(text);
  return `<?xml version="1.0" encoding="UTF-8"?><Response>${transferNumber ? `<Say>${safe}</Say><Dial timeout="20" action="${escapeXml(nextUrl)}">${escapeXml(transferNumber)}</Dial>` : `<Gather input="speech dtmf" action="${escapeXml(nextUrl)}" method="POST" timeout="5" speechTimeout="auto"><Say>${safe}</Say></Gather><Say>I did not hear a response. Please contact the shop if you still need help.</Say><Hangup/>`}</Response>`;
}
