-- AlterTable: a nota do educativo é uma razão (0 a 1), não um inteiro.
ALTER TABLE "questionnaire_responses" ALTER COLUMN "score" SET DATA TYPE DOUBLE PRECISION;

-- CreateIndex: o check-in localiza a sessão pelo código.
CREATE UNIQUE INDEX "workshop_sessions_code_key" ON "workshop_sessions"("code");
