# 🔧 Gestione Sessioni Oracle con SQL Developer

## 📋 Visualizzare Connessioni Attive

### Metodo 1: Query Semplice (Tutti gli Utenti)

Apri una finestra **SQL Worksheet** in SQL Developer e esegui:

```sql
-- Conta sessioni per utente
SELECT
    username,
    status,
    COUNT(*) as num_sessions
FROM v$session
WHERE username IS NOT NULL
GROUP BY username, status
ORDER BY num_sessions DESC;
```

**Output esempio**:
```
USERNAME          STATUS      NUM_SESSIONS
----------------  ----------  ------------
TEMPLATE280_DB    ACTIVE      2
TEMPLATE280_DB    INACTIVE    48
SYS               ACTIVE      5
SYSTEM            INACTIVE    3
```

---

### Metodo 2: Dettaglio Sessioni TEMPLATE280_DB

```sql
-- Vedi tutte le sessioni per il tuo utente
SELECT
    s.sid,
    s.serial#,
    s.status,
    s.username,
    s.osuser,
    s.machine,
    s.program,
    s.module,
    TO_CHAR(s.logon_time, 'DD-MON-YYYY HH24:MI:SS') as logon_time,
    ROUND(s.last_call_et/60, 2) as idle_minutes,
    p.spid as os_process_id
FROM v$session s
LEFT JOIN v$process p ON s.paddr = p.addr
WHERE s.username = 'TEMPLATE280_DB'
ORDER BY s.last_call_et DESC;
```

**Colonne importanti**:
- **SID**: Session ID (serve per killare)
- **SERIAL#**: Serial number (serve per killare)
- **STATUS**: ACTIVE o INACTIVE
- **IDLE_MINUTES**: Tempo di inattività
- **PROGRAM**: Applicazione che ha aperto la sessione
- **MACHINE**: Computer da cui proviene

---

### Metodo 3: Tool Grafico di SQL Developer

#### Opzione A: DBA Panel (se hai privilegi DBA)

1. **Apri SQL Developer**
2. **Click destro** sulla connessione nel pannello "Connections"
3. Seleziona **"Monitor Sessions"**
4. Vedrai un pannello grafico con:
   - Lista sessioni attive
   - Grafici CPU/memoria
   - Dettagli per ogni sessione

#### Opzione B: Session Browser

1. Nel menu: **View** → **DBA**
2. Espandi il pannello **DBA**
3. Naviga: **Data Pump** → **Sessions**
4. Vedrai lista completa delle sessioni

**Nota**: Servono privilegi DBA per accedere a queste viste.

---

## 🔥 Chiudere Sessioni Manualmente

### ⚠️ ATTENZIONE

Prima di killare sessioni:
- ✅ Assicurati che siano **INACTIVE** (idle)
- ✅ Controlla `IDLE_MINUTES` > 10 (meglio non killare sessioni recenti)
- ⚠️ **NON killare** sessioni ACTIVE (potrebbero eseguire query importanti!)
- ⚠️ **NON killare** sessioni SYS/SYSTEM (critiche per il DB)

---

### Metodo 1: Killa Sessione Singola

```sql
-- Sintassi generale
ALTER SYSTEM KILL SESSION 'sid,serial#' IMMEDIATE;

-- Esempio reale (sostituisci con i tuoi valori)
ALTER SYSTEM KILL SESSION '123,456' IMMEDIATE;
```

**Come ottenere SID e SERIAL#**:
```sql
-- Trova sessioni da killare (esempio: idle > 30 minuti)
SELECT
    sid,
    serial#,
    status,
    ROUND(last_call_et/60, 2) as idle_minutes,
    program
FROM v$session
WHERE username = 'TEMPLATE280_DB'
AND status = 'INACTIVE'
AND last_call_et > 1800  -- Più di 30 minuti
ORDER BY last_call_et DESC;
```

**Output esempio**:
```
SID    SERIAL#   STATUS     IDLE_MINUTES   PROGRAM
---    -------   --------   ------------   ----------
123    456       INACTIVE   45.32          python.exe
124    789       INACTIVE   42.18          python.exe
125    101       INACTIVE   38.55          python.exe
```

**Poi killa**:
```sql
ALTER SYSTEM KILL SESSION '123,456' IMMEDIATE;
ALTER SYSTEM KILL SESSION '124,789' IMMEDIATE;
ALTER SYSTEM KILL SESSION '125,101' IMMEDIATE;
```

---

### Metodo 2: Killa Tutte le Sessioni Idle (Script PL/SQL)

```sql
-- Killa tutte le sessioni INACTIVE del tuo utente (idle > 30 min)
DECLARE
    v_count NUMBER := 0;
BEGIN
    FOR rec IN (
        SELECT sid, serial#, ROUND(last_call_et/60, 2) as idle_min
        FROM v$session
        WHERE username = 'TEMPLATE280_DB'
        AND status = 'INACTIVE'
        AND last_call_et > 1800  -- 30 minuti
    ) LOOP
        BEGIN
            EXECUTE IMMEDIATE 'ALTER SYSTEM KILL SESSION '''
                || rec.sid || ',' || rec.serial# || ''' IMMEDIATE';

            v_count := v_count + 1;

            DBMS_OUTPUT.PUT_LINE(
                'Killed session: SID=' || rec.sid ||
                ', SERIAL=' || rec.serial# ||
                ', Idle=' || rec.idle_min || ' min'
            );
        EXCEPTION
            WHEN OTHERS THEN
                DBMS_OUTPUT.PUT_LINE(
                    'Error killing SID=' || rec.sid || ': ' || SQLERRM
                );
        END;
    END LOOP;

    DBMS_OUTPUT.PUT_LINE('Total sessions killed: ' || v_count);
END;
/
```

**Per vedere l'output**:
1. Prima di eseguire, abilita output:
   ```sql
   SET SERVEROUTPUT ON;
   ```

2. Esegui lo script (F5 in SQL Developer)

3. Vedi risultato nel pannello **Script Output**:
   ```
   Killed session: SID=123, SERIAL=456, Idle=45.32 min
   Killed session: SID=124, SERIAL=789, Idle=42.18 min
   Killed session: SID=125, SERIAL=101, Idle=38.55 min
   Total sessions killed: 3
   ```

---

### Metodo 3: Killa da SQL Developer (GUI)

**Se hai privilegi DBA**:

1. **View** → **DBA**
2. Espandi **Session Management** → **Sessions**
3. **Trova la sessione** da killare nella lista
4. **Click destro** sulla sessione
5. Seleziona **"Kill Session"**
6. Conferma popup

---

## 🔍 Query Utili per Diagnostica

### Query 1: Sessioni Raggruppate per Programma

```sql
SELECT
    program,
    status,
    COUNT(*) as num_sessions,
    ROUND(AVG(last_call_et/60), 2) as avg_idle_minutes
FROM v$session
WHERE username = 'TEMPLATE280_DB'
GROUP BY program, status
ORDER BY num_sessions DESC;
```

**Identifica quale applicazione apre troppe connessioni**:
```
PROGRAM         STATUS     NUM_SESSIONS   AVG_IDLE_MINUTES
--------------  ---------  -------------  ----------------
python.exe      INACTIVE   48             35.42
SQL Developer   ACTIVE     2              0.15
```

---

### Query 2: Sessioni con Query Attive

```sql
SELECT
    s.sid,
    s.serial#,
    s.status,
    s.username,
    s.sql_id,
    q.sql_text,
    s.blocking_session,
    ROUND(s.last_call_et/60, 2) as minutes_running
FROM v$session s
LEFT JOIN v$sql q ON s.sql_id = q.sql_id
WHERE s.username = 'TEMPLATE280_DB'
AND s.status = 'ACTIVE'
ORDER BY s.last_call_et DESC;
```

**Usa per vedere cosa stanno eseguendo le sessioni ACTIVE** (da non killare!).

---

### Query 3: Sessioni Bloccate (Deadlock)

```sql
SELECT
    s1.sid as blocked_sid,
    s1.serial# as blocked_serial,
    s1.username as blocked_user,
    s1.blocking_session,
    s2.sid as blocking_sid,
    s2.serial# as blocking_serial,
    s2.username as blocking_user,
    s2.status as blocking_status
FROM v$session s1
LEFT JOIN v$session s2 ON s1.blocking_session = s2.sid
WHERE s1.blocking_session IS NOT NULL
AND s1.username = 'TEMPLATE280_DB';
```

**Se trovi deadlock**, killa la sessione **blocking** (quella che blocca le altre).

---

### Query 4: Top Sessioni per Memoria Usata

```sql
SELECT
    s.sid,
    s.serial#,
    s.username,
    s.program,
    ROUND(p.pga_used_mem/1024/1024, 2) as pga_mb,
    ROUND(p.pga_alloc_mem/1024/1024, 2) as pga_alloc_mb,
    s.status
FROM v$session s
JOIN v$process p ON s.paddr = p.addr
WHERE s.username = 'TEMPLATE280_DB'
ORDER BY p.pga_used_mem DESC;
```

**Identifica sessioni che usano troppa memoria** (candidate per kill).

---

## 🛡️ Prevenzione Connection Leak

### 1. Configura IDLE_TIME nel Profile Oracle

```sql
-- Come DBA, imposta timeout per sessioni idle
ALTER PROFILE DEFAULT LIMIT IDLE_TIME 30;  -- 30 minuti

-- Verifica profile corrente
SELECT profile FROM dba_users WHERE username = 'TEMPLATE280_DB';

-- Verifica limite IDLE_TIME
SELECT resource_name, limit
FROM dba_profiles
WHERE profile = 'DEFAULT'
AND resource_name = 'IDLE_TIME';
```

**Dopo questo**, Oracle chiuderà automaticamente sessioni idle dopo 30 minuti.

---

### 2. Configura Resource Limits

```sql
-- Limita numero massimo sessioni per utente
ALTER PROFILE DEFAULT LIMIT SESSIONS_PER_USER 10;

-- Limita CPU per chiamata (100 = 1 secondo)
ALTER PROFILE DEFAULT LIMIT CPU_PER_CALL 1000;

-- Verifica tutti i limiti
SELECT * FROM dba_profiles WHERE profile = 'DEFAULT';
```

---

### 3. Monitoring Continuo (Script Schedulato)

Crea un job che killa automaticamente sessioni vecchie:

```sql
-- Crea job (come DBA)
BEGIN
    DBMS_SCHEDULER.CREATE_JOB(
        job_name        => 'KILL_IDLE_SESSIONS',
        job_type        => 'PLSQL_BLOCK',
        job_action      => q'[
            BEGIN
                FOR rec IN (
                    SELECT sid, serial#
                    FROM v$session
                    WHERE username = 'TEMPLATE280_DB'
                    AND status = 'INACTIVE'
                    AND last_call_et > 3600  -- 1 ora
                ) LOOP
                    EXECUTE IMMEDIATE 'ALTER SYSTEM KILL SESSION '''
                        || rec.sid || ',' || rec.serial# || ''' IMMEDIATE';
                END LOOP;
            END;
        ]',
        start_date      => SYSTIMESTAMP,
        repeat_interval => 'FREQ=HOURLY',  -- Ogni ora
        enabled         => TRUE
    );
END;
/

-- Disabilita job
BEGIN
    DBMS_SCHEDULER.DISABLE('KILL_IDLE_SESSIONS');
END;
/

-- Rimuovi job
BEGIN
    DBMS_SCHEDULER.DROP_JOB('KILL_IDLE_SESSIONS');
END;
/
```

---

## 📊 Dashboard Sessioni (Query Completa)

Copia-incolla questa query per un **report completo**:

```sql
-- Dashboard completo sessioni TEMPLATE280_DB
SELECT
    '=== RIEPILOGO ===' as section, NULL, NULL, NULL, NULL FROM dual
UNION ALL
SELECT
    'Totale Sessioni:', TO_CHAR(COUNT(*)), NULL, NULL, NULL
FROM v$session WHERE username = 'TEMPLATE280_DB'
UNION ALL
SELECT
    'Sessioni ACTIVE:', TO_CHAR(COUNT(*)), NULL, NULL, NULL
FROM v$session WHERE username = 'TEMPLATE280_DB' AND status = 'ACTIVE'
UNION ALL
SELECT
    'Sessioni INACTIVE:', TO_CHAR(COUNT(*)), NULL, NULL, NULL
FROM v$session WHERE username = 'TEMPLATE280_DB' AND status = 'INACTIVE'
UNION ALL
SELECT
    'Sessioni Idle > 30min:', TO_CHAR(COUNT(*)), NULL, NULL, NULL
FROM v$session WHERE username = 'TEMPLATE280_DB' AND last_call_et > 1800
UNION ALL
SELECT '=== DETTAGLIO ===' as section, NULL, NULL, NULL, NULL FROM dual
UNION ALL
SELECT
    TO_CHAR(sid) || ',' || TO_CHAR(serial#),
    status,
    TO_CHAR(ROUND(last_call_et/60, 1)) || ' min',
    program,
    machine
FROM v$session
WHERE username = 'TEMPLATE280_DB'
ORDER BY 1;
```

---

## 🎯 Procedura Passo-Passo in SQL Developer

### Step 1: Connetti come Utente o DBA

1. Apri **SQL Developer**
2. Crea connessione:
   - **Name**: `TEMPLATE280_DB`
   - **Username**: `TEMPLATE280_DB`
   - **Password**: `[tua password]`
   - **Hostname**: `oracle-ud-42`
   - **Port**: `1521`
   - **SID**: `ORCL`
3. **Test** → se OK → **Save** → **Connect**

### Step 2: Apri SQL Worksheet

1. Click destro sulla connessione
2. Seleziona **"Open SQL Worksheet"**
3. Si apre editor SQL

### Step 3: Vedi Sessioni

1. Copia-incolla questa query:
   ```sql
   SELECT sid, serial#, status,
          ROUND(last_call_et/60, 2) as idle_min,
          program
   FROM v$session
   WHERE username = 'TEMPLATE280_DB'
   ORDER BY last_call_et DESC;
   ```

2. Premi **F9** (o click **Play** verde)
3. Vedi risultati sotto

### Step 4: Killa Sessioni

1. **Identifica SID e SERIAL#** da killare (idle > 30 min)

2. Copia-incolla (sostituisci valori):
   ```sql
   ALTER SYSTEM KILL SESSION '123,456' IMMEDIATE;
   ```

3. Premi **F9**

4. Se vedi:
   ```
   System altered.
   ```
   → **Successo!** ✅

5. Se vedi:
   ```
   ORA-01031: insufficient privileges
   ```
   → Devi usare utente **DBA** (SYSTEM o SYS)

### Step 5: Verifica

Riesegui query Step 3 → dovresti vedere meno sessioni.

---

## 🚨 Troubleshooting

### Errore: "ORA-00942: table or view does not exist"

**Causa**: Non hai accesso a `v$session`

**Soluzione**:
```sql
-- Come DBA, concedi privilegi
GRANT SELECT ON v_$session TO template280_db;
GRANT SELECT ON v_$process TO template280_db;
```

**Oppure** usa utente DBA (SYSTEM/SYS).

---

### Errore: "ORA-01031: insufficient privileges"

**Causa**: Non puoi eseguire `ALTER SYSTEM KILL SESSION`

**Soluzione**:
```sql
-- Come DBA, concedi privilegio
GRANT ALTER SYSTEM TO template280_db;
```

**Oppure** chiedi al DBA di killare le sessioni.

---

### Sessione "Marked for Kill" ma non muore

**Causa**: Sessione sta aspettando commit/rollback

**Soluzione**:
1. Aspetta alcuni minuti
2. Oppure killa processo OS:
   ```sql
   -- Trova SPID (process ID OS)
   SELECT spid FROM v$process p
   JOIN v$session s ON p.addr = s.paddr
   WHERE s.sid = 123;  -- Sostituisci con tuo SID
   ```

3. Su server Oracle, killa processo:
   ```bash
   # Linux
   kill -9 <spid>

   # Windows
   taskkill /PID <spid> /F
   ```

---

## 📚 Riferimenti Rapidi

### Query Essenziali

| Scopo | Query |
|-------|-------|
| **Conta sessioni** | `SELECT COUNT(*) FROM v$session WHERE username='TEMPLATE280_DB'` |
| **Lista sessioni** | `SELECT sid, serial#, status FROM v$session WHERE username='TEMPLATE280_DB'` |
| **Killa sessione** | `ALTER SYSTEM KILL SESSION 'sid,serial#' IMMEDIATE` |
| **Sessioni idle** | `...WHERE last_call_et > 1800` (> 30 min) |

### Privilegi Necessari

```sql
-- Minimo per vedere sessioni
GRANT SELECT ON v_$session TO template280_db;

-- Per killare sessioni
GRANT ALTER SYSTEM TO template280_db;

-- Oppure usa ruolo DBA
GRANT DBA TO template280_db;  -- (non raccomandato in produzione)
```

---

**Ultima modifica**: 2026-02-12
**Autore**: Claude Code + Kseniia Hrytskova
