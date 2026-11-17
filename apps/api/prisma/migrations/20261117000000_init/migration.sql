-- CreateSequence
CREATE SEQUENCE sync_server_seq;

-- CreateTable
CREATE TABLE "participants" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "key_hash" TEXT NOT NULL,
    "consent_at" TIMESTAMP(3) NOT NULL,
    "consent_version" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_records" (
    "id" TEXT NOT NULL,
    "participant_id" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "server_seq" BIGINT NOT NULL DEFAULT nextval('sync_server_seq'),

    CONSTRAINT "sync_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "questionnaire_responses" (
    "id" TEXT NOT NULL,
    "participant_id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "answers" JSONB NOT NULL,
    "score" INTEGER,
    "submitted_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "questionnaire_responses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workshop_sessions" (
    "id" TEXT NOT NULL,
    "workshop" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "location" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "manual_count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "workshop_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checkins" (
    "id" TEXT NOT NULL,
    "participant_id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "checkins_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "participants_code_key" ON "participants"("code");

-- CreateIndex
CREATE UNIQUE INDEX "sync_records_server_seq_key" ON "sync_records"("server_seq");

-- CreateIndex
CREATE UNIQUE INDEX "sync_records_participant_id_entity_entity_id_key" ON "sync_records"("participant_id", "entity", "entity_id");

-- CreateIndex
CREATE UNIQUE INDEX "questionnaire_responses_participant_id_client_id_key" ON "questionnaire_responses"("participant_id", "client_id");

-- CreateIndex
CREATE UNIQUE INDEX "checkins_participant_id_session_id_key" ON "checkins"("participant_id", "session_id");

-- AddForeignKey
ALTER TABLE "sync_records" ADD CONSTRAINT "sync_records_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "participants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questionnaire_responses" ADD CONSTRAINT "questionnaire_responses_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "participants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkins" ADD CONSTRAINT "checkins_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "participants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkins" ADD CONSTRAINT "checkins_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "workshop_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

