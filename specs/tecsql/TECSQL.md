# TecSQL - Linguaggio di Interrogazione Database

**Documentazione Tecnica Completa**

---

## Indice

1. [Introduzione](#1-introduzione)
2. [Sintassi TecSQL](#2-sintassi-tecsql)
   - [2.1 SELECT](#21-select)
   - [2.2 INSERT](#22-insert)
   - [2.3 DELETE](#23-delete)
   - [2.4 UPDATE](#24-update)
   - [2.5 LOCK](#25-lock)
3. [Funzioni](#3-funzioni)
4. [Limitazioni](#4-limitazioni)
   - [4.1 Limitazioni FastDB](#41-limitazioni-fastdb)
   - [4.2 Limitazioni SQLite](#42-limitazioni-sqlite)
5. [Estensioni Speciali](#5-estensioni-speciali)
   - [5.1 Parametri](#51-parametri)
   - [5.2 Operatori Variabili](#52-operatori-variabili)
6. [Esclusione del Parser TecSQL](#6-esclusione-del-parser-tecsql)

---

## 1. Introduzione

Il linguaggio **TecSQL** permette di interrogare e manipolare i dati memorizzati in un database relazionale supportato da **Tecnest**:

- Oracle
- Informix
- SQLite
- FastDB
- MySQL

### Caratteristiche Principali

La sintassi rimane **inalterata** a prescindere dall'effettivo motore DB utilizzato, grazie ad un processo di **parsing** che traduce a runtime le istruzioni TecSQL nel linguaggio compatibile con il database in uso.

TecSQL è fortemente legato ai **Descrittori di Tabella**, in quanto può utilizzare i **nomi logici** delle tabelle e dei campi così come definiti in tali descrittori.

### Utilizzo

TecSQL è utilizzato:
- Internamente nel codice sorgente di **JFlex**
- Da tool utilizzabili dall'utente finale per creare:
  - **Interrogazioni**
  - **Info contestuali**
  - **Report**

---

## 2. Sintassi TecSQL

### Convenzioni Notazionali

| Notazione | Significato |
|-----------|-------------|
| `minuscolo` | Espressioni sintattiche **non terminali** (ulteriormente riducibili) |
| `MAIUSCOLO` | Parole chiave |
| `table_name` | Nome di tabella (fisico o logico se preceduto da `$`) |
| `column_name` | Nome di campo (fisico o logico se preceduto da `$`) |
| `alias` | Abbreviazione utilizzabile al posto di un nome di tabella/campo |
| `string` | Stringa SQL (es. `'stringa di prova'`) |
| `date` | Data in formato `yyyy-MM-dd` |
| `time` | Istante in formato `hh:mm:ss` |
| `timestamp` | Istante in formato `yyyy-MM-dd hh:mm:ss` |
| `number` | Numero intero o decimale (separatore decimale: `.`) |

### Esempi di Nomi

```sql
-- Nomi logici
$Articolo                  -- tabella logica
$Codice                    -- campo logico
$Articolo.Codice           -- campo logico qualificato

-- Nomi fisici
MD_ARTI                    -- tabella fisica
ARTI_ARTCO                 -- campo fisico
MD_ARTI.ARTI_ARTCO         -- campo fisico qualificato

-- Con alias
T1.Codice                  -- se T1 è alias logico, allora Codice è logico
                           -- altrimenti è fisico
```

---

## 2.1 SELECT

### Sintassi Completa

```bnf
select_statement ::=
    select [ UNION [ALL] select ]*

select ::=
    SELECT [ALL | DISTINCT] select_element [, select_element]*
    from_clause
    [where_clause]
    [having_clause]
    [group_by_clause]
    [order_by_clause]
    [limit_clause]
    [FOR UPDATE]

select_element ::=
    expression [AS alias] | table_name.* | *

expression ::=
    expression_element [ operator expression ]*

operator ::=
    + | - | * | / | ||

expression_element ::=
    [ + | - ] (
        column_expression |
        aggregate_expression |
        constant_expression |
        case_statement |
        param |
        ( select_statement )
    )

case_statement ::=
    CASE [ WHEN bool_expression THEN expression ]* [ ELSE expression ] END

column_expression ::=
    [table_name.]column_name

constant_expression ::=
    string | number | date | time | timestamp | ROWNUM | NULL | function

aggregate_expression ::=
    COUNT(*) | aggregate_function ( [ DISTINCT | UNIQUE ] expression )

aggregate_function ::=
    AVG | MAX | MIN | SUM | COUNT

from_clause ::=
    FROM from_reference [, [OUTER] from_reference] | from_reference

from_reference ::=
    table_name [ ( id_security_num ) ] [alias] |
    from_reference join from_reference ON ( bool_expression [, bool_expression]* )

join ::=
    LEFT JOIN | LEFT OUTER JOIN | RIGHT JOIN | RIGHT OUTER JOIN

where_clause ::=
    WHERE bool_expression [ [AND | OR] [ANY | SOME | ALL] bool_expression ]*

bool_expression ::=
    [ NOT ] comp_condition | condition_subquery

comp_condition ::=
    expression comp_operator expression |
    expression [ NOT ] BETWEEN expression AND expression |
    column_expression IS [ NOT ] NULL |
    expression [ NOT ] LIKE string

comp_operator ::=
    > | >= | = | <> | != | < | <= | # | #> | #>= | #= | #< | #<= | #BETWEEN

condition_subquery ::=
    expression [ NOT ] IN ( select | expression [, expression]* ) |
    EXISTS ( select )

having_clause ::=
    HAVING bool_expression

group_by_clause ::=
    GROUP BY expression [, expression]*

order_by_clause ::=
    ORDER BY expression [ASC | DESC] [, expression [ASC | DESC] ]*

limit_clause ::=
    LIMIT expression
```

### Esempi SELECT

```sql
-- Selezione semplice
SELECT $Articolo.Codice, $Articolo.Descrizione
FROM $Articolo
WHERE $Articolo.Prezzo > 100

-- Con JOIN
SELECT $Ordine.Numero, $Articolo.Codice
FROM $Ordine
LEFT JOIN $Articolo ON $Ordine.CodiceArticolo = $Articolo.Codice

-- Con aggregazione
SELECT $Articolo.Categoria, COUNT(*), AVG($Articolo.Prezzo)
FROM $Articolo
GROUP BY $Articolo.Categoria
HAVING COUNT(*) > 10

-- Con CASE
SELECT $Articolo.Codice,
       CASE
           WHEN $Articolo.Prezzo < 50 THEN 'Economico'
           WHEN $Articolo.Prezzo < 200 THEN 'Medio'
           ELSE 'Costoso'
       END AS Fascia
FROM $Articolo

-- Con subquery
SELECT $Articolo.Codice
FROM $Articolo
WHERE $Articolo.Categoria IN (
    SELECT $Categoria.Codice
    FROM $Categoria
    WHERE $Categoria.Attiva = 'S'
)
```

---

## 2.2 INSERT

### Sintassi

```bnf
insert_statement ::=
    INSERT INTO table_name [ ( column_name [, column_name]* ) ] values

values ::=
    expression [, expression]* | ( select )
```

### Esempi INSERT

```sql
-- Inserimento con valori espliciti
INSERT INTO $Articolo (Codice, Descrizione, Prezzo)
VALUES ('ART001', 'Articolo di prova', 150.50)

-- Inserimento da SELECT
INSERT INTO $ArticoloArchivio (Codice, Descrizione)
SELECT $Articolo.Codice, $Articolo.Descrizione
FROM $Articolo
WHERE $Articolo.DataCreazione < '2020-01-01'
```

---

## 2.3 DELETE

### Sintassi

```bnf
delete_statement ::=
    DELETE FROM table_name [ where_clause ]
```

### Esempi DELETE

```sql
-- Cancellazione con condizione
DELETE FROM $Articolo
WHERE $Articolo.Obsoleto = 'S'

-- Cancellazione con subquery
DELETE FROM $Ordine
WHERE $Ordine.CodiceCliente IN (
    SELECT $Cliente.Codice
    FROM $Cliente
    WHERE $Cliente.Attivo = 'N'
)
```

---

## 2.4 UPDATE

### Sintassi

```bnf
update_statement ::=
    UPDATE table_name SET set_element [, set_element ]* [ where_clause ]

set_element ::=
    column_name = expression
```

### Esempi UPDATE

```sql
-- Aggiornamento semplice
UPDATE $Articolo
SET Prezzo = Prezzo * 1.10
WHERE $Articolo.Categoria = 'ELETTRONICA'

-- Aggiornamento multiplo
UPDATE $Articolo
SET Prezzo = 99.99,
    Descrizione = 'SCONTATO - ' || Descrizione
WHERE $Articolo.DataCreazione < '2020-01-01'
```

---

## 2.5 LOCK

### Sintassi

```bnf
lock_statement ::=
    LOCK TABLE table_name IN EXCLUSIVE MODE |
    LOCK TABLE table_name IN SHARE MODE
```

### Esempi LOCK

```sql
-- Lock esclusivo
LOCK TABLE $Articolo IN EXCLUSIVE MODE

-- Lock condiviso
LOCK TABLE $Ordine IN SHARE MODE
```

---

## 3. Funzioni

### Funzioni Stringa

#### TRIM
```sql
TRIM(p1 [, p2])
```
Elimina i caratteri blank in testa ed in coda al valore stringa.

- **p1**: stringa da trimmare
- **p2**: carattere da eliminare (default: blank)
- **return**: stringa trimmata

**Esempio**:
```sql
SELECT TRIM($Articolo.Descrizione) FROM $Articolo
```

#### RTRIM
```sql
RTRIM(p1 [, p2])
```
Elimina i caratteri blank in coda al valore stringa.

#### LTRIM
```sql
LTRIM(p1 [, p2])
```
Elimina i caratteri blank in testa al valore stringa.

#### LPAD
```sql
LPAD(p1, p2 [, p3])
```
Riempie la testa della stringa con un carattere di riempimento.

- **p1**: stringa da riempire
- **p2**: lunghezza desiderata
- **p3**: carattere di riempimento (default: blank)

**Esempio**:
```sql
SELECT LPAD($Articolo.Codice, 10, '0') FROM $Articolo
-- 'ART1' diventa '000000ART1'
```

#### RPAD
```sql
RPAD(p1, p2 [, p3])
```
Riempie la coda della stringa con un carattere di riempimento.

#### UPPER
```sql
UPPER(p1)
```
Converte in maiuscolo.

**Esempio**:
```sql
SELECT UPPER($Articolo.Descrizione) FROM $Articolo
```

#### LOWER
```sql
LOWER(p1)
```
Converte in minuscolo.

#### SUBSTR
```sql
SUBSTR(p1, p2, p3)
```
Restituisce una sottostringa.

- **p1**: stringa sorgente
- **p2**: posizione iniziale (da 1)
- **p3**: numero di caratteri

**Esempio**:
```sql
SELECT SUBSTR($Articolo.Codice, 1, 3) FROM $Articolo
-- 'ARTXYZ' diventa 'ART'
```

#### REPLACE
```sql
REPLACE(p1, p2, p3)
```
Sostituisce tutte le occorrenze di p2 in p1 con p3.

**Esempio**:
```sql
SELECT REPLACE($Articolo.Descrizione, 'vecchio', 'nuovo') FROM $Articolo
```

#### LENGTH
```sql
LENGTH(p1)
```
Restituisce la lunghezza della stringa.

---

### Funzioni Data/Ora

#### TODAY
```sql
TODAY()
```
Restituisce la data/ora corrente.

**Esempio**:
```sql
SELECT * FROM $Ordine WHERE $Ordine.Data = TODAY()
```

#### DATE
```sql
DATE(p1)
```
Converte una stringa in formato GG/MM/AAAA in un valore data.

**Esempio**:
```sql
SELECT DATE('31/12/2025') FROM DUAL
```

#### YEAR
```sql
YEAR(p1)
```
Restituisce l'anno della data (es. 2025).

#### MONTH
```sql
MONTH(p1)
```
Restituisce il mese (1-12).

#### DAY
```sql
DAY(p1)
```
Restituisce il giorno del mese (1-31).

#### WEEK
```sql
WEEK(p1)
```
Restituisce la settimana dell'anno (1-53).

#### ISOWEEK
```sql
ISOWEEK(p1)
```
Restituisce la settimana ISO (1-53).

#### ISOYEAR
```sql
ISOYEAR(p1)
```
Restituisce l'anno ISO.

#### TIME
```sql
TIME(p1)
```
Restituisce l'ora in formato HH:MM:SS.

#### SET_TIME
```sql
SET_TIME(p1, p2)
```
Assegna ore e minuti (da stringa p2) alla data p1.

⚠️ **ATTENZIONE**:
- Granularità: MINUTO
- Implementato solo per **ORACLE**

**Esempio**:
```sql
SELECT SET_TIME($Ordine.Data, '14:30:00') FROM $Ordine
```

---

### Funzioni Contesto JFlex

#### OLANG
```sql
OLANG()
```
Restituisce la lingua ufficiale del gruppo.

#### LANG
```sql
LANG()
```
Restituisce la lingua "text" selezionata in fase di login in JFlex.

#### DLANG
```sql
DLANG()
```
Restituisce la lingua "data" selezionata in fase di login in JFlex.

#### USERNAME
```sql
USERNAME()
```
Restituisce il nome dell'utente che ha effettuato il login.

#### GROUPNAME
```sql
GROUPNAME()
```
Restituisce il gruppo dell'utente.

#### COMPANY
```sql
COMPANY()
```
Restituisce il codice dell'azienda corrente.

#### PLANT
```sql
PLANT()
```
Restituisce il codice dello stabilimento corrente.

#### BPTYPE
```sql
BPTYPE()
```
Restituisce il tipo del Business Partner (utente web).

⚠️ In ambiente desktop restituisce sempre `'UNDEFINED'`.

#### BPCODE
```sql
BPCODE()
```
Restituisce il codice del Business Partner (utente web).

⚠️ In ambiente desktop restituisce sempre `'UNDEFINED'`.

---

### Funzioni Matematiche

#### POW
```sql
POW(p1, p2)
```
Calcola p1 elevato a p2.

**Esempio**:
```sql
SELECT POW($Articolo.Prezzo, 2) FROM $Articolo
```

#### MOD
```sql
MOD(p1, p2)
```
Restituisce il resto della divisione intera.

#### ABS
```sql
ABS(p1)
```
Valore assoluto.

#### SQRT
```sql
SQRT(p1)
```
Radice quadrata.

#### ROUND
```sql
ROUND(p1 [, p2])
```
Arrotonda p1 in base alla precisione p2.

**Esempio**:
```sql
SELECT ROUND(123.4545, 2) FROM DUAL  -- 123.45
SELECT ROUND(123.45, -2) FROM DUAL   -- 100
```

#### TRUNC
```sql
TRUNC(p1)
```
Restituisce la parte intera.

#### LOGN
```sql
LOGN(p1)
```
Logaritmo naturale (base e).

#### LOG10
```sql
LOG10(p1)
```
Logaritmo in base 10.

#### COS, SIN, TAN
```sql
COS(p1)
SIN(p1)
TAN(p1)
```
Funzioni trigonometriche.

---

### Funzioni Utilità

#### NVL
```sql
NVL(p1, p2)
```
Sostituisce NULL con p2.

**Esempio**:
```sql
SELECT NVL($Articolo.Sconto, 0) FROM $Articolo
```

#### NANVL
```sql
NANVL(p1, p2)
```
Sostituisce NaN con p2.

#### PROPERTY
```sql
PROPERTY(p1)
```
Restituisce il valore della proprietà p1.

La ricerca viene eseguita in sequenza:
1. Proprietà definite dal layer applicativo
2. `properties.cfg`
3. Variabili d'ambiente

**Esempio**:
```sql
SELECT PROPERTY('app.version') FROM DUAL
```

#### TO_NUMBER
```sql
TO_NUMBER(p1)
```
Converte stringa in numero.

#### TO_NUMBER_SEP
```sql
TO_NUMBER_SEP(p1, sep)
```
**[SOLO ORACLE]** Converte stringa in numero specificando il separatore decimale.

**Esempio**:
```sql
SELECT TO_NUMBER_SEP('123,45', ',') FROM DUAL  -- 123.45
```

#### TO_CHAR
```sql
TO_CHAR(p1)
```
Converte p1 in stringa.

---

## 4. Limitazioni

### 4.1 Limitazioni FastDB

Il database **FastDB** ha grosse limitazioni rispetto ai comandi SQL standard.

**Non supportati in FastDB**:
- ❌ Sub-select
- ❌ UNION
- ❌ GROUP BY, HAVING, FOR UPDATE
- ❌ JOIN
- ❌ DISTINCT
- ❌ `table_name.*`
- ❌ Alias di tabella e campo
- ❌ Funzioni di aggregazione (AVG, COUNT, SUM, MAX, MIN)
- ❌ SELECT in INSERT
- ❌ Funzioni: ABS, COS, DATE, LENGTH, LOG, LOGN, LOWER, MOD, POW, ROUND, SIN, SQRT, TODAY, TAN, TRIM, TRUNC, UPPER, YEAR, WEEK, DAY, MONTH
- ❌ Parametri e operatori variabili
- ❌ CASE WHEN

---

### 4.2 Limitazioni SQLite

Sebbene **SQLite** supporti quasi completamente SQL standard, esistono alcune limitazioni.

**Non supportati in SQLite**:
- ❌ RIGHT JOIN
- ❌ FOR UPDATE
- ❌ Sub-select in espressioni
- ❌ Funzione PAD (LPAD/RPAD)

⚠️ **ATTENZIONE**: La funzione `WEEK` ha una diversa implementazione in SQLite rispetto ad Oracle. Il risultato può essere diverso.

---

## 5. Estensioni Speciali

La sintassi TecSQL è stata estesa per supportare funzionalità speciali fruibili in contesti particolari:
- Interrogazioni (query)
- Info contestuali
- Report (Jasper)

---

### 5.1 Parametri

I **parametri** sono elementi il cui valore viene assegnato a runtime.

#### Sintassi

```bnf
<expression> <operator> <parameter> | <parameter> <operator> <expression>

<parameter> ::= ?<name> | ?!<name>
```

| Prefisso | Significato |
|----------|-------------|
| `?` | Parametro opzionale |
| `?!` | Parametro obbligatorio |

#### Comportamento

- Il sistema recupera informazioni dal **Descrittore** del campo per configurare la finestra di dialogo
- I parametri **non valorizzati** vengono **esclusi** dalla query assieme all'espressione a cui sono legati
- Per le **Info contestuali**, il valore viene recuperato automaticamente dal contesto chiamante

#### Esempi

```sql
-- Parametro opzionale
SELECT * FROM $Articolo
WHERE $Articolo.Codice = ?CodArticolo

-- Parametro obbligatorio
SELECT * FROM $Ordine
WHERE $Ordine.Numero = ?!NumeroOrdine

-- Range di date
SELECT * FROM $Ordine
WHERE $Ordine.Data BETWEEN ?DataDa AND ?DataA

-- Parametro con operatore variabile
SELECT * FROM $Articolo
WHERE $Articolo.Prezzo # ?Prezzo
```

---

### 5.2 Operatori Variabili

Utilizzando la speciale notazione di **operatore variabile** è possibile costruire query in cui l'operatore viene scelto a runtime dall'utente.

L'operatore variabile viene identificato dal carattere `#` (cancelletto).

#### Sintassi

```sql
$Campo # ?Parametro
```

#### Operatori con Default

| Notazione | Default | Descrizione |
|-----------|---------|-------------|
| `#` | `=` | Uguale |
| `#=` | `=` | Uguale |
| `#>` | `>` | Maggiore |
| `#>=` | `>=` | Maggiore o uguale |
| `#<=` | `<=` | Minore o uguale |
| `#<` | `<` | Minore |
| `#!=` | `!=` | Diverso |
| `#BETWEEN` | `[]` | Da/A (range) |

#### Esempi

```sql
-- L'utente potrà scegliere l'operatore (default: =)
SELECT * FROM $Articolo
WHERE $Articolo.Prezzo # ?Prezzo

-- L'utente potrà scegliere l'operatore (default: >=)
SELECT * FROM $Ordine
WHERE $Ordine.Data #>= ?Data

-- L'utente potrà scegliere tra range, >, <, =, ecc.
SELECT * FROM $Articolo
WHERE $Articolo.Quantita #BETWEEN ?Quantita
```

---

## 6. Esclusione del Parser TecSQL

È possibile inviare al database istruzioni **non supportate** dalla sintassi TecSQL facendole precedere dal prefisso `AS IS`.

Questo disattiva il controllo sintattico del parser TecSQL.

### Sintassi

```sql
AS IS <istruzione_sql_nativa>
```

### Esempio

```sql
-- Comando Oracle nativo
AS IS ALTER SESSION SET NLS_SORT = 'BINARY'

-- Viene eseguito esattamente come:
ALTER SESSION SET NLS_SORT = 'BINARY'
```

### Casi d'Uso

- Comandi DDL (CREATE, ALTER, DROP)
- Comandi amministrativi specifici del database
- Sintassi proprietarie non mappabili in TecSQL
- Ottimizzazioni specifiche del vendor

⚠️ **ATTENZIONE**: Usare con cautela. Il comando viene passato **direttamente** al database senza validazione o traduzione.

---

## Appendice: Esempi Completi

### Query con Parametri e Operatori Variabili

```sql
SELECT
    $Articolo.Codice,
    $Articolo.Descrizione,
    $Articolo.Prezzo,
    $Articolo.Quantita
FROM $Articolo
WHERE
    $Articolo.Categoria = ?Categoria
    AND $Articolo.Prezzo #>= ?Prezzo
    AND $Articolo.Quantita #BETWEEN ?Quantita
    AND $Articolo.DataCreazione BETWEEN ?DataDa AND ?DataA
ORDER BY $Articolo.Prezzo DESC
```

### Query con JOIN e Funzioni

```sql
SELECT
    $Ordine.Numero,
    $Cliente.RagioneSociale,
    $Articolo.Descrizione,
    UPPER($Articolo.Categoria) AS Categoria,
    ROUND($Ordine.Importo, 2) AS ImportoArrotondato,
    YEAR($Ordine.Data) AS Anno
FROM $Ordine
LEFT JOIN $Cliente ON $Ordine.CodiceCliente = $Cliente.Codice
LEFT JOIN OUTER $Articolo ON $Ordine.CodiceArticolo = $Articolo.Codice
WHERE
    $Ordine.Data >= DATE('01/01/2025')
    AND NVL($Ordine.Evaso, 'N') = 'N'
    AND USERNAME() = $Ordine.UtenteInserimento
ORDER BY $Ordine.Data DESC
LIMIT 100
```

### Query con Aggregazione

```sql
SELECT
    $Articolo.Categoria,
    COUNT(*) AS NumeroArticoli,
    AVG($Articolo.Prezzo) AS PrezzoMedio,
    MIN($Articolo.Prezzo) AS PrezzoMinimo,
    MAX($Articolo.Prezzo) AS PrezzoMassimo,
    SUM($Articolo.Quantita) AS QuantitaTotale
FROM $Articolo
WHERE $Articolo.Attivo = 'S'
GROUP BY $Articolo.Categoria
HAVING COUNT(*) > 10
ORDER BY PrezzoMedio DESC
```

### Query con CASE

```sql
SELECT
    $Articolo.Codice,
    $Articolo.Descrizione,
    $Articolo.Quantita,
    CASE
        WHEN $Articolo.Quantita = 0 THEN 'ESAURITO'
        WHEN $Articolo.Quantita < 10 THEN 'SCORTA BASSA'
        WHEN $Articolo.Quantita < 50 THEN 'DISPONIBILE'
        ELSE 'ALTA DISPONIBILITÀ'
    END AS StatoDisponibilita,
    CASE
        WHEN $Articolo.Prezzo < 50 THEN 'ECONOMICO'
        WHEN $Articolo.Prezzo < 200 THEN 'MEDIO'
        ELSE 'PREMIUM'
    END AS FasciaPrezzo
FROM $Articolo
ORDER BY $Articolo.Quantita
```

---

**Fine Documentazione TecSQL**

*Versione*: 2.0
*Data*: 2026-02-12
*Autore*: Documentazione generata da JCTNT Project
