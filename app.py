from flask import Flask, render_template, request, jsonify
from werkzeug.middleware.proxy_fix import ProxyFix
import oracledb
import json
import os
from tecsql_translator import normalize_query_text, translate_tecsql, translate_sql_to_tecsql, update_mappings
from waitress import serve

# Abilita thick mode per versioni Oracle più vecchie
try:
    # Prova prima il path Oracle 11 (più comune)
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

app = Flask(__name__)

# --- Reverse proxy / subpath support ---
class PrefixMiddleware:
    def __init__(self, app, prefix):
        self.app = app
        self.prefix = prefix.rstrip('/')

    def __call__(self, environ, start_response):
        if not self.prefix:
            return self.app(environ, start_response)

        # Respect SCRIPT_NAME set by a proxy (e.g. X-Forwarded-Prefix via ProxyFix).
        if not environ.get('SCRIPT_NAME'):
            environ['SCRIPT_NAME'] = self.prefix
            path_info = environ.get('PATH_INFO', '')
            if path_info.startswith(self.prefix):
                new_path = path_info[len(self.prefix):]
                environ['PATH_INFO'] = new_path if new_path else '/'


        return self.app(environ, start_response)

APP_PREFIX = os.environ.get('APP_PREFIX', '/JCTNT').rstrip('/')
if APP_PREFIX and not APP_PREFIX.startswith('/'):
    APP_PREFIX = f'/{APP_PREFIX}'
if APP_PREFIX == '/':
    APP_PREFIX = ''

app.wsgi_app = PrefixMiddleware(app.wsgi_app, APP_PREFIX)
app.wsgi_app = ProxyFix(
    app.wsgi_app,
    x_for=1,
    x_proto=1,
    x_host=1,
    x_prefix=1
)

# Percorsi file
DATA_FOLDER = 'Data'
CONNECTION_FILE = os.path.join(DATA_FOLDER, 'connection_data.json')
CONNECTION_HISTORY_FILE = os.path.join(DATA_FOLDER, 'connection_history.json')
SEARCH_HISTORY_FILE = os.path.join(DATA_FOLDER, 'search_history.json')

os.makedirs(DATA_FOLDER, exist_ok=True)

# Connection pool (globale, riutilizzabile)
connection_pool = None

# Cache dizionario (evita reload continuo)
dictionary_cache = {
    'data': None,
    'indexes': None,
    'index_columns': None,
    'timestamp': None,
    'connection_key': None
}

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

@app.route('/api/translate-query', methods=['POST'])
def api_translate_query():
    """Bidirectional translation: TecSQL ↔ SQL (auto-detect direction)"""
    data = request.get_json(silent=True) or {}
    query = data.get('query', '')
    chosen_descriptor = data.get('chosen_descriptor')
    strip_params = bool(data.get('strip_params', False))

    normalized = normalize_query_text(query)
    if not normalized:
        return jsonify({'error': 'Query vuota'}), 400

    # Auto-detect direction (TecSQL has $, SQL doesn't)
    is_tecsql = '$' in normalized

    try:
        if is_tecsql:
            # TecSQL → SQL
            sql = translate_tecsql(normalized, strip_params=strip_params)
            return jsonify({
                'direction': 'tecsql_to_sql',
                'normalized_query': normalized,
                'sql': sql
            })
        else:
            # SQL → TecSQL
            result = translate_sql_to_tecsql(normalized, chosen_descriptor)

            if result.get('ambiguous'):
                return jsonify({
                    'direction': 'sql_to_tecsql',
                    'ambiguous': True,
                    'table': result['table'],
                    'candidates': result['candidates'],
                    'fields_used': result['fields_used']
                }), 200

            if not result['success']:
                return jsonify({'error': result['error']}), 400

            return jsonify({
                'direction': 'sql_to_tecsql',
                'normalized_query': normalized,
                'tecsql': result['tecsql'],
                'descriptors_used': result.get('descriptors_used', {}),
                'partial_translation': result.get('partial_translation', False),
                'untranslated_fields': result.get('untranslated_fields', [])
            })

    except Exception as exc:
        return jsonify({'error': str(exc)}), 400

@app.route('/api/connect', methods=['POST'])
def api_connect():
    global connection_pool, dictionary_cache

    data = request.json
    host = data.get('host', '')
    port = data.get('port', '1521')
    sid = data.get('sid', '')
    username = data.get('username', '')
    password = data.get('password', '')

    # Chiave univoca per cache
    connection_key = f"{host}:{port}:{sid}:{username}"

    # Check cache (riutilizza dati se connessione uguale)
    if (dictionary_cache['data'] is not None and
        dictionary_cache['connection_key'] == connection_key):
        print("[INFO] Utilizzo cache dizionario (no query)")
        return jsonify({
            'success': True,
            'message': f'Connessione riuscita (cached). {len(dictionary_cache["data"])} campi.',
            'data': dictionary_cache['data'],
            'indexes': dictionary_cache['indexes'],
            'index_columns': dictionary_cache['index_columns']
        })

    conn = None
    cursor = None

    try:
        dsn = oracledb.makedsn(host, port, sid=sid)

        print(f"[INFO] Connessione a {host}:{port}/{sid}...")

        # Connessione diretta (pool temporaneamente disabilitato)
        conn = oracledb.connect(
            user=username,
            password=password,
            dsn=dsn
        )
        print("[OK] Connessione stabilita")

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
            SELECT table_owner, table_name, index_name, uniqueness, owner AS index_owner
            FROM all_indexes
        """
        cursor.execute(query_indexes)
        
        indexes = []
        for row in cursor:
            indexes.append({
                'TABLE_OWNER': row[0] or '',
                'TABLE_NAME': row[1] or '',
                'INDEX_NAME': row[2] or '',
                'UNIQUENESS': row[3] or '',
                'INDEX_OWNER': row[4] or ''
            })
        
        # Query colonne indici
        query_index_cols = """
            SELECT table_owner, table_name, index_owner, index_name, column_name, column_position
            FROM all_ind_columns
            ORDER BY index_name, column_position
        """
        cursor.execute(query_index_cols)
        
        index_columns = []
        for row in cursor:
            index_columns.append({
                'TABLE_OWNER': row[0] or '',
                'TABLE_NAME': row[1] or '',
                'INDEX_OWNER': row[2] or '',
                'INDEX_NAME': row[3] or '',
                'COLUMN_NAME': row[4] or '',
                'COLUMN_POSITION': row[5] if row[5] is not None else ''
            })
        
        # Salva in cache
        dictionary_cache['data'] = rows
        dictionary_cache['indexes'] = indexes
        dictionary_cache['index_columns'] = index_columns
        dictionary_cache['connection_key'] = connection_key
        from datetime import datetime
        dictionary_cache['timestamp'] = datetime.now()

        print(f"[INFO] Caricati {len(rows)} campi, {len(indexes)} indici")
        print(f"[INFO] Dizionario salvato in cache")

        # Chiudi connessione
        if cursor:
            cursor.close()
        if conn:
            conn.close()
            print("[INFO] Connessione chiusa")

        # Salva connessione corrente e nella history
        conn_data = {'host': host, 'port': port, 'sid': sid, 'username': username, 'password': password}
        write_json(CONNECTION_FILE, conn_data)
        add_connection_to_history(conn_data)

        # Aggiorna mapping TecSql per il traduttore
        update_mappings(rows)

        return jsonify({
            'success': True,
            'message': f'Connessione riuscita. Caricati {len(rows)} campi e {len(indexes)} indici.',
            'data': rows,
            'indexes': indexes,
            'index_columns': index_columns
        })
        
    except oracledb.DatabaseError as e:
        error, = e.args
        # Chiudi connessione anche in caso di errore
        if cursor:
            try:
                cursor.close()
            except:
                pass
        if conn:
            try:
                conn.close()
            except:
                pass
        return jsonify({'success': False, 'message': f'Errore database: {error.message}'})
    except Exception as e:
        # Chiudi connessione anche in caso di errore
        if cursor:
            try:
                cursor.close()
            except:
                pass
        if conn:
            try:
                conn.close()
            except:
                pass
        return jsonify({'success': False, 'message': f'Errore: {str(e)}'})

if __name__ == '__main__':
    print('=' * 60)
    print(' JCTNT Server Starting...')
    print('=' * 60)
    print(' URL: http://localhost:5000')
    print(' URL: http://127.0.0.1:5000')
    print(' Network: http://0.0.0.0:5000')
    print('=' * 60)
    print(' Server is ready! Press CTRL+C to stop.')
    print('=' * 60)
    serve(app, host="0.0.0.0", port=5000)
