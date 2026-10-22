-- Rename commercial/UI labels for the owners module: Propietarios → Tutores.
-- Does not rename tables, RPCs, or the clinic role `owner` (still "Propietario").

UPDATE public.features
SET
  name = 'Tutores',
  description = 'Módulo de tutores'
WHERE key = 'owners.enabled'
  AND name = 'Propietarios';

UPDATE public.features
SET
  description = 'Portal del tutor'
WHERE key = 'owner_portal.enabled'
  AND description = 'Portal del propietario';
