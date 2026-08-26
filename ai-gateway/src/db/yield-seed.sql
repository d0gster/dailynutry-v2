-- DailyNutry — Yield factors (peso_cozido / peso_cru).
-- Source: USDA Table of Nutrient Retention Factors + empirical literature values.
-- All marked source='padrao'. Users can override via the API (source='usuario').

INSERT INTO yield_factor (name, category, factor, method, source, notes)
VALUES
  ('frango peito',      'protein', 0.65, 'cozido', 'padrao', 'perde ~35% de peso'),
  ('frango coxa',       'protein', 0.68, 'cozido', 'padrao', NULL),
  ('carne bovina patinho', 'protein', 0.70, 'cozido', 'padrao', NULL),
  ('carne bovina alcatra', 'protein', 0.70, 'cozido', 'padrao', NULL),
  ('carne moída',       'protein', 0.65, 'cozido', 'padrao', NULL),
  ('peixe filé',        'protein', 0.80, 'cozido', 'padrao', NULL),
  ('ovo cozido',        'protein', 0.87, 'cozido', 'padrao', NULL),
  ('arroz branco',      'carb',    2.50, 'cozido', 'padrao', 'absorve água, ganha peso'),
  ('arroz integral',    'carb',    2.40, 'cozido', 'padrao', 'absorve água, ganha peso'),
  ('feijão carioca',    'legume',  2.30, 'cozido', 'padrao', NULL),
  ('feijão preto',      'legume',  2.30, 'cozido', 'padrao', NULL),
  ('macarrão',          'carb',    2.20, 'cozido', 'padrao', NULL),
  ('batata doce',       'carb',    0.85, 'cozido', 'padrao', NULL),
  ('batata inglesa',    'carb',    0.90, 'cozido', 'padrao', NULL),
  ('brócolis',          'legume',  0.85, 'cozido', 'padrao', NULL),
  ('cenoura',           'legume',  0.88, 'cozido', 'padrao', NULL),
  ('abobrinha',         'legume',  0.82, 'cozido', 'padrao', NULL)
ON CONFLICT (name) DO NOTHING;
