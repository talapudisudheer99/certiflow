-- Certificate numbers PSM-<year>-<6 digits> come from this sequence (decision D6).
-- A sequence never hands out the same value twice, even to concurrent workers.
CREATE SEQUENCE IF NOT EXISTS certificate_number_seq START 1 MAXVALUE 999999;

-- Append-only audit log (US-10): the application can insert, but never change or delete history.
CREATE OR REPLACE FUNCTION audit_log_is_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'AuditLog is append-only: % is not allowed', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_log_no_update_or_delete
  BEFORE UPDATE OR DELETE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION audit_log_is_append_only();
