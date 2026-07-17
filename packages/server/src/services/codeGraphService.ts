import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import Parser from 'tree-sitter';
import { xxh64 } from '@node-rs/xxhash';
import ignore from 'ignore';
import type { IPersistence } from '@warpcore/bridge';
import type {
	ICodeGraphNode,
	ICodeGraphEdge,
	ICodeGraphFile,
	ICodeGraphIngestResult,
	ICodeGraphSearchOptions,
} from '@warpcore/shared';
import { randomUUID } from 'crypto';

const LANGUAGE_MAP: Record<string, string> = {
	'.ts': 'typescript',
	'.tsx': 'tsx',
	'.js': 'javascript',
	'.jsx': 'javascript',
	'.py': 'python',
	'.rs': 'rust',
	'.go': 'go',
	'.c': 'cpp',
	'.cpp': 'cpp',
	'.h': 'cpp',
	'.hpp': 'cpp',
	'.java': 'java',
	'.php': 'php',
};

const SUPPORTED_EXTENSIONS = new Set(Object.keys(LANGUAGE_MAP));

const GRAMMAR_PACKAGES: Record<string, string> = {
	typescript: 'tree-sitter-typescript',
	tsx: 'tree-sitter-typescript',
	javascript: 'tree-sitter-javascript',
	python: 'tree-sitter-python',
	rust: 'tree-sitter-rust',
	go: 'tree-sitter-go',
	cpp: 'tree-sitter-cpp',
	java: 'tree-sitter-java',
	php: 'tree-sitter-php',
};

export class CodeGraphService {
	private persistence: IPersistence;
	private grammarCache: Map<string, any> = new Map();
	private sessionWalked: Map<string, boolean> = new Map();

	constructor(persistence: IPersistence) {
		this.persistence = persistence;
	}

	private async loadGrammar(language: string): Promise<any> {
		if (this.grammarCache.has(language)) return this.grammarCache.get(language);
		const pkgName = GRAMMAR_PACKAGES[language];
		if (!pkgName) throw new Error(`No grammar package for language: ${language}`);
		const pkg = await import(pkgName);
		let grammar;
		if (language === 'tsx' || language === 'typescript') {
			grammar = pkg.default?.[language] ?? pkg[language];
		} else {
			grammar = pkg.default;
		}
		if (!grammar) throw new Error(`Failed to load grammar for: ${language}`);
		this.grammarCache.set(language, grammar);
		return grammar;
	}

	private async createParser(language: string): Promise<Parser> {
		const grammar = await this.loadGrammar(language);
		const parser = new Parser();
		parser.setLanguage(grammar);
		return parser;
	}

	private isSupportedLanguage(ext: string): boolean {
		return SUPPORTED_EXTENSIONS.has(ext);
	}

	private async isGitIgnored(projectRoot: string, relativePath: string): Promise<boolean> {
		const gitignorePath = path.join(projectRoot, '.gitignore');
		if (!fs.existsSync(gitignorePath)) return false;
		try {
			const content = await fsPromises.readFile(gitignorePath, 'utf8');
			const ig = ignore();
			ig.add(content);
			return ig.ignores(relativePath);
		} catch {
			return false;
		}
	}

	private async shouldSkipDir(projectRoot: string, dirName: string): Promise<boolean> {
		if (dirName === 'node_modules' || dirName === '.git' || dirName === 'vendor' || dirName === '.venv') return true;
		const gitignorePath = path.join(projectRoot, '.gitignore');
		if (!fs.existsSync(gitignorePath)) return false;
		try {
			const content = await fsPromises.readFile(gitignorePath, 'utf8');
			const ig = ignore();
			ig.add(content);
			return ig.ignores(dirName);
		} catch {
			return false;
		}
	}

	async discoverFiles(projectRoot: string): Promise<string[]> {
		const files: string[] = [];
		const walk = async (dir: string, relativeDir: string) => {
			const entries = await fsPromises.readdir(dir, { withFileTypes: true });
			for (const entry of entries) {
				const relPath = relativeDir ? `${relativeDir}/${entry.name}` : entry.name;
				if (entry.isDirectory()) {
					if (await this.shouldSkipDir(projectRoot, entry.name)) continue;
					await walk(path.join(dir, entry.name), relPath);
				} else if (entry.isFile()) {
					const ext = path.extname(entry.name);
					if (this.isSupportedLanguage(ext)) {
						files.push(relPath);
					}
				}
			}
		};
		await walk(projectRoot, '');
		return files;
	}

	private async contentHash(filePath: string): Promise<string> {
		const data = await fsPromises.readFile(filePath);
		return xxh64(data).toString(16);
	}

	private buildNodeId(relativePath: string, scopeChain: string[], name: string): string {
		const scope = scopeChain.length ? `${scopeChain.join('.')}.` : '';
		return `${relativePath}#${scope}${name}`;
	}

	private extractDeclarations(
		node: any,
		relativePath: string,
		scope: string[],
		language: string,
		parentNodes: ICodeGraphNode[] = [],
	): ICodeGraphNode[] {
		const nodes: ICodeGraphNode[] = [];
		const declarations = this.getDeclarationNodes(node, language);

		for (const decl of declarations) {
			const name = this.getNodeName(decl, language);
			const kind = this.getNodeKind(decl, language);
			if (!name) continue;

			const startLine = decl.startPosition.row;
			const endLine = decl.endPosition.row;
			const startCol = decl.startPosition.column;
			const endCol = decl.endPosition.column;
			const signature = this.extractSignature(decl, language);
			const isExported = this.isNodeExported(decl, language);

			const nodeId = this.buildNodeId(relativePath, scope, name);
			const node: ICodeGraphNode = {
				id: nodeId,
				symbol: name,
				kind,
				language,
				filePath: relativePath,
				startLine,
				endLine,
				startCol,
				endCol,
				signature,
				isExported,
			};
			nodes.push(node);

			const childScope = [...scope, name];
			const children = this.extractDeclarations(decl, relativePath, childScope, language, nodes);
			nodes.push(...children);
		}

		return nodes;
	}

	private getDeclarationNodes(node: any, language: string): any[] {
		if (!node.children) return [];
		const declarationTypes: Record<string, Set<string>> = {
			typescript: new Set(['function_declaration', 'class_declaration', 'interface_declaration', 'type_alias_declaration', 'lexical_declaration', 'variable_declaration', 'method_definition', 'property_declaration', 'enum_declaration', 'module_declaration']),
			tsx: new Set(['function_declaration', 'class_declaration', 'interface_declaration', 'type_alias_declaration', 'lexical_declaration', 'variable_declaration', 'method_definition', 'property_declaration', 'enum_declaration', 'module_declaration']),
			javascript: new Set(['function_declaration', 'class_declaration', 'lexical_declaration', 'variable_declaration', 'method_definition', 'property_definition']),
			python: new Set(['function_definition', 'class_definition', 'assignment', 'import_statement', 'import_from_statement']),
			rust: new Set(['function_item', 'struct_item', 'enum_item', 'impl_item', 'mod_item', 'trait_item']),
			go: new Set(['function_declaration', 'type_declaration', 'var_declaration', 'method_declaration']),
			cpp: new Set(['function_definition', 'class_specifier', 'struct_specifier', 'field_declaration', 'method_definition', 'enum_specifier', 'namespace_definition']),
			java: new Set(['method_declaration', 'class_declaration', 'interface_declaration', 'field_declaration', 'constructor_declaration', 'enum_declaration']),
			php: new Set(['function_definition', 'class_declaration', 'method_declaration', 'property_declaration', 'enum_declaration']),
		};
		const exportWrappers: Record<string, Set<string>> = {
			typescript: new Set(['export_statement', 'export_named_declaration']),
			tsx: new Set(['export_statement', 'export_named_declaration']),
			javascript: new Set(['export_statement', 'export_named_declaration']),
		};
		const types = declarationTypes[language] ?? new Set();
		const wrappers = exportWrappers[language] ?? new Set();
		const results: any[] = [];

		for (const child of node.children) {
			if (types.has(child.type)) {
				results.push(child);
			} else if (wrappers.has(child.type) && child.children) {
				for (const inner of child.children) {
					if (types.has(inner.type)) {
						results.push(inner);
					}
				}
			}
		}
		return results;
	}

	private getNodeName(node: any, language: string): string | null {
		const nameProps: Record<string, string[]> = {
			typescript: ['name', 'declaration.name'],
			tsx: ['name', 'declaration.name'],
			javascript: ['name'],
			python: ['name'],
			rust: ['name'],
			go: ['name', 'decls.Specs.Name'],
			cpp: ['declarator', 'declarator.name'],
			java: ['name'],
			php: ['name'],
		};
		const props = nameProps[language] ?? ['name'];
		for (const prop of props) {
			const parts = prop.split('.');
			let current = node;
			for (const part of parts) {
				if (current[part]) {
					current = current[part];
				} else {
					current = null;
					break;
				}
			}
			if (current?.type === 'identifier' || typeof current === 'string') {
				return current?.text ?? current?.name ?? null;
			}
		}
		const nameChild = node.childForFieldName('name');
		if (nameChild) return nameChild.text;
		const declarator = node.children?.find((c: any) => c.type === 'variable_declarator');
		if (declarator) {
			const declName = declarator.childForFieldName('name');
			if (declName) return declName.text;
		}
		return null;
	}

	private getNodeKind(node: any, language: string): string {
		const kindMap: Record<string, Record<string, string>> = {
			typescript: {
				function_declaration: 'function',
				class_declaration: 'class',
				interface_declaration: 'interface',
				type_alias_declaration: 'type',
				variable_declaration: 'variable',
				lexical_declaration: 'variable',
				method_definition: 'method',
				property_declaration: 'property',
				enum_declaration: 'enum',
				module_declaration: 'module',
			},
			tsx: {
				function_declaration: 'function',
				class_declaration: 'class',
				interface_declaration: 'interface',
				type_alias_declaration: 'type',
				variable_declaration: 'variable',
				lexical_declaration: 'variable',
				method_definition: 'method',
				property_declaration: 'property',
				enum_declaration: 'enum',
				module_declaration: 'module',
			},
			javascript: {
				function_declaration: 'function',
				class_declaration: 'class',
				variable_declaration: 'variable',
				lexical_declaration: 'variable',
				method_definition: 'method',
				property_definition: 'property',
			},
			python: {
				function_definition: 'function',
				class_definition: 'class',
				assignment: 'variable',
				import_statement: 'import',
				import_from_statement: 'import',
			},
			rust: {
				function_item: 'function',
				struct_item: 'struct',
				enum_item: 'enum',
				impl_item: 'impl',
				mod_item: 'module',
				trait_item: 'interface',
			},
			go: {
				function_declaration: 'function',
				type_declaration: 'type',
				var_declaration: 'variable',
				method_declaration: 'method',
			},
			cpp: {
				function_definition: 'function',
				class_specifier: 'class',
				struct_specifier: 'struct',
				field_declaration: 'property',
				method_definition: 'method',
				enum_specifier: 'enum',
				namespace_definition: 'namespace',
			},
			java: {
				method_declaration: 'method',
				class_declaration: 'class',
				interface_declaration: 'interface',
				field_declaration: 'property',
				constructor_declaration: 'method',
				enum_declaration: 'enum',
			},
			php: {
				function_definition: 'function',
				class_declaration: 'class',
				method_declaration: 'method',
				property_declaration: 'property',
				enum_declaration: 'enum',
			},
		};
		const map = kindMap[language] ?? {};
		return map[node.type] ?? node.type;
	}

	private extractSignature(node: any, language: string): string | null {
		if (language === 'typescript' || language === 'tsx') {
			const params = node.childForFieldName('parameters');
			const returnType = node.childForFieldName('return_type');
			if (params) {
				const sig = `(${params.text})`;
				return returnType ? `${sig}: ${returnType.text}` : sig;
			}
		}
		return null;
	}

	private isNodeExported(node: any, language: string): boolean {
		if (language === 'typescript' || language === 'tsx' || language === 'javascript') {
			const parentType = node.parent?.type;
			if (parentType === 'export_statement' || parentType === 'export_named_declaration') return true;
		}
		return false;
	}

	private extractEdges(
		node: any,
		language: string,
		sourceFilePath: string,
		sourceNodes: ICodeGraphNode[],
	): ICodeGraphEdge[] {
		const edges: ICodeGraphEdge[] = [];
		this.walkEdges(node, language, sourceFilePath, sourceNodes, edges);
		return edges;
	}

	private walkEdges(node: any, language: string, filePath: string, sourceNodes: ICodeGraphNode[], edges: ICodeGraphEdge[]): void {
		if (!node.children) return;
		for (const child of node.children) {
			const callEdges = this.extractCallEdges(child, language, filePath, sourceNodes);
			edges.push(...callEdges);
			this.walkEdges(child, language, filePath, sourceNodes, edges);
		}
	}

	private extractCallEdges(node: any, language: string, filePath: string, sourceNodes: ICodeGraphNode[]): ICodeGraphEdge[] {
		const edges: ICodeGraphEdge[] = [];
		const callTypes: Record<string, Set<string>> = {
			typescript: new Set(['call_expression', 'new_expression', 'await_expression']),
			tsx: new Set(['call_expression', 'new_expression', 'await_expression']),
			javascript: new Set(['call_expression', 'new_expression']),
			python: new Set(['call']),
			rust: new Set(['macro_invocation', 'call_expression']),
			go: new Set(['call_expression']),
			cpp: new Set(['call_expression']),
			java: new Set(['method_invocation', 'object_creation_expression']),
			php: new Set(['scalar_creation_expression']),
		};
		const types = callTypes[language] ?? new Set();
		if (!types.has(node.type)) return edges;

		const targetName = this.extractCallTarget(node, language);
		if (!targetName) return edges;

		const sourceNode = this.findContainingNode(node, sourceNodes);
		const sourceId = sourceNode?.id ?? `${filePath}#unknown`;

		edges.push({
			id: `${randomUUID()}`,
			sourceId,
			filePath,
			targetSymbol: targetName,
			edgeType: 'calls',
		});

		return edges;
	}

	private extractCallTarget(node: any, language: string): string | null {
		if (language === 'typescript' || language === 'tsx' || language === 'javascript') {
			const func = node.childForFieldName('function');
			if (func?.type === 'identifier') return func.text;
			if (func?.type === 'member_expression') {
				const prop = func.childForFieldName('property');
				return prop?.text ?? null;
			}
		}
		if (language === 'python') {
			const func = node.childForFieldName('function');
			return func?.text ?? null;
		}
		if (language === 'java') {
			const name = node.childForFieldName('name');
			return name?.text ?? null;
		}
		return null;
	}

	private findContainingNode(cursor: any, nodes: ICodeGraphNode[]): ICodeGraphNode | null {
		const c = {
			startLine: cursor.startPosition.row,
			endLine: cursor.endPosition.row,
			startCol: cursor.startPosition.column,
			endCol: cursor.endPosition.column,
		};
		let best: ICodeGraphNode | null = null;
		for (const node of nodes) {
			if (!this.spanContains(node, c)) continue;
			if (!best || this.spanContains(best, node)) best = node;
		}
		return best;
	}

	private spanContains(
		outer: { startLine: number; endLine: number; startCol: number; endCol: number },
		inner: { startLine: number; endLine: number; startCol: number; endCol: number },
	): boolean {
		if (inner.startLine < outer.startLine || inner.startLine > outer.endLine) return false;
		if (inner.endLine < outer.startLine || inner.endLine > outer.endLine) return false;
		if (inner.startLine === outer.startLine && inner.startCol < outer.startCol) return false;
		if (inner.endLine === outer.endLine && inner.endCol > outer.endCol) return false;
		return true;
	}

	async parseFile(absPath: string, relativePath: string, ext: string): Promise<{ nodes: ICodeGraphNode[]; edges: ICodeGraphEdge[] }> {
		const language = LANGUAGE_MAP[ext] ?? 'typescript';
		const parser = await this.createParser(language);
		const source = await fsPromises.readFile(absPath, 'utf8');
		const tree = parser.parse(source);
		const nodes = this.extractDeclarations(tree.rootNode, relativePath, [], language);
		const edges = this.extractEdges(tree.rootNode, language, relativePath, nodes);
		return { nodes, edges };
	}

	async ingest(projectRoot: string, force: boolean = false): Promise<ICodeGraphIngestResult> {
		const result: ICodeGraphIngestResult = { filesIndexed: 0, filesUpdated: 0, filesSkipped: 0, nodesCreated: 0, edgesCreated: 0 };

		const files = await this.discoverFiles(projectRoot);
		const existingFiles = await this.persistence.codeGraphListFiles(projectRoot);
		const existingMap = new Map(existingFiles.map(f => [f.filePath, f]));

		const newOrChangedFiles: string[] = [];
		for (const file of files) {
			const existing = existingMap.get(file);
			const absPath = path.join(projectRoot, file);
			if (!existing || force) {
				newOrChangedFiles.push(file);
				continue;
			}
			try {
				const stat = fs.statSync(absPath);
				if (stat.mtimeMs !== existing.mtime) {
					const hash = await this.contentHash(absPath);
					if (hash !== existing.contentHash) {
						newOrChangedFiles.push(file);
						continue;
					}
				}
			} catch {
				newOrChangedFiles.push(file);
			}
		}
		result.filesSkipped = files.length - newOrChangedFiles.length;

		const deletedFiles = existingFiles.filter(f => !files.includes(f.filePath));
		for (const f of deletedFiles) {
			await this.persistence.codeGraphDeleteByFile(projectRoot, f.filePath);
		}

		for (const file of newOrChangedFiles) {
			const absPath = path.join(projectRoot, file);
			const ext = path.extname(file);
			const stat = fs.statSync(absPath);
			const hash = await this.contentHash(absPath);
			const { nodes, edges } = await this.parseFile(absPath, file, ext);

			for (const n of nodes) {
				n.projectId = projectRoot;
			}

			await this.persistence.codeGraphUpsertFile({
				id: randomUUID(),
				projectId: projectRoot,
				filePath: file,
				language: LANGUAGE_MAP[ext] ?? 'unknown',
				mtime: stat.mtimeMs,
				contentHash: hash,
				indexedAt: Date.now(),
			});
			await this.persistence.codeGraphUpsertNodes(projectRoot, file, nodes);
			await this.persistence.codeGraphUpsertEdges(projectRoot, file, edges);

			result.filesUpdated++;
			result.nodesCreated += nodes.length;
			result.edgesCreated += edges.length;
		}

		result.filesIndexed = result.filesUpdated;
		this.sessionWalked.set(projectRoot, true);
		return result;
	}

	async reparseFile(projectRoot: string, relativePath: string): Promise<void> {
		const absPath = path.join(projectRoot, relativePath);
		const ext = path.extname(relativePath);

		if (!fs.existsSync(absPath)) {
			await this.persistence.codeGraphDeleteByFile(projectRoot, relativePath);
			return;
		}

		if (!this.isSupportedLanguage(ext)) {
			const existing = await this.persistence.codeGraphGetFile(projectRoot, relativePath);
			if (existing) await this.persistence.codeGraphDeleteByFile(projectRoot, relativePath);
			return;
		}

		if (await this.isGitIgnored(projectRoot, relativePath)) {
			const existing = await this.persistence.codeGraphGetFile(projectRoot, relativePath);
			if (existing) await this.persistence.codeGraphDeleteByFile(projectRoot, relativePath);
			return;
		}

		const stat = fs.statSync(absPath);
		const hash = await this.contentHash(absPath);
		const existing = await this.persistence.codeGraphGetFile(projectRoot, relativePath);

		if (existing && existing.contentHash === hash && existing.mtime === stat.mtimeMs) {
			return;
		}

		const { nodes, edges } = await this.parseFile(absPath, relativePath, ext);
		for (const n of nodes) {
			n.projectId = projectRoot;
		}

		await this.persistence.codeGraphUpsertFile({
			id: randomUUID(),
			projectId: projectRoot,
			filePath: relativePath,
			language: LANGUAGE_MAP[ext] ?? 'unknown',
			mtime: stat.mtimeMs,
			contentHash: hash,
			indexedAt: Date.now(),
		});
		await this.persistence.codeGraphUpsertNodes(projectRoot, relativePath, nodes);
		await this.persistence.codeGraphUpsertEdges(projectRoot, relativePath, edges);
	}

	async onFileWritten(filePath: string): Promise<void> {
		const projectRoot = await this.persistence.codeGraphFindProjectRoot(filePath);
		if (!projectRoot) return;
		const relativePath = path.relative(projectRoot, filePath);
		await this.reparseFile(projectRoot, relativePath);
	}

	async ensureIndexed(projectRoot: string): Promise<void> {
		if (this.sessionWalked.get(projectRoot)) return;
		const files = await this.persistence.codeGraphListFiles(projectRoot);
		if (files.length === 0) {
			await this.ingest(projectRoot, false);
		}
		this.sessionWalked.set(projectRoot, true);
	}

	async search(projectRoot: string, query: string, options?: ICodeGraphSearchOptions): Promise<ICodeGraphNode[]> {
		await this.ensureIndexed(projectRoot);
		return await this.persistence.codeGraphSearchNodes(projectRoot, query, options);
	}

	async getSymbol(projectRoot: string, symbolId: string): Promise<ICodeGraphNode | null> {
		return await this.persistence.codeGraphGetNode(projectRoot, symbolId);
	}

	async getCallers(projectRoot: string, symbolName: string, depth?: number): Promise<ICodeGraphNode[]> {
		return await this.persistence.codeGraphGetCallers(projectRoot, symbolName, depth);
	}

	async getCallees(projectRoot: string, symbolId: string, depth?: number): Promise<ICodeGraphNode[]> {
		return await this.persistence.codeGraphGetCallees(projectRoot, symbolId, depth);
	}

	async listFile(projectRoot: string, filePath: string): Promise<ICodeGraphNode[]> {
		await this.ensureIndexed(projectRoot);
		if (!filePath) {
			return await this.persistence.codeGraphGetAllNodes(projectRoot);
		}
		return await this.persistence.codeGraphGetNodesByFile(projectRoot, filePath);
	}

	async clear(projectRoot: string): Promise<void> {
		await this.persistence.codeGraphClearProject(projectRoot);
		this.sessionWalked.delete(projectRoot);
	}
}
