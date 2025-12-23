import re

# --- Dynamic mapping (populated after DB connect) ---
TABLE_MAP = {}
FIELD_MAP = {}

KEYWORDS = {
    'SELECT', 'FROM', 'WHERE', 'JOIN', 'LEFT', 'RIGHT', 'FULL', 'INNER', 'OUTER',
    'CROSS', 'ON', 'ORDER', 'BY', 'GROUP', 'HAVING', 'AS', 'AND', 'OR', 'DISTINCT',
    'IN', 'EXISTS', 'NOT', 'NULL', 'IS', 'LIKE', 'BETWEEN'
}

TWO_CHAR_OPS = {'>=', '<=', '<>', '!=', '==', '||'}


def normalize_query_text(query):
    # Normalize by removing newlines and trimming extra whitespace.
    text = '' if query is None else str(query)
    text = re.sub(r'[\r\n]+', ' ', text)
    text = re.sub(r'\s{2,}', ' ', text)
    return text.strip()


def _tokenize(query):
    tokens = []
    i = 0
    length = len(query)

    while i < length:
        ch = query[i]

        if ch.isspace():
            i += 1
            continue

        if ch == "'":
            start = i
            i += 1
            while i < length:
                if query[i] == "'":
                    if i + 1 < length and query[i + 1] == "'":
                        i += 2
                        continue
                    i += 1
                    break
                i += 1
            tokens.append({'type': 'STRING', 'text': query[start:i]})
            continue

        if ch == '?':
            start = i
            i += 1
            while i < length and (query[i].isalnum() or query[i] == '_'):
                i += 1
            tokens.append({'type': 'PARAM', 'text': query[start:i]})
            continue

        if ch == '$':
            start = i
            i += 1
            while i < length and (query[i].isalnum() or query[i] == '_'):
                i += 1
            table = query[start:i]
            if i < length and query[i] == '.':
                i += 1
                field_start = i
                while i < length and (query[i].isalnum() or query[i] == '_'):
                    i += 1
                field = query[field_start:i]
                tokens.append({
                    'type': 'LOGICAL_FIELD',
                    'text': f'{table}.{field}',
                    'table': table,
                    'field': field
                })
            else:
                tokens.append({'type': 'LOGICAL_TABLE', 'text': table, 'table': table})
            continue

        if ch.isalpha() or ch == '_':
            start = i
            i += 1
            while i < length and (query[i].isalnum() or query[i] == '_'):
                i += 1
            text = query[start:i]
            token_type = 'KEYWORD' if text.upper() in KEYWORDS else 'IDENT'
            tokens.append({'type': token_type, 'text': text})
            continue

        if ch.isdigit():
            start = i
            i += 1
            while i < length and (query[i].isdigit() or query[i] == '.'):
                i += 1
            tokens.append({'type': 'NUMBER', 'text': query[start:i]})
            continue

        if i + 1 < length and query[i:i + 2] in TWO_CHAR_OPS:
            tokens.append({'type': 'OP', 'text': query[i:i + 2]})
            i += 2
            continue

        tokens.append({'type': 'SYMBOL', 'text': ch})
        i += 1

    return tokens


def _normalize_table_key(logical_table):
    text = '' if logical_table is None else str(logical_table).strip()
    if text.startswith('$'):
        text = text[1:]
    text = re.sub(r'\s+', '', text).lower()
    return f'${text}' if text else ''


def _normalize_field_key(logical_field):
    text = '' if logical_field is None else str(logical_field).strip()
    text = re.sub(r'\s+', '', text).lower()
    return text


def update_mappings(rows):
    # Build logical->physical maps from DB dictionary rows.
    TABLE_MAP.clear()
    FIELD_MAP.clear()

    for row in rows:
        logical_table = row.get('TABELLA_LOGICA')
        physical_table = row.get('TABELLA_FISICA')
        logical_field = row.get('CAMPO_LOGICO')
        physical_field = row.get('CAMPO_FISICO')

        table_key = _normalize_table_key(logical_table)
        if not table_key or not physical_table:
            continue

        TABLE_MAP.setdefault(table_key, physical_table)

        field_key = _normalize_field_key(logical_field)
        if field_key and physical_field:
            FIELD_MAP.setdefault(table_key, {})
            FIELD_MAP[table_key].setdefault(field_key, physical_field)


def _resolve_table(logical_table):
    key = _normalize_table_key(logical_table)
    if key not in TABLE_MAP:
        raise ValueError(f'Tabella logica non mappata: {logical_table}')
    return TABLE_MAP[key]


def _resolve_field(logical_table, logical_field):
    table_key = _normalize_table_key(logical_table)
    fields = FIELD_MAP.get(table_key, {})
    field_key = _normalize_field_key(logical_field)
    if field_key not in fields:
        raise ValueError(f'Campo logico non mappato: {logical_table}.{logical_field}')
    return fields[field_key]


def _format_tokens(tokens):
    result = ''
    prev_text = ''

    for token in tokens:
        text = token['text']
        if not result:
            result = text
        elif text in {',', ')', ';'}:
            result += text
        elif text == '.' or prev_text in {'(', '.'}:
            result += text
        else:
            result += f' {text}'
        prev_text = text

    return result


def translate_tecsql(normalized_query):
    # Parse the query, track clause context, and translate logical names.
    if not normalized_query:
        raise ValueError('Query TecSql vuota')
    if not TABLE_MAP:
        raise ValueError('Dizionario TecSql non caricato. Connetti al database prima di tradurre.')

    tokens = _tokenize(normalized_query)
    output = []
    context = None
    expecting_table = False
    tables = []
    fields = []

    for token in tokens:
        token_type = token['type']
        text = token['text']

        if token_type == 'KEYWORD':
            keyword = text.upper()
            if keyword == 'FROM':
                context = 'FROM'
                expecting_table = True
            elif keyword == 'JOIN':
                context = 'JOIN'
                expecting_table = True
            elif keyword == 'ORDER':
                context = 'ORDER'
            elif keyword == 'GROUP':
                context = 'GROUP'
            elif keyword == 'BY' and context in {'ORDER', 'GROUP'}:
                context = f'{context}_BY'
            elif keyword in {'SELECT', 'WHERE', 'ON', 'HAVING'}:
                context = keyword
            output.append({'type': token_type, 'text': text})
            continue

        if token_type == 'SYMBOL' and text == ',' and context == 'FROM':
            expecting_table = True
            output.append({'type': token_type, 'text': text})
            continue

        if token_type == 'LOGICAL_TABLE':
            if expecting_table or context in {'FROM', 'JOIN'}:
                physical_table = _resolve_table(token['table'])
                tables.append({'logical': token['table'], 'physical': physical_table})
                output.append({'type': 'IDENT', 'text': physical_table})
                expecting_table = False
            else:
                raise ValueError(f'Tabella logica non attesa: {token["table"]}')
            continue

        if token_type == 'LOGICAL_FIELD':
            physical_table = _resolve_table(token['table'])
            physical_field = _resolve_field(token['table'], token['field'])
            fields.append({
                'logical_table': token['table'],
                'logical_field': token['field'],
                'physical_table': physical_table,
                'physical_field': physical_field
            })
            output.append({'type': 'IDENT', 'text': f'{physical_table}.{physical_field}'})
            continue

        output.append({'type': token_type, 'text': text})

    return _format_tokens(output)
