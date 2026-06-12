import type { TAppletDefinition } from '@warpcore/realmcore';
import { TestFEApplet } from './TestFEApplet';

export const feApplets: Record<string, TAppletDefinition> = {
	testFe: TestFEApplet,
};
