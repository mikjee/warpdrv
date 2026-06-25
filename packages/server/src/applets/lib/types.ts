import type { EventNode } from '@warpcore/realmcore';
import { TAppletBaseAPI } from '@warpcore/realmcore/src/applet/types';

export interface IAppletAPIBE extends TAppletBaseAPI {
	eventNode: EventNode;
}
