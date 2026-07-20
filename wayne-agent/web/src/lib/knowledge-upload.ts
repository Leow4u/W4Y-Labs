/**
 * Uploading a knowledge document that is already there.
 *
 * The ingest path appends chunks to the fact store and appends an entry to the
 * manifest; it does not replace. So re-uploading the same file — the ordinary
 * gesture when a document was corrected — silently DOUBLES the facts, and the
 * agent starts answering from two versions of the same document at once, with
 * nothing on screen to reveal it.
 *
 * There is no "replace" endpoint, and inventing one is not needed: delete then
 * upload, in that order, is exactly a replace and uses only contracts that
 * already exist.
 */
import { api, type KnowledgeDoc } from "@/lib/api";

export interface KnowledgeUploadResult {
  /** True when an existing document with the same name was replaced. */
  replaced: boolean;
  facts: number;
}

export async function uploadKnowledgeDocument(
  file: File,
  profile: string | undefined,
  existing: KnowledgeDoc[],
): Promise<KnowledgeUploadResult> {
  const clash = existing.some((d) => d.name === file.name);
  if (clash) {
    // Delete FIRST: if the upload then fails, the user is left without the
    // document (visible, recoverable) instead of with two silent copies of it.
    await api.deleteKnowledge(file.name, profile);
  }
  const res = await api.uploadKnowledge(file, profile);
  return { replaced: clash, facts: res.document?.facts ?? 0 };
}
