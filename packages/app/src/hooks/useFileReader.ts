import { useCallback } from 'react';
import type { IMessagePartAttachment } from '@warpcore/bridge';
import { EMessagePartType } from '@warpcore/bridge';
import * as pdfjsLib from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc = '//cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

const MAX_FILE_SIZE = 10 * 1024 * 1024;

const ALLOWED_MIME_TYPES = [
	/^image\/.*/,
	/^application\/pdf$/,
	/^text\/.*/,
	/^application\/json$/,
	/^application\/.*/
];

const BLOCKED_EXTENSIONS = [
	'.exe', '.bat', '.cmd', '.sh', '.ps1', '.py', '.js', '.pl', '.rb',
	'.com', '.app', '.msi', '.dmg', '.pkg', '.deb', '.rpm', '.bin',
	'.iso', '.img', '.vhd', '.vhdx', '.ova', '.ovf', '.tar', '.gz',
	'.zip', '.rar', '.7z', '.bz2', '.xz', '.apk', '.elf', '.so', '.dll'
];

const CODE_EXTENSIONS = [
	'.js', '.ts', '.jsx', '.tsx', '.c', '.cpp', '.cc', '.cxx', '.h', '.hpp',
	'.php', '.py', '.rb', '.go', '.rs', '.java', '.cs', '.swift', '.kt',
	'.sh', '.bash', '.zsh', '.fish', '.ps1', '.bat', '.cmd',
	'.sql', '.json', '.yaml', '.yml', '.xml', '.html', '.css', '.scss', '.sass', '.less',
	'.md', '.txt', '.csv', '.log', '.ini', '.conf', '.cfg', '.env'
];

function isAllowedFileType(fileName: string, mimeType: string): boolean {
	const lowerName = fileName.toLowerCase();
	
	for (const ext of BLOCKED_EXTENSIONS) {
		if (lowerName.endsWith(ext)) return false;
	}
	
	if (CODE_EXTENSIONS.some(ext => lowerName.endsWith(ext))) {
		return true;
	}
	
	for (const pattern of ALLOWED_MIME_TYPES) {
		if (pattern.test(mimeType)) return true;
	}
	
	return false;
}

export function useFileReader() {
	const readFile = useCallback(async (file: File): Promise<IMessagePartAttachment> => {
		if (file.size > MAX_FILE_SIZE) {
			throw new Error('File too large (max 10MB)');
		}
		
		if (!isAllowedFileType(file.name, file.type)) {
			throw new Error('File type not allowed');
		}
		
		return new Promise((resolve, reject) => {
			const reader = new FileReader();
			
			reader.onload = (e) => {
				const base64 = e.target?.result as string;
				resolve({
					id: crypto.randomUUID(),
					type: EMessagePartType.ATTACHMENT,
					orderIndex: 0,
					data: base64,
					mimeType: file.type || 'application/octet-stream',
					fileName: file.name,
					fileSize: file.size,
				});
			};
			
			reader.onerror = () => reject(new Error('Failed to read file'));
			reader.readAsDataURL(file);
		});
	}, []);
	
	const extractTextFromFile = useCallback(async (file: File): Promise<string> => {
		if (file.type === 'text/plain' || file.type === 'text/markdown') {
			return await file.text();
		}
		
		const lowerName = file.name.toLowerCase();
		if (CODE_EXTENSIONS.some(ext => lowerName.endsWith(ext))) {
			return await file.text();
		}
		
		if (file.type === 'application/pdf') {
			const arrayBuffer = await file.arrayBuffer();
			const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;
			let text = '';
			
			for (let i = 1; i <= pdf.numPages; i++) {
				const page = await pdf.getPage(i);
				const textContent = await page.getTextContent();
				text += textContent.items.map((item: any) => 'str' in item ? item.str : '').join(' ') + '\n\n';
			}
			
			return text;
		}
		
		return await file.text();
	}, []);
	
	return { readFile, extractTextFromFile };
}
