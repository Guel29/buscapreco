-- Matches the relevant columns/types from the store's read-only diagnostic:
-- registration status belongs to produtocomplemento, independently per store.
CREATE TABLE produto (id integer PRIMARY KEY, descricaocompleta character varying, id_tipoembalagem integer);
CREATE TABLE produtoautomacao (id_produto integer, codigobarras numeric);
CREATE TABLE produtocomplemento (id_produto integer, id_loja integer, precovenda numeric(12,2), id_situacaocadastro integer);
CREATE TABLE tipoembalagem (id integer PRIMARY KEY, descricao text);
INSERT INTO tipoembalagem VALUES(1,'UN');
INSERT INTO produto VALUES(101,'ARROZ TESTE',1),(102,'FEIJAO TESTE',1),(103,'OUTRA LOJA',1);
INSERT INTO produtoautomacao VALUES(101,'007891000100103'),(102,'7891000200202'),(103,'7891000300301');
INSERT INTO produtocomplemento VALUES(101,1,12.34,3),(101,2,99.00,2),(102,1,5.67,3),(103,1,1.00,2),(103,2,7.89,3);
CREATE USER erp_reader;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO erp_reader;
