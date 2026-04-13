# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**JCTNT** (JFlex Table Name Translator) is a Flask web application for bidirectional translation between physical (database) and logical (application) table/field names in JAS/JFlex Oracle databases.

**Stack**: Python 3.10+, Flask 3.0, Oracle 11g (thick mode), HTML5/CSS3/JavaScript (vanilla SPA)

---

## Quick Start

```bash
# Install dependencies
pip install -r requirements.txt

# Run server (recommended - includes startup checks)
start_server.bat  # Windows
./start_server.sh # Linux/Mac

# Or run directly
python app.py

# Server runs on http://localhost:5000
```

**Important**:
- App requires Oracle Instant Client at `C:\App\Oracle11\clix64\client\bin` (Windows)
- Path configured in `app.py` line 11
- Server uses Waitress (production-ready) - no output on successful start
- Use `start_server.bat/.sh` scripts for better startup feedback

---

## Architecture Overview

### Backend (Flask)

**app.py** (330 lines):
- Flask server with Waitress WSGI
- Oracle connection with **thick mode** (required for Oracle 11g)
- 7 REST endpoints (see API section below)
- Dictionary caching system (global variable)
- JSON file persistence (`Data/` folder)

**tecsql_translator.py** (578 lines):
- Custom tokenizer/parser for TecSQL → SQL translation
- Converts logical names (`$TableName.$FieldName`) to physical (`TABLE_PHYS.FIELD_PHYS`)
- Handles OUTER JOIN Oracle syntax with `(+)` operator
- Dynamic mapping populated from `FW_TABLES` + `FW_TABLE_FIELDS`

### Frontend (SPA)

**templates/index.html** (286 lines):
- Single-page app with 2 main views (Connection, Search)
- Tab system (Ricerca, Translator, Tabella, Indici)
- SVG icon sprite (11 icons inline)

**static/js/app.js** (792 lines):
- Vanilla JavaScript (no frameworks)
- Client-side search/filtering
- Clipboard API for copy functionality
- **fuzzy-search.js** (270 lines): Levenshtein distance algorithm for smart suggestions

**static/css/style.css** (716 lines):
- Responsive grid layout
- Collapsible cards with animations
- Fuzzy search suggestions styling

---

## Key Technical Details

### Oracle Connection (Critical!)

**Thick Mode Required**: App uses `oracledb` in **thick mode** for Oracle 11g compatibility.

```python
# app.py lines 8-17
oracledb.init_oracle_client(lib_dir=r"C:\App\Oracle11\clix64\client\bin")
```

**Fallback behavior**:
1. Try Oracle 11 x64 path (primary)
2. Auto-detect from PATH
3. Fall back to thin mode (prints warning)

**Connection lifecycle**:
- Direct connections (no pool currently)
- Always closed in `try/finally` blocks
- Cache prevents re-loading dictionary (36K+ rows)

### TecSQL Translation

**Input** (logical):
```sql
SELECT $Articolo.Codice, $Articolo.Descrizione
FROM $Articolo
WHERE $Articolo.Prezzo > 100
```

**Output** (physical):
```sql
SELECT MD_ARTI.ARTI_ARTCO, MD_ARTI.ARTI_DESCR
FROM MD_ARTI
WHERE MD_ARTI.ARTI_PREZZO > 100
```

**Key functions**:
- `_tokenize()`: Lexical analysis (strings, params, logical names)
- `_pre_scan_tables()`: Identifies base table and OUTER joins
- `_pre_scan_aliases()`: Pre-pass to collect FROM/JOIN aliases before the main loop (so `CL.Field` in SELECT resolves correctly when alias is defined later in FROM)
- `translate_tecsql()`: Main parser with context tracking (SELECT, FROM, WHERE, etc.)
- `translate_sql_to_tecsql()`: Reverse translation (physical → logical)
- `update_mappings()`: Populates all maps from DB; also stores original casing in `TABLE_ORIGINAL_CASE` / `FIELD_ORIGINAL_CASE`

**Alias handling (TecSQL → SQL)**:
- `AS` keyword in FROM/JOIN is dropped from output (`CENTRI CL` not `CENTRI AS CL`)
- Aliases pre-scanned before main loop, so forward references like `CL.Field` in SELECT work correctly

**Original case (SQL → TecSQL)**:
- Logical names returned with original DB casing (`$CentroDiLavoro`, `Codice` not `$centrodilavoro`, `codice`)
- When prefix is an alias, it is preserved (`CL.Codice` not `$CentroDiLavoro.Codice`)
- Descriptor candidate list in ambiguous response also uses original case

### Fuzzy Search (New Feature)

**static/js/fuzzy-search.js**:
- Levenshtein distance algorithm
- 4-level scoring: Exact (1000) → Starts With (500-900) → Contains (200-500) → Fuzzy (50-100)
- `findBestTableMatches()`: Returns top N suggestions
- `highlightMatch()`: Visual highlighting of matching characters

**Usage**: When exact match fails, shows yellow suggestion card with clickable alternatives.

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | Serve SPA (index.html) |
| GET | `/api/connection-data` | Last saved connection |
| GET | `/api/connection-history` | List of saved connections |
| GET | `/api/search-history` | Recent table searches |
| POST | `/api/connect` | Connect to Oracle + load dictionary (3 queries: FW_TABLES, user_indexes, user_ind_columns) |
| POST | `/api/add-search-history` | Save search to history |
| POST | `/api/translate-query` | Translate TecSQL ↔ SQL (bidirectional) |

**Heavy operation**: `/api/connect` loads ~36K field rows + 2K indexes. First call slow (~5s), subsequent cached (<0.1s).

---

## Data Structures

### Global State (app.py)

```python
dictionary_cache = {
    'data': None,              # 36K+ field records
    'indexes': None,           # Index metadata
    'index_columns': None,     # Index column details
    'timestamp': None,         # Cache creation time
    'connection_key': None     # f"{host}:{port}:{sid}:{username}"
}
```

**Cache invalidation**: Only when connection parameters change.

### Mapping (tecsql_translator.py)

```python
TABLE_MAP           = {}  # $logical_table → physical_table
FIELD_MAP           = {}  # $logical_table → {logical_field → physical_field}
PHYSICAL_TABLE_MAP  = {}  # physical_table → [$descriptor1, $descriptor2, ...]
REVERSE_FIELD_MAP   = {}  # physical_table → {physical_field → {descriptor → logical_field}}
TABLE_ORIGINAL_CASE = {}  # normalized_key → original name with $ (e.g. $CentroDiLavoro)
FIELD_ORIGINAL_CASE = {}  # (normalized_table_key, normalized_field_key) → original field name
```

Populated by `update_mappings(rows)` after DB connection.
`TABLE_ORIGINAL_CASE` and `FIELD_ORIGINAL_CASE` preserve the DB's original casing for use in SQL → TecSQL output.

---

## File Structure (Important Files Only)

```
JCTNT/
├── app.py                    # Flask backend (330 lines)
├── tecsql_translator.py      # TecSQL parser (578 lines)
├── templates/
│   └── index.html            # SPA frontend (286 lines)
├── static/
│   ├── js/
│   │   ├── app.js            # Main app logic (792 lines)
│   │   └── fuzzy-search.js   # Smart search (270 lines)
│   └── css/
│       └── style.css         # Styles (716 lines)
├── Data/                     # Auto-generated JSON files
│   ├── connection_data.json
│   ├── connection_history.json
│   └── search_history.json
├── docs/                     # Extended documentation
│   ├── FUZZY_SEARCH_FEATURE.md
│   ├── CONNECTION_OPTIMIZATION.md
│   ├── TROUBLESHOOTING_ORACLE.md
│   └── SQL_DEVELOPER_SESSIONS.md
└── specs/
    └── tecsql/
        └── TECSQL.md         # TecSQL syntax reference
```

---

## Common Issues

### Oracle Connection Errors

**DPY-6005 / DPY-4011**: Database closes connection
- **Cause**: Wrong Oracle Client path or thin mode incompatible with Oracle 11g
- **Fix**: Verify `C:\App\Oracle11\clix64\client\bin\oci.dll` exists
- **Docs**: `docs/TROUBLESHOOTING_ORACLE.md`

**Slow connections**:
- First load: ~5s (36K rows)
- Cached load: <0.1s
- Check for connection leaks: `netstat -an | grep :1521 | grep ESTABLISHED`

### Development

**No hot reload**: Waitress is production server. For development with auto-reload:
```python
# Temporarily replace in app.py line 243:
# serve(app, host="0.0.0.0", port=5000)
app.run(debug=True, host="0.0.0.0", port=5000)
```

**Unicode errors (Windows)**: Avoid emoji in print() statements (use ASCII)

---

## Testing Oracle Connection

```python
# Quick test (no app)
python -c "
import oracledb
oracledb.init_oracle_client(lib_dir=r'C:\App\Oracle11\clix64\client\bin')
dsn = oracledb.makedsn('oracle-ud-42', '1521', sid='ORCL')
conn = oracledb.connect(user='template280_db', password='template280_db', dsn=dsn)
print('Connected OK')
cursor = conn.cursor()
cursor.execute('SELECT COUNT(*) FROM FW_TABLES')
print(f'Tables: {cursor.fetchone()[0]}')
conn.close()
"
```

---

## Important Notes

1. **Oracle 11g Thick Mode**: Critical requirement. Thin mode will fail.
2. **Case Sensitivity**: TecSQL parser normalizes to lowercase internally
3. **OUTER JOIN Syntax**: Uses Oracle `(+)` notation, not ANSI syntax
4. **Cache Strategy**: Global dictionary cache, cleared only on credential change
5. **No Tests**: Project has no automated tests (manual testing only)
6. **Security**:
   - Passwords stored plaintext in `Data/*.json` (NOT for production!)
   - `Data/` folder is gitignored - never commit these files
   - Use `.gitignore` to prevent accidental commits of credentials

---

## Git Workflow

**Before committing**:
```bash
# Verify Data/ folder is NOT staged (contains passwords!)
git status | grep Data/
# Should return nothing - Data/ is gitignored

# Safe to commit
git add .
git commit -m "Your message"
```

**If Data/ files are tracked**:
```bash
# Remove from git (keeps local files)
git rm --cached -r Data/
git commit -m "Remove sensitive Data/ folder from tracking"
```

---

## Future Improvements (TODOs)

- **Investigate connection slowness** (~5s first load despite caching)
  - Profile query execution times for 3 heavy queries:
    - `FW_TABLES` JOIN `FW_TABLE_FIELDS` (36K rows)
    - `user_indexes` (2K rows)
    - `user_ind_columns` (6K rows)
  - Measure network latency vs query execution time
  - Consider adding `ROWNUM <= 1000` LIMIT during development/testing
  - Evaluate Oracle 11g query plan optimization (use `EXPLAIN PLAN`)
  - Test with smaller dataset to isolate bottleneck
- Connection pooling (currently disabled due to credential handling bug)
- Keyboard navigation for fuzzy suggestions (arrow keys)
- ARIA labels for accessibility
- Unit tests for TecSQL parser
- Environment variables for Oracle path
- Move credentials to `.env` file with encryption
