-- Twee extra soorten meldingen per toestel (push_subs), standaard aan:
--   n_now  = aanval op je stad, meteen als het leger vertrekt (zat vroeger mee in n_attack; wie dat uitzette, houdt het uit)
--   n_ally = aanval op de stad van een clanlid, meteen als het leger vertrekt
-- n_attack blijft: ±2 min voor een aanval op je stad aankomt, en een overval van de barbaren.
ALTER TABLE push_subs ADD COLUMN n_now INTEGER NOT NULL DEFAULT 1;
ALTER TABLE push_subs ADD COLUMN n_ally INTEGER NOT NULL DEFAULT 1;
UPDATE push_subs SET n_now = n_attack;
