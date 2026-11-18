/**
 * Re-encodes an oversized raster image as JPEG, shrinking quality then dimensions
 * until it fits under `maxBytes`. Vector images are returned untouched.
 */
export async function compressImage(file: File, maxBytes: number): Promise<File> {
	if (file.size <= maxBytes || file.type === 'image/svg+xml') return file;

	const bitmap = await createImageBitmap(file);
	const canvas = document.createElement('canvas');
	const ctx = canvas.getContext('2d');
	if (!ctx) return file;

	let width = bitmap.width;
	let height = bitmap.height;
	let best: File | null = null;

	for (let attempt = 0; attempt < 8; attempt++) {
		canvas.width = width;
		canvas.height = height;
		ctx.clearRect(0, 0, width, height);
		ctx.drawImage(bitmap, 0, 0, width, height);

		for (const quality of [0.85, 0.7, 0.55, 0.4]) {
			const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
			if (!blob) continue;
			const name = file.name.replace(/\.\w+$/, '') + '.jpg';
			const candidate = new File([blob], name, { type: 'image/jpeg' });
			if (!best || candidate.size < best.size) best = candidate;
			if (candidate.size <= maxBytes) return candidate;
		}
		width = Math.round(width * 0.75);
		height = Math.round(height * 0.75);
	}
	// Couldn't get under the limit; hand back the smallest attempt and let the server reject it.
	return best ?? file;
}
