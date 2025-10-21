interface RGBColor {
	r: number;
	g: number;
	b: number;
	a: number;
}

class ChromaColor {
	private readonly rgb: RGBColor;

	constructor(color: string | RGBColor) {
		if (typeof color === 'string') {
			this.rgb = parseColor(color);
		} else {
			this.rgb = { ...color };
		}
	}

	alpha(value: number): ChromaColor {
		return new ChromaColor({ ...this.rgb, a: clamp(value, 0, 1) });
	}

	css(): string {
		const { r, g, b, a } = this.rgb;
		if (a >= 1) {
			return rgbToHex(r, g, b);
		}
		return `rgba(${r}, ${g}, ${b}, ${a.toFixed(3)})`;
	}

	rgbChannels(): RGBColor {
		return { ...this.rgb };
	}
}

function parseColor(input: string): RGBColor {
	const hexMatch = input.trim().match(/^#?([0-9a-f]{6}|[0-9a-f]{3})$/i);
	if (hexMatch) {
		return hexToRgb(hexMatch[1]);
	}

	const rgbaMatch = input.trim().match(/^rgba?\(([^)]+)\)$/i);
	if (rgbaMatch) {
		const parts = rgbaMatch[1].split(',').map((p) => parseFloat(p.trim()));
		const [r = 0, g = 0, b = 0, a = 1] = parts;
		return {
			r: clamp(Math.round(r), 0, 255),
			g: clamp(Math.round(g), 0, 255),
			b: clamp(Math.round(b), 0, 255),
			a: clamp(a, 0, 1),
		};
	}

	// Default fallback
	return { r: 0, g: 0, b: 0, a: 1 };
}

function hexToRgb(hex: string): RGBColor {
	const sanitized = hex.length === 3
		? hex.split('').map((c) => c + c).join('')
		: hex;
	const r = parseInt(sanitized.substring(0, 2), 16);
	const g = parseInt(sanitized.substring(2, 4), 16);
	const b = parseInt(sanitized.substring(4, 6), 16);
	return { r, g, b, a: 1 };
}

function rgbToHex(r: number, g: number, b: number): string {
	return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function toHex(value: number): string {
	const clamped = clamp(Math.round(value), 0, 255);
	return clamped.toString(16).padStart(2, '0');
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

function relativeLuminance({ r, g, b }: RGBColor): number {
	const srgb = [r, g, b].map((v) => {
		const channel = v / 255;
		return channel <= 0.03928
			? channel / 12.92
			: Math.pow((channel + 0.055) / 1.055, 2.4);
	});
	return 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2];
}

function contrastRatio(colorA: RGBColor, colorB: RGBColor): number {
	const lumA = relativeLuminance(colorA);
	const lumB = relativeLuminance(colorB);
	const bright = Math.max(lumA, lumB);
	const dark = Math.min(lumA, lumB);
	return (bright + 0.05) / (dark + 0.05);
}

function chroma(input: string): ChromaColor {
	return new ChromaColor(input);
}

(chroma as any).contrast = function contrast(a: string | ChromaColor, b: string | ChromaColor): number {
	const colorA = a instanceof ChromaColor ? a.rgbChannels() : parseColor(a);
	const colorB = b instanceof ChromaColor ? b.rgbChannels() : parseColor(b);
	return contrastRatio(colorA, colorB);
};

export default chroma as ((input: string) => ChromaColor) & {
	contrast: (a: string | ChromaColor, b: string | ChromaColor) => number;
};
