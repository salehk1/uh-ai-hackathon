/** Don't discard a newer edit when a previous submitted ZIP finishes updating the URL. */
export type ZipDraft = { origin: string; value: string; editing: boolean };
export function visibleZipDraft(draft: ZipDraft, applied: string) {
  return draft.editing || draft.origin === applied ? draft.value : applied;
}
