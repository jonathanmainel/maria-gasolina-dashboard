# Importação da base de unidades

Endpoint protegido para validar e substituir o snapshot atual de unidades de um cliente.

## Contrato JSON

```json
{
  "client_slug": "maria-gasolina",
  "filename": "unidades.xlsx",
  "dry_run": true,
  "rows": [
    {
      "unit_name": "ACQUA GALLERIA",
      "neighborhood": "Fazenda São Quirino",
      "city": "Campinas",
      "state": "SP",
      "postal_code": "13091-702"
    }
  ]
}
```

Mapping esperado do XLSX:

- `Unidade / Condomínio` para `unit_name`
- `Bairro` para `neighborhood`
- `Cidade` para `city`
- `UF` para `state`
- `CEP` para `postal_code`

`dry_run: true` executa a mesma função de validação, normalização,
deduplicação e resolução geográfica usada na gravação. Nenhuma linha de
auditoria ou unidade é gravada.

Linhas com UF ou CEP inválido são reportadas e ignoradas. A importação continua
quando resta pelo menos uma linha válida. Duplicatas exatas pela chave
normalizada são contadas e inseridas uma única vez.

O backend preserva os cinco valores originais. Campos `normalized_*` existem
somente para matching, deduplicação e agrupamento.

## Resposta

Campos principais:

- `summary.total_rows`
- `summary.valid_rows`
- `summary.duplicate_rows`
- `summary.invalid_rows`
- `summary.unresolved_cities`
- `errors[]` com `row`, `code`, `field` e `message`
- `database_write_performed`
- `snapshot_replaced`

Erros esperados incluem `MISSING_REQUIRED_COLUMN`, `INVALID_STATE`,
`INVALID_POSTAL_CODE`, `EMPTY_FILE` e `NO_VALID_ROWS`.

## Fonte geográfica

Arquivo gerado a partir de `kelvins/municipios-brasileiros`, fixado por commit e
checksum em `municipalities.ts`. Nenhuma API de geocodificação é chamada durante
o upload ou a leitura do mapa. Cidade sem correspondência exata pela chave
normalizada `UF + cidade` permanece `unresolved`, sem coordenadas.
