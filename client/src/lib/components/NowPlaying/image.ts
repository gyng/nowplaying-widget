export function convertByteArrayToObjectURL(data: number[], contentType: string): string {
	return URL.createObjectURL(new Blob([new Uint8Array(data)], { type: contentType }));
}
