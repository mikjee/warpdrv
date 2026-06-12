import type { TAppletDefinition } from '@warpcore/realmcore';
import { TestBEApplet } from './TestBEApplet';

export const beApplets: Record<string, TAppletDefinition> = {
	testBe: TestBEApplet,
};
