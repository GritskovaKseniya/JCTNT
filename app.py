from flask import Flask, render_template, request, jsonify
import oracledb
import json
import os
from waitress import serve

# Abilita thick mode per versioni Oracle più vecchie
try:
    oracledb.init_oracle_client(lib_dir=r"C:\oracle\19c\x64\client\bin")
except:
    pass

app = Flask(__name__)

# Percorsi file
DATA_FOLDER = 'Data'
CONNECTION_FILE = os.path.join(DATA_FOLDER, 'connection_data.json')
CONNECTION_HISTORY_FILE = os.path.join(DATA_FOLDER, 'connection_history.json')
SEARCH_HISTORY_FILE = os.path.join(DATA_FOLDER, 'search_history.json')

os.makedirs(DATA_FOLDER, exist_ok=True)

# --- Utility JSON ---
def read_json(filepath, default):
    if os.path.exists(filepath):
        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                return json.load(f)
        except:
            return default
    return default

def write_json(filepath, data):
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=4)

# --- Connection History ---
def get_connection_history():
    return read_json(CONNECTION_HISTORY_FILE, [])

def add_connection_to_history(conn_data):
    history = get_connection_history()
    # Controlla duplicati per username
    existing = next((c for c in history if c['username'] == conn_data['username']), None)
    if existing:
        # Aggiorna i dati esistenti
        existing.update(conn_data)
    else:
        history.append(conn_data)
    # Ordina per username
    history.sort(key=lambda x: x['username'].lower())
    write_json(CONNECTION_HISTORY_FILE, history)

# --- Search History ---
def get_search_history():
    return read_json(SEARCH_HISTORY_FILE, [])

def add_search_to_history(table_fisico, table_logico):
    history = get_search_history()
    entry = {'fisico': table_fisico, 'logico': table_logico}
    # Controlla duplicati
    if entry not in history:
        history.append(entry)
        # Ordina per nome fisico
        history.sort(key=lambda x: x['fisico'].lower())
        write_json(SEARCH_HISTORY_FILE, history)

# --- API Endpoints ---
@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/connection-data', methods=['GET'])
def api_get_connection():
    return jsonify(read_json(CONNECTION_FILE, {}))

@app.route('/api/connection-history', methods=['GET'])
def api_get_connection_history():
    return jsonify(get_connection_history())

@app.route('/api/search-history', methods=['GET'])
def api_get_search_history():
    return jsonify(get_search_history())

@app.route('/api/add-search-history', methods=['POST'])
def api_add_search_history():
    data = request.json
    add_search_to_history(data.get('fisico', ''), data.get('logico', ''))
    return jsonify({'success': True})

@app.route('/api/connect', methods=['POST'])
def api_connect():
    data = request.json
    host = data.get('host', '')
    port = data.get('port', '1521')
    sid = data.get('sid', '')
    username = data.get('username', '')
    password = data.get('password', '')
    
    try:
        dsn = oracledb.makedsn(host, port, sid=sid)
        conn = oracledb.connect(user=username, password=password, dsn=dsn)
        cursor = conn.cursor()
        
        # Query dizionario campi
        query_fields = """
            SELECT 
                TAB.TABLEDBNAME    AS TABELLA_FISICA, 
                FIE.DBFIELDNAME    AS CAMPO_FISICO,
                TAB.TABLENAME      AS TABELLA_LOGICA,
                FIE.TABLEFIELDNAME AS CAMPO_LOGICO,
                FIE.TYPE           AS TIPO, 
                FIE.WIDTH          AS AMPIEZZA, 
                FIE.DECIMALS       AS DECIMALI
            FROM FW_TABLES TAB
            JOIN FW_TABLE_FIELDS FIE ON (FIE.TABLENAME = TAB.TABLENAME)
        """
        cursor.execute(query_fields)
        
        rows = []
        for row in cursor:
            rows.append({
                'TABELLA_FISICA': row[0] or '',
                'CAMPO_FISICO': row[1] or '',
                'TABELLA_LOGICA': row[2] or '',
                'CAMPO_LOGICO': row[3] or '',
                'TIPO': row[4] or '',
                'AMPIEZZA': row[5] if row[5] is not None else '',
                'DECIMALI': row[6] if row[6] is not None else ''
            })
        
        # Query indici
        query_indexes = """
            SELECT table_name, index_name, uniqueness
            FROM user_indexes
        """
        cursor.execute(query_indexes)
        
        indexes = []
        for row in cursor:
            indexes.append({
                'TABLE_NAME': row[0] or '',
                'INDEX_NAME': row[1] or '',
                'UNIQUENESS': row[2] or ''
            })
        
        # Query colonne indici
        query_index_cols = """
            SELECT table_name, index_name, column_name, column_position
            FROM user_ind_columns
            ORDER BY index_name, column_position
        """
        cursor.execute(query_index_cols)
        
        index_columns = []
        for row in cursor:
            index_columns.append({
                'TABLE_NAME': row[0] or '',
                'INDEX_NAME': row[1] or '',
                'COLUMN_NAME': row[2] or '',
                'COLUMN_POSITION': row[3] if row[3] is not None else ''
            })
        
        cursor.close()
        conn.close()
        
        # Salva connessione corrente e nella history
        conn_data = {'host': host, 'port': port, 'sid': sid, 'username': username, 'password': password}
        write_json(CONNECTION_FILE, conn_data)
        add_connection_to_history(conn_data)
        
        return jsonify({
            'success': True,
            'message': f'Connessione riuscita. Caricati {len(rows)} campi e {len(indexes)} indici.',
            'data': rows,
            'indexes': indexes,
            'index_columns': index_columns
        })
        
    except oracledb.DatabaseError as e:
        error, = e.args
        return jsonify({'success': False, 'message': f'Errore database: {error.message}'})
    except Exception as e:
        return jsonify({'success': False, 'message': f'Errore: {str(e)}'})

if __name__ == '__main__':
    serve(app, host="0.0.0.0", port=5000)