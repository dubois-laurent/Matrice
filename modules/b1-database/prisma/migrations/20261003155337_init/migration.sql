-- CreateEnum
CREATE TYPE "period" AS ENUM ('am', 'pm');

-- CreateEnum
CREATE TYPE "student_group" AS ENUM ('A', 'B', 'Promotion');

-- CreateEnum
CREATE TYPE "mode" AS ENUM ('DG', 'CE', 'AUTO');

-- CreateEnum
CREATE TYPE "domain" AS ENUM ('web', 'data', 'cyber', 'projet');

-- CreateEnum
CREATE TYPE "session_status" AS ENUM ('proposed', 'confirmed');

-- CreateTable
CREATE TABLE "teachers" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "teachers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "weeks" (
    "id" SERIAL NOT NULL,
    "start_date" DATE NOT NULL,

    CONSTRAINT "weeks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "week_id" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "period" "period" NOT NULL,
    "student_group" "student_group" NOT NULL,
    "mode" "mode" NOT NULL,
    "title" TEXT NOT NULL,
    "domain" "domain" NOT NULL,
    "teacher_id" INTEGER,
    "status" "session_status" NOT NULL DEFAULT 'proposed',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "acquis" (
    "id" SERIAL NOT NULL,
    "session_id" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "validated" BOOLEAN NOT NULL DEFAULT false,
    "validated_at" TIMESTAMP(3),

    CONSTRAINT "acquis_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "teachers_code_key" ON "teachers"("code");

-- CreateIndex
CREATE UNIQUE INDEX "weeks_start_date_key" ON "weeks"("start_date");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_code_key" ON "sessions"("code");

-- CreateIndex
CREATE INDEX "sessions_week_id_date_period_idx" ON "sessions"("week_id", "date", "period");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_teacher_id_date_period_key" ON "sessions"("teacher_id", "date", "period");

-- CreateIndex
CREATE INDEX "acquis_session_id_idx" ON "acquis"("session_id");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_week_id_fkey" FOREIGN KEY ("week_id") REFERENCES "weeks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "teachers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "acquis" ADD CONSTRAINT "acquis_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
