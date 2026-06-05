-- session_id inbound usa chave composta (ex.: twilio_whatsapp:twilio:AC...:phone:5511...)
ALTER TABLE flow_response_events
  ALTER COLUMN session_id TYPE text USING session_id::text;
