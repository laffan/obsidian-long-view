export const FLAG_TYPES = [
	'TODO',
	'NOW',
	'DONE',
	'WAITING',
	'NOTE',
	'IMPORTANT',
	'COMMENT',
	'MISSING',
] as const;

export type FlagType = typeof FLAG_TYPES[number];

export interface FlagMetadata {
	type: FlagType;
	label: string;
	description: string;
	example: string;
}

export const FLAG_METADATA: FlagMetadata[] = [
	{ type: 'TODO', label: 'Todo', description: 'Highlights tasks to complete', example: '==TODO: Draft outline ==' },
	{ type: 'NOW', label: 'Now', description: 'Marks urgent items needing attention', example: '==NOW: Respond to email ==' },
	{ type: 'DONE', label: 'Done', description: 'Indicates completed tasks', example: '==DONE: Publish report ==' },
	{ type: 'WAITING', label: 'Waiting', description: 'Items blocked by external dependencies', example: '==WAITING: Client feedback ==' },
	{ type: 'NOTE', label: 'Note', description: 'General notes and reminders', example: '==NOTE: Revisit this section ==' },
	{ type: 'IMPORTANT', label: 'Important', description: 'High priority highlights', example: '==IMPORTANT: Update numbers ==' },
	{ type: 'COMMENT', label: 'Comment', description: 'General inline comments', example: '%% comment %%' },
	{ type: 'MISSING', label: 'Missing', description: 'Calls out missing content; shows entire line', example: '==MISSING: Add summary ==' },
];
