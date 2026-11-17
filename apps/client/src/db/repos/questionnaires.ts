import { db } from '../db';
import type { LocalQuestionnaireResponse } from '../schemas';

export async function saveQuestionnaireResponse(
  r: Omit<LocalQuestionnaireResponse, 'syncedAt'>,
): Promise<void> {
  await db.questionnaireResponses.put({ ...r, syncedAt: null });
}

export function getQuestionnaireResponses(
  kind?: LocalQuestionnaireResponse['kind'],
): Promise<LocalQuestionnaireResponse[]> {
  return kind
    ? db.questionnaireResponses.where('kind').equals(kind).toArray()
    : db.questionnaireResponses.toArray();
}

export async function markQuestionnaireSynced(id: string, at: string): Promise<void> {
  await db.questionnaireResponses.update(id, { syncedAt: at });
}
