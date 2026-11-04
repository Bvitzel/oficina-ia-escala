-- =====================================================================
-- Turnos do Pecorino (dados, não muda a estrutura do banco).
-- Os mesmos nomes e horários estão em src/config/restaurante.ts.
-- Pode rodar mais de uma vez sem problema.
-- =====================================================================

-- Remove os turnos de exemplo (Almoço e Jantar). Isso também apaga as
-- escalas e as regras de exemplo ligadas a eles.
delete from turnos where nome in ('Almoço', 'Jantar');

insert into turnos (nome, hora_inicio, hora_fim, ordem) values
  ('Cozinha Dia',    '08:00', '16:00', 1),
  ('Cozinha Noite',  '15:00', '23:00', 2),
  ('Salão Abertura', '11:00', '21:30', 3),
  ('Salão',          '12:00', '22:30', 4),
  ('Estágio Dia',    '12:00', '17:00', 5),
  ('Estágio Noite',  '17:30', '22:30', 6),
  ('Gerência Dia',   '08:00', '16:00', 7),
  ('Gerência Tarde', '12:00', '23:00', 8)
on conflict (nome) do update
  set hora_inicio = excluded.hora_inicio,
      hora_fim = excluded.hora_fim,
      ordem = excluded.ordem;
