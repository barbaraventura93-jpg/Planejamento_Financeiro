-- Saldo em conta no fim do mês (opcional, por fatura/mês).
-- Usado pelo diagnóstico do consultor pra detectar gasto fora do cartão (Pix, débito, boletos).
alter table faturas add column if not exists bank_balance numeric(12,2);
