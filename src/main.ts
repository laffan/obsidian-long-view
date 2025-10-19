import { Plugin, WorkspaceLeaf } from 'obsidian';
import { LongView, LONG_VIEW_TYPE } from './ui/LongView';
import { LongViewSettings, DEFAULT_SETTINGS } from './settings';
import { createFlagHighlightExtension, processRenderedFlags } from './flags/flagStyling';

export default class LongViewPlugin extends Plugin {
	settings: LongViewSettings;

	async onload() {
		await this.loadSettings();

		// Style inline flags inside the main editor and reading view
		this.registerEditorExtension(createFlagHighlightExtension());
		this.registerMarkdownPostProcessor((element, context) => {
			processRenderedFlags(element, context);
		});

		// Register the custom view
		this.registerView(
			LONG_VIEW_TYPE,
			(leaf) => new LongView(leaf, this)
		);

		// Add ribbon icon to open the view
		this.addRibbonIcon('layout-grid', 'Open Long View', () => {
			this.activateView();
		});

		// Add command to open the view
		this.addCommand({
			id: 'open-long-view',
			name: 'Open Long View',
			callback: () => {
				this.activateView();
			}
		});
	}

	onunload() {
		// Detach all leaves of our custom view type
		this.app.workspace.detachLeavesOfType(LONG_VIEW_TYPE);
	}

	async activateView() {
		const { workspace } = this.app;

		let leaf: WorkspaceLeaf | null = null;
		const leaves = workspace.getLeavesOfType(LONG_VIEW_TYPE);

		if (leaves.length > 0) {
			// A leaf with our view already exists, use that
			leaf = leaves[0];
		} else {
			// Our view could not be found in the workspace, create a new leaf
			// in the right sidebar for it
			const rightLeaf = workspace.getRightLeaf(false);
			if (rightLeaf) {
				leaf = rightLeaf;
				await leaf.setViewState({ type: LONG_VIEW_TYPE, active: true });
			}
		}

		// Reveal the leaf in case it is in a collapsed sidebar
		if (leaf) {
			workspace.revealLeaf(leaf);
		}
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
