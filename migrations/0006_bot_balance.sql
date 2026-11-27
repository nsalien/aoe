-- Balans van de computerspelers: referentie = scores van de echte spelers (JSON {med, hi, n, at}),
-- om de 10 minuten bijgewerkt. Elke bot mikt daarop volgens zijn sterkte (zwak, gemiddeld of sterk).
ALTER TABLE world ADD COLUMN bot_ref TEXT;
