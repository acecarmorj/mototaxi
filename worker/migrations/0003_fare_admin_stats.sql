-- Fare final + motivo de cancelamento (expired vs user/admin)
ALTER TABLE rides ADD COLUMN fare_final REAL;
ALTER TABLE rides ADD COLUMN cancel_reason TEXT;
