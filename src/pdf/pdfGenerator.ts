import MarkdownIt from 'markdown-it';
// @ts-ignore - no types available
import htmlToPdfmake from 'html-to-pdfmake';

export interface PDFGenerationResult {
	pdfBlob: Blob;
	pageCount: number;
}

/**
 * Convert markdown to PDF with proper pagination
 */
export async function generatePDFFromMarkdown(
	markdown: string,
	fontSize: number = 12,
	pageMargins: [number, number, number, number] = [72, 72, 72, 72]
): Promise<PDFGenerationResult> {
	// Initialize markdown parser
	const md = new MarkdownIt({
		html: true,
		linkify: true,
		typographer: true,
	});

	// Convert markdown to HTML
	const html = md.render(markdown);

	// Convert HTML to pdfmake content
	const pdfContent = htmlToPdfmake(html);

	// Create PDF document definition using standard fonts
	const docDefinition: any = {
		content: pdfContent,
		defaultStyle: {
			font: 'Helvetica',
			fontSize: fontSize,
			lineHeight: 1.6,
		},
		pageSize: 'LETTER',
		pageMargins: pageMargins,
		styles: {
			h1: {
				fontSize: fontSize * 2,
				bold: true,
				margin: [0, 20, 0, 10],
			},
			h2: {
				fontSize: fontSize * 1.67,
				bold: true,
				margin: [0, 18, 0, 8],
			},
			h3: {
				fontSize: fontSize * 1.33,
				bold: true,
				margin: [0, 16, 0, 6],
			},
			h4: {
				fontSize: fontSize * 1.17,
				bold: true,
				margin: [0, 14, 0, 6],
			},
			h5: {
				fontSize: fontSize,
				bold: true,
				margin: [0, 12, 0, 4],
			},
			h6: {
				fontSize: fontSize,
				bold: true,
				margin: [0, 10, 0, 4],
			},
			p: {
				margin: [0, 0, 0, 10],
			},
			code: {
				font: 'Courier',
				fontSize: fontSize * 0.9,
				background: '#f5f5f5',
			},
			pre: {
				font: 'Courier',
				fontSize: fontSize * 0.9,
				background: '#f5f5f5',
				margin: [0, 10, 0, 10],
			},
		},
	};

	// Generate PDF
	return new Promise((resolve, reject) => {
		try {
			// Lazy load pdfmake only when needed
			const pdfMake = require('pdfmake/build/pdfmake');
			const pdfFonts = require('pdfmake/build/vfs_fonts');

			// Set vfs if not already set
			if (!pdfMake.vfs && pdfFonts && pdfFonts.pdfMake && pdfFonts.pdfMake.vfs) {
				pdfMake.vfs = pdfFonts.pdfMake.vfs;
			}

			const pdfDoc = pdfMake.createPdf(docDefinition);

			// Get the PDF as a blob
			pdfDoc.getBlob((blob: Blob) => {
				// Count pages (we'll need to load with pdf.js to get actual count)
				// For now, return the blob and we'll count later
				resolve({
					pdfBlob: blob,
					pageCount: 0, // Will be determined by pdf.js
				});
			});
		} catch (error) {
			console.error('PDF generation failed:', error);
			reject(error);
		}
	});
}
