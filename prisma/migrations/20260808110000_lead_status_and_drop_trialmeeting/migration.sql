-- AlterTable
ALTER TABLE "LgsApplication" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'new';

-- AlterTable
ALTER TABLE "CampApplication" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'new';

-- DropTable (kullanılmayan model, hiçbir controller/route referans vermiyor)
DROP TABLE "TrialMeeting";
