-- Vrede niet langer voor iedereen samen (3 weken), maar per speler: de eerste 24 uur na zijn start.
-- Vanaf nu betekent world.prep_ms "vrede per speler" en world.war_ms "lengte van het hele seizoen".
-- Het einde van een lopend seizoen blijft hetzelfde.
UPDATE world SET war_ms = prep_ms + war_ms, prep_ms = 86400000;
