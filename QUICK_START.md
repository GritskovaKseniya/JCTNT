# 🚀 Quick Start - JCTNT

Guida rapida per avviare il progetto in 5 minuti.

---

## ⚡ Avvio Rapido

### Metodo 1: Script di Avvio (Consigliato)

**Windows**:
```bash
# Doppio click su start_server.bat
# oppure da terminale:
start_server.bat
```

**Linux/Mac**:
```bash
./start_server.sh
```

### Metodo 2: Manuale

```bash
# 1. Posizionati nella cartella del progetto
cd e:\Sviluppo\Development\JCTNT

# 2. Installa le dipendenze
pip install -r requirements.txt

# 3. Avvia l'applicazione
python app.py

# 4. Apri il browser
# http://localhost:5000
```

**Nota**: Con `waitress` il server **non stampa output** quando parte.
Se vedi il prompt senza errori, il server è attivo su http://localhost:5000

---

## 📋 Prerequisiti

| Componente | Versione | Note |
|------------|----------|------|
| Python | 3.10+ | Verifica con `python --version` |
| Oracle Instant Client | 19c+ | Per thick mode Oracle |
| Browser | Moderno | Chrome, Firefox, Edge |

---

## 🔧 Installazione Oracle Client (se necessario)

### Windows
1. Scarica Oracle Instant Client da [oracle.com](https://www.oracle.com/database/technologies/instant-client/downloads.html)
2. Estrai in `C:\oracle\19c\x64\client\`
3. Aggiungi al PATH: `C:\oracle\19c\x64\client\bin`

### Verifica installazione
```bash
# Dovrebbe mostrare la versione
sqlplus -v
```

---

## 🎯 Primo Utilizzo

### Step 1: Connetti al Database
1. Inserisci i parametri di connessione Oracle:
   - **Host**: indirizzo server (es. `192.168.1.100`)
   - **Port**: porta database (default `1521`)
   - **SID**: identificativo database (es. `ORCL`)
   - **Username**: utente database
   - **Password**: password utente

2. Clicca **Connetti**
3. Attendi il caricamento del dizionario (FW_TABLES + FW_TABLE_FIELDS)

### Step 2: Traduci Nomi
1. Inserisci il nome della tabella (fisico o logico)
   - Fisico: `MD_ARTI`
   - Logico: `$Articolo` oppure `Articolo`

2. Opzionale: specifica i campi (uno per riga o separati da virgola)
   ```
   Codice
   Descrizione
   Prezzo
   ```

3. Clicca **Traduci**

### Step 3: Usa i Risultati
- **Click su cella** → copia valore negli appunti
- **Copia tutto** → esporta tabella per Excel (TSV)

---

## 📱 Funzionalità Principali

### Traduzione Tabelle/Campi
- ✅ Bidirezionale: fisico ↔ logico
- ✅ Case insensitive
- ✅ Ricerca batch (più campi contemporaneamente)
- ✅ Evidenzia campi non trovati

### Traduttore TecSQL
- ✅ Converte query TecSQL in SQL standard
- ✅ Risolve nomi logici ($Tabella.$Campo)
- ✅ Gestisce OUTER JOIN con sintassi Oracle (+)
- ✅ Supporta parametri variabili (?Nome)

### History & Preferenze
- ✅ Storico connessioni (dropdown)
- ✅ Storico ricerche (dropdown)
- ✅ Ultimo utilizzo salvato automaticamente

---

## 🔥 Esempi Pratici

### Tradurre una tabella
```
Input:  MD_ARTI
Output: Tabella Logica: Articolo
```

### Tradurre campi specifici
```
Tabella: Articolo
Campi:   Codice, Descrizione, Prezzo

Risultato:
Fisico           | Logico
-----------------|---------
ARTI_ARTCO       | Codice
ARTI_DESCR       | Descrizione
ARTI_PREZZO      | Prezzo
```

### Tradurre Query TecSQL
```tecsql
SELECT $Articolo.Codice, $Articolo.Descrizione
FROM $Articolo
WHERE $Articolo.Prezzo > 100
```

Diventa:
```sql
SELECT MD_ARTI.ARTI_ARTCO, MD_ARTI.ARTI_DESCR
FROM MD_ARTI
WHERE MD_ARTI.ARTI_PREZZO > 100
```

---

## 🌐 API Endpoints

| Endpoint | Metodo | Descrizione |
|----------|--------|-------------|
| `/` | GET | Interfaccia web |
| `/api/connection-data` | GET | Ultima connessione salvata |
| `/api/connection-history` | GET | Storico connessioni |
| `/api/search-history` | GET | Storico ricerche |
| `/api/connect` | POST | Connetti e carica dizionario |
| `/api/translate-query` | POST | Traduci query TecSQL → SQL |
| `/api/add-search-history` | POST | Aggiungi ricerca a storico |

---

## 🐛 Risoluzione Problemi

### Errore: `python non riconosciuto`
```bash
# Usa py invece di python
py app.py

# Oppure aggiungi Python al PATH di sistema
```

### Errore: `ModuleNotFoundError: flask`
```bash
pip install flask oracledb waitress
```

### Errore: `DPY-3010: thin mode not supported`
```bash
# Installa Oracle Instant Client e configura il path in app.py (riga 11)
oracledb.init_oracle_client(lib_dir=r"C:\oracle\19c\x64\client\bin")
```

### Errore: `ORA-12514: TNS:listener does not currently know of service`
```bash
# Usa SID invece di SERVICE_NAME nella connessione
# Oppure chiedi al DBA il parametro corretto
```

### Connessione lenta al DB
```bash
# Il caricamento del dizionario può richiedere tempo
# su database con molte tabelle (>1000 tabelle)
# Attendi il messaggio di conferma prima di procedere
```

---

## 📚 Documentazione Completa

- [README.md](README.md) - Documentazione generale
- [specs/tecsql/TECSQL.md](specs/tecsql/TECSQL.md) - Sintassi TecSQL completa
- [specs/jctnt-doc-completo.md](specs/jctnt-doc-completo.md) - Documentazione tecnica completa

---

## 🔐 Sicurezza

⚠️ **IMPORTANTE**: Le password vengono salvate in chiaro nei file JSON (`Data/connection_data.json`).

**Raccomandazioni**:
- Non committare file `Data/*.json` su repository pubblici
- Usa account database con privilegi minimi (READ-only su FW_TABLES/FW_TABLE_FIELDS)
- Considera l'uso di variabili d'ambiente per credenziali sensibili

---

## 🎨 Personalizzazione

### Cambiare porta server
```python
# Modifica app.py riga 243
serve(app, host="0.0.0.0", port=8080)  # Cambia 5000 con porta desiderata
```

### Cambiare path Oracle Client
```python
# Modifica app.py riga 11
oracledb.init_oracle_client(lib_dir=r"C:\tuo\path\oracle\client\bin")
```

### Personalizzare prefisso URL
```bash
# Imposta variabile d'ambiente
set APP_PREFIX=/myapp
python app.py

# L'app sarà disponibile su http://localhost:5000/myapp
```

---

## ✅ Checklist Pre-Deploy

- [ ] Python 3.10+ installato
- [ ] Oracle Instant Client installato e nel PATH
- [ ] Dipendenze installate (`pip install -r requirements.txt`)
- [ ] Connessione database testata
- [ ] Cartella `Data/` creata (auto-creata al primo avvio)
- [ ] Firewall consente connessione Oracle (porta 1521)

---

## 📞 Supporto

Per problemi o domande:
1. Consulta la sezione [Risoluzione Problemi](#-risoluzione-problemi)
2. Verifica i log dell'applicazione
3. Controlla i parametri di connessione con il DBA

---

**Versione**: 3.0
**Ultima modifica**: 2026-02-12
**Autore**: Kseniia Hrytskova
