import {FixtureRepairService} from './fixture';import type {RepairService} from '../contracts/repair';
const globalService=globalThis as unknown as {fixtureRepairService?:FixtureRepairService};
export function getService():RepairService{
 if((process.env.RECEPTIONIST_MODE??'fixture')!=='fixture')throw new Error('Connected service is not configured');
 return globalService.fixtureRepairService??=new FixtureRepairService();
}
