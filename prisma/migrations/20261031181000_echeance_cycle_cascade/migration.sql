-- DropForeignKey
ALTER TABLE "echeances" DROP CONSTRAINT "echeances_cycle_id_fkey";

-- AddForeignKey
ALTER TABLE "echeances" ADD CONSTRAINT "echeances_cycle_id_fkey" FOREIGN KEY ("cycle_id") REFERENCES "cycles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

