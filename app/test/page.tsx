import TestClient from './client';import {requireStaff} from '../../src/auth/guards';
export const dynamic='force-dynamic';
export default async function TestPage(){await requireStaff();return <><div className="page-heading"><div><div className="eyebrow">A LITTLE PRACTICE, A BETTER EXPERIENCE</div><h1>Say hello to your receptionist.</h1><p>Try the conversation before your customers do.</p></div></div><div className="banner">Fixture mode · Fictional tickets and appointments only. No real calls, texts, bookings, or ticket changes.</div><TestClient/></>}
