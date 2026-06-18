export enum EGuardrailType {
	BUILTIN = 'builtin',
	CUSTOM = 'custom',
}

export enum EGuardrailSubRole {
	ALL = 'all',
	TEXT = 'text',
	TOOL = 'tool',
}

export interface IGuardrail {
	name: string;
	serverId: string;
	active: boolean;
	type: EGuardrailType;
	prompt?: string;
	subRoleSelection: EGuardrailSubRole;
}
