import { FixtureRepairService } from "./fixture";
import { HttpRepairService } from "./http";
import type { RepairService } from "../contracts/repair";
const globalService = globalThis as unknown as {
  fixtureRepairService?: FixtureRepairService;
};
export function getService(): RepairService {
  if ((process.env.RECEPTIONIST_MODE ?? "fixture") !== "fixture")
    return new HttpRepairService(
      process.env.REPAIR_SERVICE_URL ?? "",
      process.env.REPAIR_SERVICE_TOKEN ?? "",
    );
  return (globalService.fixtureRepairService ??= new FixtureRepairService());
}
