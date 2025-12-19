# JCTNT - Jflex Cheap Table Name Translator

Applicazione web per la traduzione bidirezionale dei nomi di tabelle e campi JAS/JFlex tra nomenclatura fisica (database) e logica (applicativa).

---

## Struttura Cartelle

```
JCTNT/
├── app.py                          # Backend Flask
├── templates/
│   └── index.html                  # Frontend SPA
├── Data/
│   ├── connection_data.json        # Ultima connessione (auto)
│   ├── connection_history.json     # Storico connessioni (auto)
│   └── search_history.json         # Storico ricerche (auto)
└── requirements.txt                # Dipendenze Python
```

---

## Requisiti

- Python 3.10+
- Oracle Instant Client (per thick mode)
- Browser moderno (Chrome, Firefox, Edge)

---

## Installazione

### 1. Crea la struttura
```bash
mkdir JCTNT
cd JCTNT
mkdir templates
mkdir Data
```

### 2. Copia i file
- `app.py` → `JCTNT/`
- `index.html` → `JCTNT/templates/`

### 3. Crea requirements.txt
```
Flask==3.0.0
oracledb==2.0.0
```

### 4. Installa dipendenze
```bash
pip install -r requirements.txt
```

### 5. Oracle Instant Client
Assicurati che Oracle Instant Client sia installato e nel PATH di sistema.
Il driver `oracledb` viene utilizzato in **thick mode** per compatibilità con versioni Oracle meno recenti.

---

## Avvio

```bash
cd JCTNT
python app.py
```

Output atteso:
```
 * Running on http://127.0.0.1:5000
 * Debug mode: on
```

Apri il browser su: **http://localhost:5000**

---

## Utilizzo

### Step 1: Connessione
1. Seleziona una connessione salvata dal dropdown **oppure** compila manualmente
2. Clicca **Connetti**
3. Se OK (box verde), clicca **Avanti**

### Step 2: Ricerca
1. Seleziona una ricerca recente **oppure** scrivi il nome tabella (fisico o logico)
2. Opzionale: specifica i campi da cercare (separati da virgola o a capo)
3. Clicca **Traduci**

### Step 3: Risultati
- **Click su cella** → copia il singolo valore
- **Copia tutto** → copia l'intera tabella (formato TSV per Excel)
- Campi non trovati evidenziati in rosso

---

## Funzionalità

| Funzionalità | Descrizione |
|--------------|-------------|
| Traduzione bidirezionale | Accetta nomi fisici o logici |
| Ricerca batch | Più campi contemporaneamente |
| History connessioni | Dropdown con connessioni salvate |
| History ricerche | Dropdown con ricerche recenti |
| Copia singola cella | Click per copiare un valore |
| Copia tutto | Esporta risultati per Excel |
| Case insensitive | Ricerca senza distinzione maiuscole/minuscole |

---

## API Endpoints

| Metodo | Endpoint | Descrizione |
|--------|----------|-------------|
| GET | `/` | Pagina principale |
| GET | `/api/connection-data` | Ultima connessione |
| GET | `/api/connection-history` | Storico connessioni |
| GET | `/api/search-history` | Storico ricerche |
| POST | `/api/connect` | Connetti e carica dizionario |
| POST | `/api/add-search-history` | Aggiungi ricerca a storico |

---

## Troubleshooting

| Problema | Soluzione |
|----------|-----------|
| `python non riconosciuto` | Usa `py app.py` oppure aggiungi Python al PATH |
| `ModuleNotFoundError: flask` | Esegui `pip install flask oracledb` |
| `DPY-3010: thin mode not supported` | Installa Oracle Instant Client |
| `ORA-12514: service not registered` | Usa SID invece di Service Name |
| `ORA-12504: listener needs SERVICE_NAME` | Contatta il DBA per il corretto parametro |

---

## Crediti

**Applicazione:** JCTNT - Jflex Cheap Table Name Translator  
**Versione:** 2.0  
**Data creazione:** 11-12-2025  
**Autore:** Angelo J. Marin  
**Tecnologie:** Python, Flask, Oracle, HTML5, CSS3, JavaScript
