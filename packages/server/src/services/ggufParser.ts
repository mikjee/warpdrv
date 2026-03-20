import fs from 'fs/promises';
import { open } from 'fs/promises';
import type { IGgufMetadata } from '@warpcore/shared';

// GGUF magic: 0x46475547 = "GGUF" in ASCII
const GGUF_MAGIC = 0x46475547;

// GGUF metadata value types
enum EGgufValueType {
	UINT8 = 0,
	INT8 = 1,
	UINT16 = 2,
	INT16 = 3,
	UINT32 = 4,
	INT32 = 5,
	FLOAT32 = 6,
	BOOL = 7,
	STRING = 8,
	ARRAY = 9,
	UINT64 = 10,
	INT64 = 11,
	FLOAT64 = 12,
}

// Buffered reader that reads chunks from a file handle
class GgufReader {
	private handle: fs.FileHandle;
	private buffer: Buffer;
	private offset: number;
	private bufferOffset: number;
	private bufferLength: number;
	private readonly chunkSize = 64 * 1024; // 64KB chunks

	constructor(handle: fs.FileHandle) {
		this.handle = handle;
		this.buffer = Buffer.alloc(this.chunkSize);
		this.offset = 0;
		this.bufferOffset = 0;
		this.bufferLength = 0;
	}

	private async ensureBytes(count: number): Promise<void> {
		const available = this.bufferLength - this.bufferOffset;
		if (available >= count) return;

		// Copy remaining bytes to start of buffer
		if (available > 0) {
			this.buffer.copy(this.buffer, 0, this.bufferOffset, this.bufferOffset + available);
		}
		this.bufferOffset = 0;
		this.bufferLength = available;

		// Grow buffer if needed
		if (count > this.buffer.length) {
			const newBuf = Buffer.alloc(count);
			this.buffer.copy(newBuf, 0, 0, available);
			this.buffer = newBuf;
		}

		// Read more data
		const toRead = Math.max(this.chunkSize, count - available);
		const { bytesRead } = await this.handle.read(this.buffer, available, toRead, this.offset + available);
		this.bufferLength = available + bytesRead;
	}

	private consume(count: number): void {
		this.bufferOffset += count;
		this.offset += count;
	}

	async readUint32(): Promise<number> {
		await this.ensureBytes(4);
		const val = this.buffer.readUInt32LE(this.bufferOffset);
		this.consume(4);
		return val;
	}

	async readUint64(): Promise<bigint> {
		await this.ensureBytes(8);
		const val = this.buffer.readBigUInt64LE(this.bufferOffset);
		this.consume(8);
		return val;
	}

	async readInt64(): Promise<bigint> {
		await this.ensureBytes(8);
		const val = this.buffer.readBigInt64LE(this.bufferOffset);
		this.consume(8);
		return val;
	}

	async readFloat32(): Promise<number> {
		await this.ensureBytes(4);
		const val = this.buffer.readFloatLE(this.bufferOffset);
		this.consume(4);
		return val;
	}

	async readFloat64(): Promise<number> {
		await this.ensureBytes(8);
		const val = this.buffer.readDoubleLE(this.bufferOffset);
		this.consume(8);
		return val;
	}

	async readUint8(): Promise<number> {
		await this.ensureBytes(1);
		const val = this.buffer.readUInt8(this.bufferOffset);
		this.consume(1);
		return val;
	}

	async readInt8(): Promise<number> {
		await this.ensureBytes(1);
		const val = this.buffer.readInt8(this.bufferOffset);
		this.consume(1);
		return val;
	}

	async readUint16(): Promise<number> {
		await this.ensureBytes(2);
		const val = this.buffer.readUInt16LE(this.bufferOffset);
		this.consume(2);
		return val;
	}

	async readInt16(): Promise<number> {
		await this.ensureBytes(2);
		const val = this.buffer.readInt16LE(this.bufferOffset);
		this.consume(2);
		return val;
	}

	async readInt32(): Promise<number> {
		await this.ensureBytes(4);
		const val = this.buffer.readInt32LE(this.bufferOffset);
		this.consume(4);
		return val;
	}

	async readBool(): Promise<boolean> {
		const val = await this.readUint8();
		return val !== 0;
	}

	async readString(): Promise<string> {
		const len = Number(await this.readUint64());
		if (len === 0) return '';
		await this.ensureBytes(len);
		const str = this.buffer.toString('utf8', this.bufferOffset, this.bufferOffset + len);
		this.consume(len);
		return str;
	}

	// Read a metadata value by type, returns primitive or skips arrays
	async readValue(type: EGgufValueType): Promise<string | number | boolean | bigint | null> {
		switch (type) {
			case EGgufValueType.UINT8: return this.readUint8();
			case EGgufValueType.INT8: return this.readInt8();
			case EGgufValueType.UINT16: return this.readUint16();
			case EGgufValueType.INT16: return this.readInt16();
			case EGgufValueType.UINT32: return this.readUint32();
			case EGgufValueType.INT32: return this.readInt32();
			case EGgufValueType.FLOAT32: return this.readFloat32();
			case EGgufValueType.BOOL: return this.readBool();
			case EGgufValueType.STRING: return this.readString();
			case EGgufValueType.UINT64: return this.readUint64();
			case EGgufValueType.INT64: return this.readInt64();
			case EGgufValueType.FLOAT64: return this.readFloat64();
			case EGgufValueType.ARRAY: {
				// Read array type and length, then skip values
				const arrType = await this.readUint32() as EGgufValueType;
				const arrLen = Number(await this.readUint64());
				for (let i = 0; i < arrLen; i++) {
					await this.readValue(arrType);
				}
				return null; // we don't need array values
			}
			default: return null;
		}
	}
}

// Parse GGUF file header and return metadata
export async function parseGgufMetadata(filePath: string): Promise<IGgufMetadata | null> {
	let handle: fs.FileHandle | null = null;

	try {
		handle = await open(filePath, 'r');
		const reader = new GgufReader(handle);

		// Read header
		const magic = await reader.readUint32();
		if (magic !== GGUF_MAGIC) return null;

		const version = await reader.readUint32();
		if (version < 2 || version > 3) return null;

		const tensorCount = Number(await reader.readUint64());
		const metadataKvCount = Number(await reader.readUint64());

		// Read all metadata key-value pairs
		const metadata: Record<string, string | number | boolean | bigint> = {};

		for (let i = 0; i < metadataKvCount; i++) {
			const key = await reader.readString();
			const valueType = await reader.readUint32() as EGgufValueType;
			const value = await reader.readValue(valueType);
			if (value !== null) {
				metadata[key] = value;
			}
		}

		// Extract relevant fields
		const arch = String(metadata['general.architecture'] ?? 'unknown');
		const nLayers = Number(metadata[`${arch}.block_count`] ?? metadata['general.block_count'] ?? 0);
		const nKvHeads = Number(metadata[`${arch}.attention.head_count_kv`] ?? 0);
		const embeddingDim = Number(metadata[`${arch}.embedding_length`] ?? 0);
		const feedForwardDim = Number(metadata[`${arch}.feed_forward_length`] ?? 0);
		const contextLength = Number(metadata[`${arch}.context_length`] ?? 0);
		const fileType = Number(metadata['general.file_type'] ?? 0);

		// Get file size
		const stat = await handle.stat();

		// Infer quant type from filename (more reliable than file_type enum)
		const quantMatch = filePath.match(/[-_](Q\d[\w_]*|IQ\d[\w_]*|MXFP\d+|F16|F32|BF16)/i);
		const quantType = quantMatch ? quantMatch[1]!.toUpperCase() : `ft${fileType}`;

		// Infer param count from general.name or tensor count
		const generalName = String(metadata['general.name'] ?? '');
		const paramMatch = generalName.match(/(\d+\.?\d*)B/i);
		const paramCount = paramMatch ? `${paramMatch[1]}B` : `${tensorCount} tensors`;

		return {
			architecture: arch,
			paramCount,
			quantType,
			nLayers,
			nKvHeads,
			embeddingDim,
			feedForwardDim,
			contextLength,
			fileSize: stat.size,
		};
	} catch {
		return null;
	} finally {
		if (handle) await handle.close();
	}
}
