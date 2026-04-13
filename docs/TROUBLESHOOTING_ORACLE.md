# 🔧 Troubleshooting Oracle Connection

## Problema: DPY-6005 / DPY-4011 - Connection Closed

### Sintomi
```
Errore database: DPY-6005: cannot connect to database
DPY-4011: the database or network closed the connection
```

### Causa
Il problema era causato da **path Oracle Client sbagliato** in `app.py`.

**Path vecchio (errato)**:
```python
oracledb.init_oracle_client(lib_dir=r"C:\oracle\19c\x64\client\bin")
```

**Path corretto per questo sistema**:
```python
oracledb.init_oracle_client(lib_dir=r"C:\App\Oracle11\clix64\client\bin")
```

### Spiegazione

Oracle `oracledb` funziona in **2 modalità**:

| Modalità | Descrizione | Compatibilità |
|----------|-------------|---------------|
| **Thin Mode** | Python puro, no dipendenze esterne | Oracle 12c+ |
| **Thick Mode** | Usa Oracle Instant Client (C library) | Oracle 9i+ (tutte) |

Quando il path è sbagliato:
1. `init_oracle_client()` fallisce silenziosamente (try/except)
2. App usa automaticamente **Thin Mode**
3. Thin Mode non supporta Oracle 11 → **Connessione fallisce**

### Soluzione

✅ **Aggiornato app.py** con path corretto + fallback automatico:

```python
# Abilita thick mode per versioni Oracle più vecchie
try:
    # Prova prima il path Oracle 11 (più comune su questo sistema)
    oracledb.init_oracle_client(lib_dir=r"C:\App\Oracle11\clix64\client\bin")
    print("[OK] Thick mode attivo (Oracle 11 x64)")
except Exception as e:
    # Fallback: cerca automaticamente nel PATH
    try:
        oracledb.init_oracle_client()
        print("[OK] Thick mode attivo (auto-detected)")
    except:
        print("[WARNING] Thin mode attivo (Oracle Client non trovato)")
        print("          Per Oracle 11 o piu vecchi, installa Oracle Instant Client")
        pass
```

### Come Trovare Oracle Client sul Tuo Sistema

#### Windows
```bash
# Metodo 1: Cerca oci.dll
where oci.dll

# Metodo 2: Controlla PATH
echo %PATH% | findstr /i oracle

# Metodo 3: Registry
reg query "HKLM\SOFTWARE\ORACLE" /s
```

#### Linux/Mac
```bash
# Cerca librerie Oracle
find /usr /opt -name "libclntsh.so*" 2>/dev/null

# Controlla PATH
echo $PATH | tr ':' '\n' | grep -i oracle

# Controlla LD_LIBRARY_PATH
echo $LD_LIBRARY_PATH
```

### Configurazione per Altri Sistemi

Se hai Oracle Client in un path diverso, aggiorna `app.py`:

```python
# Esempi di path comuni:

# Oracle 19c
oracledb.init_oracle_client(lib_dir=r"C:\oracle\instantclient_19_23")

# Oracle 12c
oracledb.init_oracle_client(lib_dir=r"C:\oracle\12c\client\bin")

# Oracle 11g (32-bit)
oracledb.init_oracle_client(lib_dir=r"C:\App\Oracle11\cli32\client\bin")

# Linux
oracledb.init_oracle_client(lib_dir="/opt/oracle/instantclient_21_1")

# Mac
oracledb.init_oracle_client(lib_dir="/usr/local/lib/instantclient")
```

---

## Altri Problemi Comuni

### Problema: Connessione Lenta

**Causa**: Caricamento dizionario grande (1000+ tabelle)

**Soluzione**:
```python
# In app.py, aggiungi LIMIT alla query (per testing)
query_fields = """
    SELECT ... FROM FW_TABLES TAB
    JOIN FW_TABLE_FIELDS FIE ON (FIE.TABLENAME = TAB.TABLENAME)
    WHERE ROWNUM <= 100  -- Solo prime 100 per test
"""
```

### Problema: TNS Listener Error

**Sintomi**:
```
ORA-12514: TNS:listener does not currently know of service
```

**Soluzione**:
- Verifica che Oracle Listener sia attivo:
  ```bash
  lsnrctl status
  ```
- Usa **SID** invece di **SERVICE_NAME**:
  ```python
  dsn = oracledb.makedsn(host, port, sid='ORCL')  # SID
  # invece di:
  dsn = oracledb.makedsn(host, port, service_name='ORCL')  # SERVICE_NAME
  ```

### Problema: ORA-01017 Invalid Username/Password

**Causa**: Credenziali errate o account locked

**Soluzione**:
```sql
-- Verifica stato account (come DBA)
SELECT username, account_status FROM dba_users WHERE username = 'TEMPLATE280_DB';

-- Unlock account
ALTER USER template280_db ACCOUNT UNLOCK;

-- Reset password
ALTER USER template280_db IDENTIFIED BY new_password;
```

---

## Test Rapido Connessione

Usa questo script per testare la connessione:

```python
# test_connection.py
import oracledb

# Inizializza thick mode
oracledb.init_oracle_client(lib_dir=r"C:\App\Oracle11\clix64\client\bin")

# Parametri connessione
host = 'oracle-ud-42'
port = 1521
sid = 'ORCL'
user = 'template280_db'
password = 'template280_db'

# Test
try:
    dsn = oracledb.makedsn(host, port, sid=sid)
    print(f"DSN: {dsn}")

    conn = oracledb.connect(user=user, password=password, dsn=dsn)
    print("✓ Connessione OK!")

    cursor = conn.cursor()
    cursor.execute("SELECT COUNT(*) FROM FW_TABLES")
    count = cursor.fetchone()[0]
    print(f"✓ Trovate {count} tabelle in FW_TABLES")

    cursor.close()
    conn.close()
    print("✓ Test completato con successo!")

except Exception as e:
    print(f"✗ Errore: {e}")
```

---

## Riferimenti

- [python-oracledb Documentation](https://python-oracledb.readthedocs.io/)
- [Troubleshooting DPY-4011](https://python-oracledb.readthedocs.io/en/latest/user_guide/troubleshooting.html#dpy-4011)
- [Thick vs Thin Mode](https://python-oracledb.readthedocs.io/en/latest/user_guide/initialization.html)
- [Oracle Instant Client Downloads](https://www.oracle.com/database/technologies/instant-client/downloads.html)

---

**Ultima modifica**: 2026-02-12
**Autore**: Claude Code + Kseniia Hrytskova
