-- delivery_feedback tenía una policy "Public can submit delivery feedback"
-- con WITH CHECK (true), permitiendo a cualquiera con la anon key insertar
-- feedback en cualquier delivery via REST API directamente, saltándose la
-- validación de tracking_token que hace la edge function submit-feedback.
--
-- La edge function usa service role (bypassea RLS), así que dropear esta
-- policy no afecta el path legítimo. El resultado: clientes públicos solo
-- pueden insertar feedback vía la edge function, que valida tracking_token,
-- estado del delivery, y previene duplicados.

drop policy if exists "Public can submit delivery feedback" on delivery_feedback;
