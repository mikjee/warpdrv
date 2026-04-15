import { ERecipeInputType } from './recipe-types';
import type { IRecipeInputDef, IRecipeStepDef, IRecipeParsed } from './recipe-types';

// Parses a recipe bash source into inputs and steps.
// Throws Error with a clear message on invalid syntax.

const DIRECTIVE_INPUT = '#!input';
const DIRECTIVE_STEP = '#!step';

export function parseRecipe(source: string): IRecipeParsed {
	const lines = source.split(/\r?\n/);
	const inputs: IRecipeInputDef[] = [];
	const steps: IRecipeStepDef[] = [];

	let currentStep: IRecipeStepDef | null = null;
	let currentBodyLines: string[] = [];
	let sawAnyStep = false;

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i] ?? '';
		const trimmed = line.trim();

		if (trimmed.startsWith(DIRECTIVE_INPUT)) {
			if (sawAnyStep) throw new Error(`Line ${i + 1}: #!input must appear before any #!step`);
			const def = parseInputDirective(trimmed, i + 1);
			if (inputs.some(x => x.name === def.name)) throw new Error(`Line ${i + 1}: duplicate input '${def.name}'`);
			inputs.push(def);
			continue;
		}

		if (trimmed.startsWith(DIRECTIVE_STEP)) {
			if (currentStep !== null) {
				currentStep.body = currentBodyLines.join('\n');
				steps.push(currentStep);
			}
			currentStep = parseStepDirective(trimmed, i + 1, steps.length);
			currentBodyLines = [];
			sawAnyStep = true;
			continue;
		}

		if (currentStep !== null) currentBodyLines.push(line);
		// Lines outside any step (and not directives) are ignored.
	}

	if (currentStep !== null) {
		currentStep.body = currentBodyLines.join('\n');
		steps.push(currentStep);
	}

	if (steps.length === 0) throw new Error('Recipe has no #!step directives');

	return { inputs, steps };
}

function parseInputDirective(line: string, lineNo: number): IRecipeInputDef {
	// #!input NAME type [options=a,b,c] [default=...]
	const rest = line.slice(DIRECTIVE_INPUT.length).trim();
	const tokens = tokenize(rest);
	if (tokens.length < 2) throw new Error(`Line ${lineNo}: #!input requires NAME and type`);

	const name = tokens[0]!;
	const typeRaw = tokens[1]!.toLowerCase();

	if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) throw new Error(`Line ${lineNo}: invalid input name '${name}'`);

	let type: ERecipeInputType;
	if (typeRaw === 'string') type = ERecipeInputType.STRING;
	else if (typeRaw === 'number') type = ERecipeInputType.NUMBER;
	else if (typeRaw === 'bool') type = ERecipeInputType.BOOL;
	else if (typeRaw === 'choice') type = ERecipeInputType.CHOICE;
	else throw new Error(`Line ${lineNo}: unknown input type '${typeRaw}'`);

	const kvPairs: Record<string, string> = {};
	for (let i = 2; i < tokens.length; i++) {
		const token = tokens[i]!;
		const eq = token.indexOf('=');
		if (eq === -1) throw new Error(`Line ${lineNo}: expected key=value, got '${token}'`);
		const key = token.slice(0, eq);
		const value = token.slice(eq + 1);
		kvPairs[key] = value;
	}

	let options: string[] | undefined;
	if (type === ERecipeInputType.CHOICE) {
		const optRaw = kvPairs.options;
		if (optRaw === undefined || optRaw === '') throw new Error(`Line ${lineNo}: choice input '${name}' requires options=...`);
		options = optRaw.split(',').map(x => x.trim()).filter(x => x.length > 0);
		if (options.length === 0) throw new Error(`Line ${lineNo}: choice input '${name}' has empty options`);
	}

	let defaultValue: string | number | boolean | undefined;
	const defRaw = kvPairs.default;
	if (defRaw !== undefined) {
		if (type === ERecipeInputType.NUMBER) {
			const n = Number(defRaw);
			if (Number.isNaN(n)) throw new Error(`Line ${lineNo}: default for number input '${name}' is not a number`);
			defaultValue = n;
		}
		else if (type === ERecipeInputType.BOOL) {
			if (defRaw === 'true') defaultValue = true;
			else if (defRaw === 'false') defaultValue = false;
			else throw new Error(`Line ${lineNo}: default for bool input '${name}' must be true or false`);
		}
		else if (type === ERecipeInputType.CHOICE) {
			if (!options!.includes(defRaw)) throw new Error(`Line ${lineNo}: default '${defRaw}' not in options for '${name}'`);
			defaultValue = defRaw;
		}
		else {
			defaultValue = defRaw;
		}
	}

	const description = kvPairs.description;

	const def: IRecipeInputDef = { name, type };
	if (defaultValue !== undefined) def.defaultValue = defaultValue;
	if (options !== undefined) def.options = options;
	if (description !== undefined) def.description = description;
	return def;
}

function parseStepDirective(line: string, lineNo: number, index: number): IRecipeStepDef {
	// #!step Name words [cwd=path]
	const rest = line.slice(DIRECTIVE_STEP.length).trim();
	if (rest.length === 0) throw new Error(`Line ${lineNo}: #!step requires a name`);

	const tokens = tokenize(rest);
	const nameTokens: string[] = [];
	let cwd: string | undefined;

	for (const token of tokens) {
		const eq = token.indexOf('=');
		if (eq !== -1 && /^[a-z]+$/.test(token.slice(0, eq))) {
			const key = token.slice(0, eq);
			const value = token.slice(eq + 1);
			if (key === 'cwd') cwd = value;
			else throw new Error(`Line ${lineNo}: unknown #!step option '${key}'`);
		}
		else {
			nameTokens.push(token);
		}
	}

	const name = nameTokens.join(' ').trim();
	if (name.length === 0) throw new Error(`Line ${lineNo}: #!step requires a name`);

	const step: IRecipeStepDef = {
		id: `step_${index}`,
		name,
		body: '',
	};
	if (cwd !== undefined) step.cwd = cwd;
	return step;
}

// Splits a string on whitespace, respecting "double quoted" segments.
function tokenize(input: string): string[] {
	const tokens: string[] = [];
	let buf = '';
	let inQuotes = false;

	for (let i = 0; i < input.length; i++) {
		const ch = input[i]!;
		if (ch === '"') { inQuotes = !inQuotes; continue; }
		if (!inQuotes && /\s/.test(ch)) {
			if (buf.length > 0) { tokens.push(buf); buf = ''; }
			continue;
		}
		buf += ch;
	}
	if (buf.length > 0) tokens.push(buf);
	return tokens;
}
