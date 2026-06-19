export enum EGuardrailType {
	BUILTIN = 'builtin',
	CUSTOM = 'custom',
}

export enum EGuardrailSubRole {
	ALL = 'all',
	TEXT = 'text',
	TOOL = 'tool',
}

export enum EGuardrailIssueType {
	VIOLATION = 'violation',
	WARNING = 'warning',
}

export interface IGuardrailIssue {
	quote: string;
	issue: string;
	type: EGuardrailIssueType;
}

export interface IGuardrail {
	name: string;
	serverId: string;
	active: boolean;
	type: EGuardrailType;
	prompt?: string;
	subRoleSelection: EGuardrailSubRole;
}
