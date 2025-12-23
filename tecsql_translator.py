import re

# --- Dynamic mapping (populated after DB connect) ---
TABLE_MAP = {}
FIELD_MAP = {}
PHYSICAL_TABLE_MAP = {}

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
            if i < length and query[i] == '!':
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
                if i + 1 < length and query[i + 1] == '*':
                    i += 2
                    tokens.append({
                        'type': 'LOGICAL_TABLE_STAR',
                        'text': f'{table}.*',
                        'table': table
                    })
                    continue
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
                tokens.append({'type': 'LOGICAL_NAME', 'text': table, 'name': table})
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

        if ch == '#':
            start = i
            i += 1
            if i < length and query[i].isalpha():
                while i < length and query[i].isalpha():
                    i += 1
                tokens.append({'type': 'OP', 'text': query[start:i]})
                continue
            if i < length and query[i] in '=<>!':
                i += 1
                if i < length and query[i] == '=':
                    i += 1
                tokens.append({'type': 'OP', 'text': query[start:i]})
                continue
            tokens.append({'type': 'OP', 'text': '#'})
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
    PHYSICAL_TABLE_MAP.clear()

    for row in rows:
        logical_table = row.get('TABELLA_LOGICA')
        physical_table = row.get('TABELLA_FISICA')
        logical_field = row.get('CAMPO_LOGICO')
        physical_field = row.get('CAMPO_FISICO')

        table_key = _normalize_table_key(logical_table)
        if not table_key or not physical_table:
            continue

        TABLE_MAP.setdefault(table_key, physical_table)
        PHYSICAL_TABLE_MAP.setdefault(str(physical_table).strip().lower(), table_key)

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


def _pre_scan_tables(tokens):
    context = None
    expecting_table = False
    outer_next = False
    base_table_key = None
    first_table_key = None
    outer_table_keys = set()

    for token in tokens:
        token_type = token['type']
        text = token['text']

        if token_type == 'KEYWORD':
            keyword = text.upper()
            if keyword == 'FROM':
                context = 'FROM'
                expecting_table = True
                outer_next = False
                continue
            if keyword == 'JOIN':
                context = 'JOIN'
                expecting_table = True
                outer_next = False
                continue
            if keyword == 'OUTER' and context in {'FROM', 'JOIN'} and expecting_table:
                outer_next = True
                continue

        if token_type == 'SYMBOL' and text == ',' and context == 'FROM':
            expecting_table = True
            outer_next = False
            continue

        if expecting_table:
            table_key = None
            if token_type == 'LOGICAL_NAME':
                table_key = _normalize_table_key(token['name'])
            elif token_type == 'IDENT':
                logical_guess = _normalize_table_key(text)
                if logical_guess in TABLE_MAP:
                    table_key = logical_guess
                else:
                    table_key = PHYSICAL_TABLE_MAP.get(text.strip().lower())

            if table_key:
                if first_table_key is None:
                    first_table_key = table_key
                if outer_next:
                    outer_table_keys.add(table_key)
                if base_table_key is None and not outer_next:
                    base_table_key = table_key

            expecting_table = False
            outer_next = False

    if base_table_key is None:
        base_table_key = first_table_key

    return base_table_key, outer_table_keys


def _format_physical_field(physical_table, physical_field, is_outer, context):
    if is_outer and context in {'WHERE', 'ON', 'HAVING'}:
        return f'{physical_table}.{physical_field}(+)'
    return f'{physical_table}.{physical_field}'


def translate_tecsql(normalized_query):
    # Parse the query, track clause context, and translate logical names.
    if not normalized_query:
        raise ValueError('Query TecSql vuota')
    if not TABLE_MAP:
        raise ValueError('Dizionario TecSql non caricato. Connetti al database prima di tradurre.')

    tokens = _tokenize(normalized_query)
    base_table_key, outer_table_keys = _pre_scan_tables(tokens)
    output = []
    context = None
    context_stack = []
    expecting_table = False
    expecting_alias = False
    pending_alias = False
    skip_next_ident = False
    as_is_mode = False
    outer_next_table = False
    alias_table_map = {}
    tables = []
    fields = []
    last_table_physical = None
    last_table_logical_key = None
    last_table_mode = None
    last_table_outer = False

    i = 0
    while i < len(tokens):
        token = tokens[i]
        token_type = token['type']
        text = token['text']

        if as_is_mode:
            output.append(token)
            i += 1
            continue

        if token_type == 'KEYWORD' and text.upper() == 'AS':
            next_token = tokens[i + 1] if i + 1 < len(tokens) else None
            if next_token and next_token['type'] == 'KEYWORD' and next_token['text'].upper() == 'IS':
                output.append(token)
                output.append(next_token)
                as_is_mode = True
                i += 2
                continue

        if pending_alias:
            if token_type == 'KEYWORD' and text.upper() == 'AS':
                output.append(token)
                expecting_alias = True
                pending_alias = False
                i += 1
                continue
            if token_type == 'IDENT':
                alias_table_map[text.lower()] = {
                    'logical_key': last_table_logical_key,
                    'physical': last_table_physical,
                    'mode': last_table_mode,
                    'outer': last_table_outer
                }
                output.append(token)
                pending_alias = False
                i += 1
                continue
            pending_alias = False

        if expecting_alias:
            if token_type == 'IDENT':
                alias_table_map[text.lower()] = {
                    'logical_key': last_table_logical_key,
                    'physical': last_table_physical,
                    'mode': last_table_mode,
                    'outer': last_table_outer
                }
                output.append(token)
                expecting_alias = False
                i += 1
                continue
            expecting_alias = False

        if skip_next_ident:
            output.append({'type': token_type, 'text': text})
            skip_next_ident = False
            i += 1
            continue

        if token_type == 'SYMBOL':
            if text == '(':
                context_stack.append(context)
            elif text == ')' and context_stack:
                context = context_stack.pop()
            if text == ',' and context == 'FROM':
                expecting_table = True
                last_table_physical = None
                last_table_logical_key = None
                outer_next_table = False
            output.append({'type': token_type, 'text': text})
            i += 1
            continue

        if token_type == 'KEYWORD':
            keyword = text.upper()
            if keyword == 'FROM':
                context = 'FROM'
                expecting_table = True
                outer_next_table = False
            elif keyword == 'JOIN':
                context = 'JOIN'
                expecting_table = True
                outer_next_table = False
            elif keyword == 'OUTER' and context in {'FROM', 'JOIN'} and expecting_table:
                outer_next_table = True
                i += 1
                continue
            elif keyword == 'ORDER':
                context = 'ORDER'
            elif keyword == 'GROUP':
                context = 'GROUP'
            elif keyword == 'BY' and context in {'ORDER', 'GROUP'}:
                context = f'{context}_BY'
            elif keyword in {'SELECT', 'WHERE', 'ON', 'HAVING'}:
                context = keyword
            elif keyword == 'AS' and context not in {'FROM', 'JOIN'}:
                skip_next_ident = True
            output.append({'type': token_type, 'text': text})
            i += 1
            continue

        if token_type == 'LOGICAL_TABLE':
            is_table_star = (
                i + 2 < len(tokens)
                and tokens[i + 1]['type'] == 'SYMBOL'
                and tokens[i + 1]['text'] == '.'
                and tokens[i + 2]['type'] == 'SYMBOL'
                and tokens[i + 2]['text'] == '*'
            )
            if is_table_star:
                physical_table = _resolve_table(token['table'])
                output.append({'type': 'IDENT', 'text': f'{physical_table}.*'})
                i += 3
                continue

            if expecting_table:
                physical_table = _resolve_table(token['table'])
                last_table_logical_key = _normalize_table_key(token['table'])
                last_table_physical = physical_table
                last_table_mode = 'logical'
                last_table_outer = outer_next_table
                if outer_next_table:
                    outer_table_keys.add(last_table_logical_key)
                tables.append({'logical': token['table'], 'physical': physical_table})
                output.append({'type': 'IDENT', 'text': physical_table})
                expecting_table = False
                pending_alias = True
                outer_next_table = False
            else:
                raise ValueError(f'Tabella logica non attesa: {token["table"]}')
            i += 1
            continue

        if token_type == 'LOGICAL_TABLE_STAR':
            physical_table = _resolve_table(token['table'])
            output.append({'type': 'IDENT', 'text': f'{physical_table}.*'})
            i += 1
            continue

        if token_type == 'LOGICAL_NAME' and expecting_table:
            logical_key = _normalize_table_key(token['name'])
            physical_table = _resolve_table(token['name'])
            last_table_logical_key = logical_key
            last_table_physical = physical_table
            last_table_mode = 'logical'
            last_table_outer = outer_next_table
            if outer_next_table:
                outer_table_keys.add(logical_key)
            tables.append({'logical': token['name'], 'physical': physical_table})
            output.append({'type': 'IDENT', 'text': physical_table})
            expecting_table = False
            pending_alias = True
            outer_next_table = False
            i += 1
            continue

        if token_type == 'LOGICAL_FIELD':
            physical_table = _resolve_table(token['table'])
            physical_field = _resolve_field(token['table'], token['field'])
            is_outer = _normalize_table_key(token['table']) in outer_table_keys
            fields.append({
                'logical_table': token['table'],
                'logical_field': token['field'],
                'physical_table': physical_table,
                'physical_field': physical_field
            })
            output.append({
                'type': 'IDENT',
                'text': _format_physical_field(physical_table, physical_field, is_outer, context)
            })
            i += 1
            continue

        if token_type == 'LOGICAL_NAME':
            if not base_table_key:
                raise ValueError(f'Campo logico non risolvibile: {token["name"]}')
            physical_table = TABLE_MAP.get(base_table_key)
            field_name = token['name'][1:] if token['name'].startswith('$') else token['name']
            physical_field = _resolve_field(base_table_key, field_name)
            is_outer = base_table_key in outer_table_keys
            fields.append({
                'logical_table': base_table_key,
                'logical_field': field_name,
                'physical_table': physical_table,
                'physical_field': physical_field
            })
            output.append({
                'type': 'IDENT',
                'text': _format_physical_field(physical_table, physical_field, is_outer, context)
            })
            i += 1
            continue

        if token_type == 'IDENT' and i + 2 < len(tokens):
            if tokens[i + 1]['type'] == 'SYMBOL' and tokens[i + 1]['text'] == '.':
                right = tokens[i + 2]
                if right['type'] in {'IDENT', 'SYMBOL'}:
                    alias_key = text.lower()
                    if alias_key in alias_table_map:
                        alias_entry = alias_table_map[alias_key]
                        physical_table = alias_entry['physical']
                        is_outer = alias_entry.get('outer', False)
                        if right['type'] == 'SYMBOL' and right['text'] == '*':
                            output.append({'type': 'IDENT', 'text': f'{physical_table}.*'})
                            i += 3
                            continue
                        if alias_entry['mode'] == 'logical':
                            logical_table = alias_entry['logical_key']
                            if not logical_table:
                                raise ValueError(f'Tabella logica non mappata per alias: {text}')
                            physical_field = _resolve_field(logical_table, right['text'])
                            output.append({
                                'type': 'IDENT',
                                'text': _format_physical_field(physical_table, physical_field, is_outer, context)
                            })
                        else:
                            output.append({
                                'type': 'IDENT',
                                'text': _format_physical_field(physical_table, right['text'], is_outer, context)
                            })
                        i += 3
                        continue

                    logical_key = _normalize_table_key(text)
                    if logical_key in TABLE_MAP:
                        physical_table = TABLE_MAP[logical_key]
                        is_outer = logical_key in outer_table_keys
                        if right['type'] == 'SYMBOL' and right['text'] == '*':
                            output.append({'type': 'IDENT', 'text': f'{physical_table}.*'})
                        else:
                            physical_field = _resolve_field(logical_key, right['text'])
                            output.append({
                                'type': 'IDENT',
                                'text': _format_physical_field(physical_table, physical_field, is_outer, context)
                            })
                        i += 3
                        continue

        if token_type == 'IDENT' and expecting_table and context in {'FROM', 'JOIN'}:
            logical_key = _normalize_table_key(text)
            if logical_key in TABLE_MAP:
                physical_table = TABLE_MAP[logical_key]
                last_table_logical_key = logical_key
                last_table_physical = physical_table
                last_table_mode = 'logical'
                last_table_outer = outer_next_table
                if outer_next_table:
                    outer_table_keys.add(logical_key)
                tables.append({'logical': text, 'physical': physical_table})
                output.append({'type': 'IDENT', 'text': physical_table})
                expecting_table = False
                pending_alias = True
            else:
                last_table_physical = text
                last_table_logical_key = PHYSICAL_TABLE_MAP.get(text.strip().lower())
                last_table_mode = 'physical'
                last_table_outer = outer_next_table
                output.append({'type': token_type, 'text': text})
                expecting_table = False
                pending_alias = True
            outer_next_table = False
            i += 1
            continue

        output.append({'type': token_type, 'text': text})
        i += 1

    return _format_tokens(output)
