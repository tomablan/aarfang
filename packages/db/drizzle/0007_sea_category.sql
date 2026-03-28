DO $$ BEGIN
  ALTER TYPE "signal_category" ADD VALUE IF NOT EXISTS 'sea';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
