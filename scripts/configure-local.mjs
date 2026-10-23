import { existsSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { join } from "node:path";
const repair =
  process.env.REPAIR_CHECKOUT ?? "/workspace/shopify-phone-repair-booking";
const own = join(process.cwd(), ".env"),
  source = join(repair, ".env");
if (existsSync(own) && existsSync(source)) {
  console.log("Existing local configuration preserved.");
  process.exit(0);
}
if (existsSync(own) || existsSync(source))
  throw Error(
    "One configuration already exists. Preserve its bindings and configure the missing app securely; no file was overwritten.",
  );
if (!existsSync(join(repair, "package.json")))
  throw Error("Repair checkout is required for connected local configuration.");
const token = randomBytes(32).toString("hex");
writeFileSync(
  own,
  `DATABASE_URL=postgresql://receptionist:local-development-only@127.0.0.1:55432/receptionist\nRECEPTIONIST_MODE=fixture\nAPP_ORIGIN=http://localhost:3000\nREPAIR_SERVICE_URL=http://localhost:3001\nREPAIR_SERVICE_TOKEN=${token}\n`,
  { mode: 0o600, flag: "wx" },
);
writeFileSync(
  source,
  `DATABASE_URL=postgresql://receptionist:local-development-only@127.0.0.1:55432/repair_integration\nSESSION_SECRET=${randomBytes(32).toString("hex")}\nADMIN_PASSWORD=${randomBytes(24).toString("hex")}\nRECEPTIONIST_API_TOKEN=${token}\nRECEPTIONIST_ORIGIN=http://localhost:3000\nAPP_URL=http://localhost:3001\n`,
  { mode: 0o600, flag: "wx" },
);
console.log(
  "Created separate local development configurations without printing credentials.",
);
