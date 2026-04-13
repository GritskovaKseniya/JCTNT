# JCTNT - JFlex Table Name Translator

Applicazione web per la traduzione bidirezionale dei nomi di tabelle e campi JAS/JFlex tra nomenclatura fisica (database) e logica (applicativa).

**Versione**: 2.0 — Aprile 2026

---

# PARTE 1: Architettura e Installazione

## 1.1 Stack Tecnologico

| Componente | Tecnologia |
|------------|------------|
| Backend | Flask 3.0 (Python 3.10+), Waitress WSGI |
| Database | Oracle 11g (oracledb driver, thick mode obbligatorio) |
| Frontend | HTML5 + CSS3 + JavaScript vanilla (SPA) |
| Storage locale | File JSON in `Data/` |

## 1.2 Struttura Cartelle

```
JCTNT/
├── app.py                          # Backend Flask + API REST (~330 righe)
├── tecsql_translator.py            # Parser TecSQL ↔ SQL (~600 righe)
├── templates/
│   └── index.html                  # Markup HTML SPA (~286 righe)
├── static/
│   ├── css/
│   │   └── style.css               # Stili (~716 righe)
│   └── js/
│       ├── app.js                  # Logica applicativa (~792 righe)
│       └── fuzzy-search.js         # Ricerca fuzzy Levenshtein (~270 righe)
├── Data/                           # Auto-generati, NON committare
│   ├── connection_data.json
│   ├── connection_history.json
│   └── search_history.json
├── docs/                           # Documentazione funzionalità
│   ├── FUZZY_SEARCH_FEATURE.md
│   ├── CONNECTION_OPTIMIZATION.md
│   ├── SQL_DEVELOPER_SESSIONS.md
│   └── TROUBLESHOOTING_ORACLE.md
├── specs/                          # Specifiche e reference
│   ├── jctnt-doc-completo.md       # Questo file
│   └── tecsql/
│       ├── TECSQL.md               # Sintassi TecSQL completa
│       └── tecsql.txt              # Reference raw
├── start_server.bat                # Avvio Windows
├── start_server.sh                 # Avvio Linux/Mac
└── requirements.txt
```

## 1.3 Endpoint API

| Metodo | Endpoint | Descrizione |
|--------|----------|-------------|
| GET | `/` | Serve index.html |
| GET | `/api/connection-data` | Ultima connessione salvata |
| GET | `/api/connection-history` | Lista connessioni salvate |
| GET | `/api/search-history` | Lista ricerche recenti |
| POST | `/api/connect` | Connette al DB e carica dizionario (operazione pesante) |
| POST | `/api/add-search-history` | Aggiunge ricerca alla history |
| POST | `/api/translate-query` | Traduce TecSQL → SQL o SQL → TecSQL |

### POST /api/connect

Carica il dizionario completo dal DB Oracle con 3 query:

```sql
-- Dizionario campi (~36.000 record)
SELECT TAB.TABLEDBNAME AS TABELLA_FISICA,
       FIE.DBFIELDNAME AS CAMPO_FISICO,
       TAB.TABLENAME   AS TABELLA_LOGICA,
       FIE.TABLEFIELDNAME AS CAMPO_LOGICO,
       FIE.TYPE AS TIPO, FIE.WIDTH AS AMPIEZZA, FIE.DECIMALS AS DECIMALI
FROM FW_TABLES TAB
JOIN FW_TABLE_FIELDS FIE ON (FIE.TABLENAME = TAB.TABLENAME)

-- Indici (~2.000 record)
SELECT table_name, index_name, uniqueness FROM user_indexes

-- Colonne indici (~6.000 record)
SELECT table_name, index_name, column_name, column_position
FROM user_ind_columns ORDER BY index_name, column_position
```

Prima chiamata: ~5s. Chiamate successive: <0.1s (cache globale).

### POST /api/translate-query

**Request**:
```json
{
  "query": "SELECT $Articolo.Codice FROM $Articolo",
  "direction": "tecsql_to_sql",
  "chosen_descriptor": null
}
```

**Direction**: `"tecsql_to_sql"` oppure `"sql_to_tecsql"`.

**Response (successo)**:
```json
{
  "success": true,
  "result": "SELECT MD_ARTI.ARTI_ARTCO FROM MD_ARTI"
}
```

**Response (ambiguità — più descrittori possibili)**:
```json
{
  "success": false,
  "ambiguous": true,
  "table": "CENTRI",
  "candidates": ["$CentroDiLavoro", "$CentroDiLavoroPianificato"],
  "fields_used": ["CODICE", "DESCR"]
}
```

## 1.4 Cache del Dizionario (app.py)

```python
dictionary_cache = {
    'data': None,            # 36K+ record campi
    'indexes': None,         # Metadati indici
    'index_columns': None,   # Dettaglio colonne indici
    'timestamp': None,
    'connection_key': None   # "host:port:sid:username"
}
```

La cache viene invalidata solo se cambiano le credenziali di connessione.

## 1.5 Requisiti

- Python 3.10+
- Oracle Instant Client a `C:\App\Oracle11\clix64\client\bin` (Windows)
- Browser moderno (Chrome, Firefox, Edge)

## 1.6 Installazione e Avvio

```bash
pip install -r requirements.txt

# Avvio raccomandato (include controlli startup)
start_server.bat    # Windows
./start_server.sh   # Linux/Mac

# Oppure diretto
python app.py
```

Server su: **http://localhost:5000** (Waitress, non Flask dev server)

---

# PARTE 2: Traduttore TecSQL ↔ SQL

## 2.1 Panoramica

Il traduttore (`tecsql_translator.py`) converte query in entrambe le direzioni:

| Direzione | Input | Output |
|-----------|-------|--------|
| TecSQL → SQL | `SELECT $Articolo.Codice FROM $Articolo` | `SELECT MD_ARTI.ARTI_ARTCO FROM MD_ARTI` |
| SQL → TecSQL | `SELECT MD_ARTI.ARTI_ARTCO FROM MD_ARTI` | `SELECT $Articolo.Codice FROM MD_ARTI` |

## 2.2 Sintassi TecSQL Supportata

### Nomi logici

```sql
-- Tabella logica con $
FROM $CentroDiLavoro

-- Campo qualificato logico
SELECT $Articolo.Codice, $Articolo.Descrizione

-- Alias sulla tabella logica (AS opzionale)
FROM $CentroDiLavoro CL
FROM $CentroDiLavoro AS CL   -- equivalente, AS viene rimosso nell'output

-- Riferimento a campo tramite alias
SELECT CL.Codice, CL.Descrizione
FROM $CentroDiLavoro CL
```

### Parametri

```sql
WHERE CL.CodAzienda = ?Azienda      -- parametro normale
WHERE CL.CodAzienda = ?!Azienda     -- parametro con !
```

### OUTER JOIN (sintassi Oracle con (+))

```sql
FROM $Base, OUTER $TabellaOpzionale
WHERE $Base.Id = $TabellaOpzionale.IdBase(+)
```

### LIMIT

```sql
-- TecSQL
SELECT ... LIMIT 10

-- Tradotto in Oracle
SELECT ... FETCH FIRST 10 ROWS ONLY
```

### UNION / INTERSECT / MINUS

Ogni ramo viene tradotto indipendentemente e poi ricongiunti.

### Subquery

```sql
SELECT * FROM $Articolo
WHERE $Articolo.Codice IN (SELECT $Ordine.CodArticolo FROM $Ordine)
```

## 2.3 Mappe di Traduzione (tecsql_translator.py)

```python
TABLE_MAP          = {}  # $nomelogico → TABELLA_FISICA
FIELD_MAP          = {}  # $nomelogico → {campo_logico: CAMPO_FISICO}
PHYSICAL_TABLE_MAP = {}  # tabella_fisica → [$descrittore1, $descrittore2, ...]
REVERSE_FIELD_MAP  = {}  # tabella_fisica → {campo_fisico → {descrittore: campo_logico}}
TABLE_ORIGINAL_CASE = {} # $chiave_norm → $NomeOriginale (con case DB)
FIELD_ORIGINAL_CASE = {} # ($chiave_norm, campo_norm) → NomeCampoOriginale
```

Le mappe `TABLE_ORIGINAL_CASE` e `FIELD_ORIGINAL_CASE` preservano il case originale
dei nomi logici così come definiti nel DB (es. `$CentroDiLavoro`, `Codice`).

## 2.4 Gestione Ambiguità (più descrittori per tabella fisica)

Una tabella fisica può avere più descrittori logici (es. `CENTRI` → `$CentroDiLavoro`,
`$CentroDiLavoroPianificato`). In questo caso la traduzione SQL → TecSQL non può essere
automatica e viene chiesto all'utente di scegliere.

**Flusso**:
1. Backend risponde con `"ambiguous": true` e la lista `"candidates"` (nomi con case originale)
2. Il frontend mostra una card gialla con i candidati
3. L'utente seleziona il descrittore
4. Il frontend reinvia la richiesta con `"chosen_descriptor"` valorizzato
5. Il backend normalizza il nome ricevuto e completa la traduzione

## 2.5 Comportamento dell'Alias nella Traduzione

### TecSQL → SQL

L'alias viene preservato nei riferimenti ai campi:

```sql
-- Input
SELECT CL.Codice AS Centro FROM $CentroDiLavoro AS CL

-- Output
SELECT CL.CODICE Centro FROM CENTRI CL
-- (AS rimosso nel FROM; AS rimosso anche per column alias)
```

Il parser esegue una pre-scansione dei token (FROM/JOIN) prima del loop principale,
così gli alias definiti dopo SELECT sono già noti quando si incontra `CL.Codice`.

### SQL → TecSQL

Gli alias vengono preservati nei riferimenti ai campi (non sostituiti con il nome del descrittore):

```sql
-- Input
SELECT CL.CODICE Centro FROM CENTRI CL ORDER BY CL.CODICE

-- Output
SELECT CL.Codice Centro FROM $CentroDiLavoro CL ORDER BY CL.Codice
-- (alias CL mantenuto; case originale ripristinato)
```

## 2.6 Pipeline TecSQL → SQL

```
Input TecSQL
    │
    ▼
_tokenize()          Tokenizzazione: STRING, PARAM, LOGICAL_FIELD, LOGICAL_NAME,
                     IDENT, KEYWORD, NUMBER, OP, SYMBOL
    │
    ▼
_pre_scan_tables()   Pre-pass: individua tabella base e tabelle OUTER
_pre_scan_aliases()  Pre-pass: raccoglie alias FROM/JOIN prima del loop
    │
    ▼
_translate_tecsql_single()   Loop principale token per token con tracking
                              del contesto (SELECT/FROM/WHERE/ORDER_BY...)
    │
    ▼
_format_tokens()     Ricostruzione stringa SQL con spaziatura corretta
```

## 2.7 Pipeline SQL → TecSQL

```
Input SQL
    │
    ▼
_split_sql_at_top_level_unions()   Separa UNION/INTERSECT/MINUS
    │
    ▼
_translate_subqueries_in_sql()     Traduce subquery inside-out
    │
    ▼
_extract_fields_from_sql()         Estrae tabelle, alias, campi (sqlparse + regex)
    │
    ▼
_find_matching_descriptors()       Trova descrittore con copertura massima
    │
    ▼
translate_sql_to_tecsql()          Step 1: TABLE.FIELD → $Desc.LogicField
                                   Step 2: TABLE → $Descriptor
                                   Step 3: campi non qualificati
```

---

# PARTE 3: Ricerca Fuzzy

Quando una tabella cercata non viene trovata esattamente, l'algoritmo Levenshtein
(`static/js/fuzzy-search.js`) propone suggerimenti con scoring a 4 livelli:

| Livello | Condizione | Score |
|---------|-----------|-------|
| Exact | Corrispondenza identica | 1000 |
| Starts With | Comincia con il termine | 500–900 |
| Contains | Contiene il termine | 200–500 |
| Fuzzy | Distanza Levenshtein bassa | 50–100 |

La card gialla con i suggerimenti appare solo se la ricerca esatta fallisce.
Cliccando su un suggerimento si esegue automaticamente la ricerca con quel nome.

---

# PARTE 4: Guida all'Utilizzo

## 4.1 Flusso Principale

```
CONNESSIONE  →  RICERCA/TRADUZIONE  →  RISULTATI
```

## 4.2 Connessione al Database

1. Compila Host, Porta, SID, Username, Password (oppure seleziona da "Connessioni salvate")
2. Clicca **Connetti**
3. Prima connessione: ~5s (caricamento 36K+ record). Connessioni successive: <0.1s (cache)
4. Box verde = connessione riuscita → clicca **Avanti**

## 4.3 Ricerca Tabella (tab Ricerca)

- **Nome Tabella** (obbligatorio): nome fisico (`MD_ARTI`) o logico (`Articoli`)
- **Campi** (opzionale): lascia vuoto per tutti, oppure elenca separati da virgola/spazio
- Se la tabella non esiste: suggerimenti fuzzy in card gialla
- Clicca su un suggerimento per eseguire la ricerca direttamente

## 4.4 Traduzione Query (tab Translator)

**TecSQL → SQL**:
1. Incolla la query TecSQL nel box superiore
2. Clicca **Translate**
3. Se ci sono più descrittori per una tabella: scegli dalla card di disambiguazione
4. Il risultato SQL appare nel box inferiore

**SQL → TecSQL**:
1. Incolla la query SQL nel box superiore
2. Seleziona direzione **SQL → TecSQL**
3. Clicca **Translate**
4. Se la tabella ha più descrittori: scegli dalla card

## 4.5 Risultati Tabella (tab Tabella)

- Elenco campi con: nome fisico, nome logico, tipo, ampiezza, decimali
- Campi non trovati: evidenziati in rosso con "NOT FOUND"
- Clicca su qualsiasi cella per copiarla negli appunti
- **Copia tutto**: formato TSV incollabile in Excel

## 4.6 Indici (tab Indici)

- Lista indici con nome e tipo (UNIQUE/NON-UNIQUE)
- Clicca sul triangolino per espandere e vedere le colonne dell'indice
- **Copia tutto**: formato leggibile con tutte le colonne

## 4.7 Funzioni di Supporto

- **Storico ricerche**: dropdown "Ricerche recenti" con ultime N tabelle cercate
- **Storico connessioni**: dropdown con connessioni precedenti (password inclusa — solo locale)
- **Nuova Connessione**: torna alla schermata di connessione senza perdere la cache

---

# PARTE 5: Note Tecniche e Sicurezza

## 5.1 Connessione Oracle

Oracle 11g richiede **thick mode** obbligatoriamente (il thin mode fallisce):

```python
# app.py
oracledb.init_oracle_client(lib_dir=r"C:\App\Oracle11\clix64\client\bin")
```

Fallback automatico:
1. Path Oracle 11 x64 (primario)
2. Auto-detect da PATH
3. Thin mode (con warning — incompatibile con Oracle 11g)

## 5.2 Sicurezza

- Le password vengono salvate in chiaro in `Data/*.json` — **solo per uso locale**
- La cartella `Data/` è in `.gitignore` — verificare sempre prima di committare
- Non esporre il server su reti non trusted

## 5.3 Sviluppo con Hot Reload

Waitress non supporta hot reload. Per sviluppo:

```python
# app.py — sostituire temporaneamente l'ultima riga
app.run(debug=True, host="0.0.0.0", port=5000)
```

## 5.4 Problemi Noti

| Problema | Causa | Soluzione |
|----------|-------|-----------|
| DPY-6005 / DPY-4011 | Path Oracle Client errato o thin mode | Verificare `C:\App\Oracle11\clix64\client\bin\oci.dll` |
| Prima connessione lenta (~5s) | Caricamento 36K righe | Atteso — successivi <0.1s |
| Unicode error su Windows | Emoji in print() | Usare solo ASCII nei print |

Documentazione dettagliata problemi Oracle: `docs/TROUBLESHOOTING_ORACLE.md`
