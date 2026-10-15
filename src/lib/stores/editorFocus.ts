import { writable } from 'svelte/store';
import type { ReviewFocusTarget } from '$lib/plan2world/reviewFocus';

/** One-shot handoff from reconstruction Review to the live 2D editor canvas. */
export const editorFocusRequest = writable<ReviewFocusTarget | null>(null);
