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
	isActive: boolean;
	prompt?: string;
	triggerOnTools?: string;
	inferenceParams?: Record<string, unknown>;
	messagesCount?: number;
	includeBaseMessage?: boolean;
}
