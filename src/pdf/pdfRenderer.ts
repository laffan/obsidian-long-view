import * as pdfjsLib from 'pdfjs-dist';

// Set worker source
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

export interface PDFDocument {
	pdf: pdfjsLib.PDFDocumentProxy;
	pageCount: number;
}

/**
 * Load a PDF from a blob
 */
export async function loadPDF(pdfBlob: Blob): Promise<PDFDocument> {
	const arrayBuffer = await pdfBlob.arrayBuffer();
	const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

	return {
		pdf,
		pageCount: pdf.numPages,
	};
}

/**
 * Render a specific PDF page to a canvas element
 */
export async function renderPageToCanvas(
	pdf: pdfjsLib.PDFDocumentProxy,
	pageNumber: number,
	canvas: HTMLCanvasElement,
	scale: number = 1.0
): Promise<void> {
	const page = await pdf.getPage(pageNumber);
	const viewport = page.getViewport({ scale });

	const context = canvas.getContext('2d');
	if (!context) {
		throw new Error('Could not get canvas context');
	}

	// Set canvas dimensions
	canvas.width = viewport.width;
	canvas.height = viewport.height;

	// Render the page
	const renderContext = {
		canvasContext: context,
		viewport: viewport,
	};

	await page.render(renderContext).promise;
}

/**
 * Get the dimensions of a PDF page without rendering it
 */
export async function getPageDimensions(
	pdf: pdfjsLib.PDFDocumentProxy,
	pageNumber: number,
	scale: number = 1.0
): Promise<{ width: number; height: number }> {
	const page = await pdf.getPage(pageNumber);
	const viewport = page.getViewport({ scale });

	return {
		width: viewport.width,
		height: viewport.height,
	};
}
