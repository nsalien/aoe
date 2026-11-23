-- Computerspelers (bots): gewone spelers met een eigen stad, in eigen clans (teams met enkel bots).
-- bot_next = wanneer de bot weer aan de beurt is (de server laat bots 'lui' handelen bij gewone verzoeken).
ALTER TABLE players ADD COLUMN bot INTEGER NOT NULL DEFAULT 0;
ALTER TABLE players ADD COLUMN bot_next INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS players_bot ON players (bot, bot_next);
-- instellingen van de wereld: hoeveel bots, hoe sterk (1 makkelijk, 2 normaal, 3 sterk), laatste controle van het aantal
ALTER TABLE world ADD COLUMN bots INTEGER NOT NULL DEFAULT 4;
ALTER TABLE world ADD COLUMN bot_level INTEGER NOT NULL DEFAULT 2;
ALTER TABLE world ADD COLUMN bot_check INTEGER NOT NULL DEFAULT 0;
