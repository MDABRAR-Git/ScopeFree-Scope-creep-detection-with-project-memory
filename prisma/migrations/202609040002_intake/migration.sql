-- Preserve any existing request rows. New intake requires a validated rate;
-- nullable storage permits old/pre-analysis records without inventing a financial input.
ALTER TABLE "ChangeRequest" ADD COLUMN "hourlyRatePaise" INTEGER;
ALTER TABLE "ChangeRequest" ADD CONSTRAINT "ChangeRequest_hourlyRatePaise_check"
  CHECK ("hourlyRatePaise" IS NULL OR ("hourlyRatePaise" > 0 AND "hourlyRatePaise" <= 10000000));

-- The original agreement is immutable even if a future route accidentally attempts an update.
-- Deletion is also forbidden: baseline corrections require a new project in this MVP.
CREATE FUNCTION scopefree_original_baseline_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Original baselines are immutable' USING ERRCODE = '23514';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER original_baseline_immutable
BEFORE UPDATE OR DELETE ON "Baseline"
FOR EACH ROW EXECUTE FUNCTION scopefree_original_baseline_immutable();
