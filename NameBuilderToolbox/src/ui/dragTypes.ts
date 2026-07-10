/**
 * Shared HTML5 drag-and-drop payload types for the name-pattern designer.
 * Used by both the sidebar (drag source: new columns) and the designer
 * (drop target: insert new blocks, reorder existing ones).
 */

/** Payload: the column's logical name, dragged from the sidebar's column palette. */
export const NEW_FIELD_DRAG_TYPE = 'application/x-namebuilder-new-field';

/** Payload: the source block's current index, dragged from within the pattern list. */
export const REORDER_DRAG_TYPE = 'application/x-namebuilder-reorder';
