export function convertByteArrayToObjectURL(data: number[], contentType: string): string {
	const t0 = performance.now();
	const url = URL.createObjectURL(
		new Blob([new Uint8Array(data)], {
			type: contentType
		})
	);
	const t1 = performance.now();
	console.log(`convertByteArrayToObjectURL: ${t1 - t0}ms`);
	return url;
}
