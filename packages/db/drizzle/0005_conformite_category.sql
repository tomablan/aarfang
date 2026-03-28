-- Ajout de la valeur 'conformite' dans l'enum signal_category
DO $$ BEGIN
  ALTER TYPE "signal_category" ADD VALUE IF NOT EXISTS 'conformite';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
