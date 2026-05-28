import { float32ToWavBlob } from './VADManager';

export { float32ToWavBlob };

export async function transcribeAudio(serverId: string, audioBlob: Blob): Promise<string | null> {
	const formData = new FormData();
	formData.append('file', audioBlob, 'audio.webm');

	const response = await fetch(`/api/whisper-servers/${serverId}/transcribe`, {
		method: 'POST',
		body: formData,
	});

	if (!response.ok) {
		throw new Error(`Transcription failed: ${response.status}`);
	}

	const result = await response.json();
	return result.text?.trim() ?? null;
}
