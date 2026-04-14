/* ===========================================
   JTNT - Jflex Table Name Translator
   Main Application Script
   =========================================== */

// --- State ---
let dictionary = [];
let indexes = [];
let indexColumns = [];
let connectionHistory = [];
let searchHistory = [];
let currentTablePhysical = '';
let currentTableLogical = '';
let currentIndexes = [];
let currentIndexColumns = [];
let hasSearchResults = false;
let isTranslating = false;

// --- DOM Elements ---
const $ = id => document.getElementById(id);
const pageConnection = $('page-connection');
const pageTranslate = $('page-translate');
const btnConnect = $('btn-connect');
const btnNext = $('btn-next');
const btnNextContainer = $('btn-next-container');
const btnTranslate = $('btn-translate');
const btnBack = $('btn-back');
const btnCopyFields = $('btn-copy-fields');
const btnCopyIndexes = $('btn-copy-indexes');
const connStatus = $('conn-status');
const resultsCard = $('results-card');
const searchCard = $('search-card');
const resultsBody = $('results-body');
const indexesBody = $('indexes-body');
const connHistorySelect = $('conn-history-select');
const searchHistorySelect = $('search-history-select');
const currentTableName = $('current-table-name');
const inputTecsql = $('input-tecsql');
const outputSql = $('output-sql');
const translateStatus = $('translate-status');
const btnTranslateQuery = $('btn-translate-query');
const translateBtnDefault = btnTranslateQuery ? btnTranslateQuery.innerHTML : '';

const BASE = window.location.pathname.replace(/\/$/, '');
console.log(BASE);

// --- Normalization ---
function normalizeTableName(value) {
    return (value || '').replace(/\s+/g, '').trim().toUpperCase();
}

function splitOwnerAndName(value) {
    const normalized = normalizeTableName(value);
    if (!normalized) return { owner: '', name: '' };

    const lastDot = normalized.lastIndexOf('.');
    if (lastDot === -1) {
        return { owner: '', name: normalized };
    }

    return {
        owner: normalized.slice(0, lastDot),
        name: normalized.slice(lastDot + 1)
    };
}

function matchesTableEntry(entry, tableValue) {
    const tableParts = splitOwnerAndName(tableValue);
    if (!tableParts.name) return false;

    const entryName = normalizeTableName(entry.TABLE_NAME);
    if (!entryName || entryName !== tableParts.name) return false;

    const entryOwner = normalizeTableName(entry.TABLE_OWNER || '');
    if (tableParts.owner && entryOwner) {
        return entryOwner === tableParts.owner;
    }

    return true;
}

function getIndexKey(entry) {
    const name = normalizeTableName(entry.INDEX_NAME);
    const owner = normalizeTableName(entry.INDEX_OWNER || '');
    return owner ? `${owner}.${name}` : name;
}

function pickIndexOwner(indexesForTable, columnsForTable) {
    const ownerStats = new Map();

    indexesForTable.forEach((row) => {
        const owner = normalizeTableName(row.TABLE_OWNER || '');
        if (!ownerStats.has(owner)) {
            ownerStats.set(owner, { indexes: 0, columns: 0 });
        }
        ownerStats.get(owner).indexes += 1;
    });

    columnsForTable.forEach((row) => {
        const owner = normalizeTableName(row.TABLE_OWNER || '');
        if (!ownerStats.has(owner)) {
            ownerStats.set(owner, { indexes: 0, columns: 0 });
        }
        ownerStats.get(owner).columns += 1;
    });

    if (ownerStats.size <= 1) {
        return ownerStats.size === 1 ? Array.from(ownerStats.keys())[0] : '';
    }

    const ranked = Array.from(ownerStats.entries()).sort((a, b) => {
        if (b[1].indexes !== a[1].indexes) return b[1].indexes - a[1].indexes;
        if (b[1].columns !== a[1].columns) return b[1].columns - a[1].columns;
        return a[0].localeCompare(b[0]);
    });

    return ranked[0][0];
}

function dedupeIndexes(list) {
    const seen = new Set();
    return list.filter((row) => {
        const table = normalizeTableName(row.TABLE_NAME);
        const key = `${table}|${getIndexKey(row)}|${row.UNIQUENESS || ''}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

function dedupeIndexColumns(list) {
    const seen = new Set();
    return list.filter((row) => {
        const table = normalizeTableName(row.TABLE_NAME);
        const column = normalizeTableName(row.COLUMN_NAME);
        const key = `${table}|${getIndexKey(row)}|${column}|${row.COLUMN_POSITION || ''}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}


// --- Card Toggle ---
function toggleCard(cardId) {
    const card = $(cardId);
    if (card.classList.contains('disabled')) return;
    
    const isExpanding = !card.classList.contains('expanded');
    card.classList.toggle('expanded');
    
    // Se apro ricerca, chiudo risultati
    if (cardId === 'search-card' && isExpanding && hasSearchResults) {
        resultsCard.classList.remove('expanded');
    }
    
    // Se apro risultati, chiudo ricerca
    if (cardId === 'results-card' && isExpanding) {
        searchCard.classList.remove('expanded');
    }
}

function setResultsEnabled(enabled) {
    hasSearchResults = enabled;
    if (enabled) {
        resultsCard.classList.remove('disabled');
    } else {
        resultsCard.classList.add('disabled');
        resultsCard.classList.remove('expanded');
    }
}

// --- Tab Management ---
function initTabs() {
    document.querySelectorAll('.tabs').forEach(container => {
        const tabs = Array.from(container.querySelectorAll('.tab'));
        if (tabs.length === 0) return;

        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                tabs.forEach(t => t.classList.remove('active'));
                tabs.forEach(t => {
                    const contentId = t.dataset.tab;
                    const content = $(contentId);
                    if (content) content.classList.remove('active');
                });

                tab.classList.add('active');
                const activeContent = $(tab.dataset.tab);
                if (activeContent) activeContent.classList.add('active');

                // Persist active main tab so auto-reconnect can restore it
                const mainTabs = ['tab-ricerca', 'tab-translator'];
                if (mainTabs.includes(tab.dataset.tab)) {
                    saveSession(tab.dataset.tab);
                }
            });
        });
    });
}

function setActiveTab(containerId, tabId) {
    const container = $(containerId);
    if (!container) return;
    const tabs = Array.from(container.querySelectorAll('.tab'));
    tabs.forEach(t => t.classList.remove('active'));
    tabs.forEach(t => {
        const contentId = t.dataset.tab;
        const content = $(contentId);
        if (content) content.classList.remove('active');
    });

    const activeTab = tabs.find(t => t.dataset.tab === tabId);
    if (activeTab) {
        activeTab.classList.add('active');
        const activeContent = $(tabId);
        if (activeContent) activeContent.classList.add('active');
    }
}

// --- Clipboard ---
function copyCell(td) {
    const text = td.textContent.trim();
    navigator.clipboard.writeText(text).then(() => {
        td.classList.add('copied');
        setTimeout(() => td.classList.remove('copied'), 1000);
    });
}

// --- Translator UI ---
function setTranslateStatus(type, message) {
    if (!translateStatus) return;
    translateStatus.className = `status-box ${type}`;
    translateStatus.textContent = message;
}

function clearTranslateStatus() {
    if (!translateStatus) return;
    translateStatus.className = 'status-box info hidden';
    translateStatus.textContent = '';
}

function setTranslateLoading(loading) {
    isTranslating = loading;
    if (!btnTranslateQuery) return;
    btnTranslateQuery.disabled = loading;
    btnTranslateQuery.innerHTML = loading
        ? '<span class="loader"></span> Translating...'
        : translateBtnDefault;
}

function updateTranslateButtonState() {
    if (!btnTranslateQuery || isTranslating) return;
    const hasInput = inputTecsql && inputTecsql.value.trim().length > 0;
    btnTranslateQuery.disabled = !hasInput;
}

// --- API Calls ---
async function loadConnectionHistory() {
    try {
        const res = await fetch(`${BASE}/api/connection-history`);
        connectionHistory = await res.json();
        connHistorySelect.innerHTML = '<option value="">-- Inserimento manuale --</option>';
        connectionHistory.forEach((c, i) => {
            connHistorySelect.innerHTML += `<option value="${i}">${c.username} @ ${c.host}</option>`;
        });
    } catch (e) { console.log('No connection history'); }
}

async function loadSearchHistory() {
    try {
        const res = await fetch(`${BASE}/api/search-history`);
        searchHistory = await res.json();
        searchHistorySelect.innerHTML = '<option value="">-- Seleziona o scrivi manualmente --</option>';
        searchHistory.forEach((s, i) => {
            searchHistorySelect.innerHTML += `<option value="${i}">${s.fisico} - ${s.logico}</option>`;
        });
    } catch (e) { console.log('No search history'); }
}

async function loadConnectionData() {
    try {
        const res = await fetch(`${BASE}/api/connection-data`);
        const data = await res.json();
        if (data.host) $('conn-host').value = data.host;
        if (data.port) $('conn-port').value = data.port;
        if (data.sid) $('conn-sid').value = data.sid;
        if (data.username) $('conn-user').value = data.username;
        if (data.password) $('conn-pass').value = data.password;
    } catch (e) { }
}

// --- Event: Connection History Select ---
connHistorySelect.addEventListener('change', () => {
    const idx = connHistorySelect.value;
    if (idx === '') return;
    const c = connectionHistory[parseInt(idx)];
    $('conn-host').value = c.host || '';
    $('conn-port').value = c.port || '1521';
    $('conn-sid').value = c.sid || '';
    $('conn-user').value = c.username || '';
    $('conn-pass').value = c.password || '';
});

// --- Event: Search History Select ---
searchHistorySelect.addEventListener('change', () => {
    const idx = searchHistorySelect.value;
    if (idx === '') return;
    const s = searchHistory[parseInt(idx)];
    $('input-table').value = s.fisico;
});

// --- Event: Enter su campo tabella ---
$('input-table').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        const tableInput = $('input-table').value.trim();
        if (tableInput) {
            btnTranslate.click();
        }
    }
});

// --- Event: Translator Input ---
if (inputTecsql) {
    inputTecsql.addEventListener('input', () => {
        clearTranslateStatus();
        updateTranslateButtonState();
    });

    // Enter on empty left textarea → clear right textarea too
    inputTecsql.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && inputTecsql.value.trim() === '') {
            e.preventDefault();
            if (outputSql) outputSql.value = '';
            clearTranslateStatus();
            hideDescriptorChoice();
            hidePartialWarning();
        }
    });
}

// --- Event: Translate Query ---
if (btnTranslateQuery) {
    btnTranslateQuery.addEventListener('click', async () => {
        const rawQuery = inputTecsql ? inputTecsql.value.trim() : '';
        if (!rawQuery) return;

        clearTranslateStatus();
        hideDescriptorChoice();
        hidePartialWarning();
        setTranslateLoading(true);
        if (outputSql) outputSql.value = '';

        try {
            // Send query to backend (auto-detects direction based on $ presence)
            const stripParams = document.getElementById('toggle-strip-params')?.checked ?? false;
            const res = await fetch('/api/translate-query', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: rawQuery, strip_params: stripParams })
            });
            const data = await res.json();

            // Handle descriptor disambiguation
            if (data.ambiguous) {
                setTranslateStatus('info', 'Multiple descriptors available. Choose one.');
                showDescriptorChoice(data.table, data.candidates, data.fields_used);
                setTranslateLoading(false);
                return;
            }

            if (!res.ok || data.error) {
                // Inline error message (no alerts).
                setTranslateStatus('error', data.error || 'Errore di traduzione');
            } else {
                // Handle bidirectional output
                if (data.direction === 'tecsql_to_sql') {
                    if (outputSql) outputSql.value = data.sql || '';
                    setTranslateStatus('success', 'TecSQL → SQL completed');
                } else if (data.direction === 'sql_to_tecsql') {
                    if (outputSql) outputSql.value = data.tecsql || '';

                    // Show partial translation warning
                    if (data.partial_translation) {
                        showPartialTranslationWarning(data.untranslated_fields);
                    }

                    setTranslateStatus('success', 'SQL → TecSQL completed');
                }
            }
        } catch (e) {
            setTranslateStatus('error', 'Errore di comunicazione con il server');
        }

        setTranslateLoading(false);
        updateTranslateButtonState();
    });
}

// --- Event: Swap Button ---
const btnSwap = $('btn-swap');
if (btnSwap) {
    btnSwap.addEventListener('click', () => {
        const tempValue = inputTecsql.value;
        inputTecsql.value = outputSql.value;
        outputSql.value = tempValue;

        updateTranslateButtonState();
        clearTranslateStatus();
        hideDescriptorChoice();
        hidePartialWarning();
    });
}

// --- Event: Connect ---
btnConnect.addEventListener('click', async () => {
    btnConnect.disabled = true;
    btnConnect.innerHTML = '<span class="loader"></span> Connessione...';
    connStatus.className = 'status-box info';
    connStatus.textContent = 'Connessione in corso...';
    btnNextContainer.style.display = 'none';

    try {
        const res = await fetch(`${BASE}/api/connect`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                host: $('conn-host').value,
                port: $('conn-port').value,
                sid: $('conn-sid').value,
                username: $('conn-user').value,
                password: $('conn-pass').value
            })
        });
        const result = await res.json();

        if (result.success) {
            dictionary = result.data;
            indexes = result.indexes || [];
            indexColumns = result.index_columns || [];
            connStatus.className = 'status-box success';
            connStatus.textContent = result.message;
            btnConnect.classList.remove('btn-primary');
            btnConnect.classList.add('btn-success');
            loadConnectionHistory();
            
            // Auto-avanza alla pagina di ricerca
            setTimeout(() => {
                pageConnection.classList.remove('active');
                pageTranslate.classList.add('active');
                loadSearchHistory();
                setResultsEnabled(false);
                searchCard.classList.add('expanded');
                saveSession('tab-ricerca');
            }, 800);
        } else {
            connStatus.className = 'status-box error';
            connStatus.textContent = result.message;
        }
    } catch (e) {
        connStatus.className = 'status-box error';
        connStatus.textContent = 'Errore di comunicazione con il server';
    }

    btnConnect.disabled = false;
    btnConnect.innerHTML = '<svg class="icon icon-white"><use href="#icon-plug"/></svg> Connetti';
});

// --- Event: Next Page ---
btnNext.addEventListener('click', () => {
    pageConnection.classList.remove('active');
    pageTranslate.classList.add('active');
    loadSearchHistory();
    setResultsEnabled(false);
    searchCard.classList.add('expanded');
});

// --- Event: Back ---
function goBack() {
    clearSession();
    pageTranslate.classList.remove('active');
    pageConnection.classList.add('active');
    searchCard.classList.add('expanded');
    setResultsEnabled(false);
    dictionary = [];
    indexes = [];
    indexColumns = [];
    btnNextContainer.style.display = 'none';
    btnConnect.classList.remove('btn-success');
    btnConnect.classList.add('btn-primary');
    connStatus.className = 'status-box info';
    connStatus.textContent = 'In attesa di connessione...';
}
btnBack.addEventListener('click', goBack);

// --- Index Row Toggle ---
function toggleIndexRow(indexKey, rowElement) {
    const isExpanded = rowElement.classList.contains('expanded');
    const detailRowId = 'detail-' + indexKey.replace(/[^a-zA-Z0-9]/g, '_');
    const existingDetail = $(detailRowId);
    
    if (isExpanded) {
        rowElement.classList.remove('expanded');
        if (existingDetail) existingDetail.remove();
    } else {
        rowElement.classList.add('expanded');
        const cols = currentIndexColumns.filter(c => getIndexKey(c) === indexKey);
        
        const detailRow = document.createElement('tr');
        detailRow.className = 'index-detail-row';
        detailRow.id = detailRowId;
        
        let colsHtml = '';
        if (cols.length > 0) {
            colsHtml = `
                <table>
                    <thead><tr><th>COLONNA</th><th>POSIZIONE</th></tr></thead>
                    <tbody>
                        ${cols.map(c => `<tr><td>${c.COLUMN_NAME}</td><td>${c.COLUMN_POSITION}</td></tr>`).join('')}
                    </tbody>
                </table>
            `;
        } else {
            colsHtml = '<em style="color:#888;">Nessuna colonna</em>';
        }
        
        detailRow.innerHTML = `<td colspan="3"><div class="detail-content">${colsHtml}</div></td>`;
        
        detailRow.querySelectorAll('.detail-content td').forEach(td => {
            td.addEventListener('click', (e) => {
                e.stopPropagation();
                copyCell(td);
            });
        });
        
        rowElement.after(detailRow);
    }
}

// --- Render Functions ---
function renderIndexes(data) {
    currentIndexes = data;
    indexesBody.innerHTML = '';
    
    if (data.length === 0) {
        indexesBody.innerHTML = '<tr><td colspan="3" class="no-data">Nessun indice trovato per questa tabella</td></tr>';
        return;
    }

    data.forEach((row) => {
        const tr = document.createElement('tr');
        const indexKey = getIndexKey(row);
        tr.className = 'index-row';
        tr.dataset.indexKey = indexKey;
        tr.innerHTML = `
            <td style="text-align:center; width:40px;">
                <svg class="expand-icon" viewBox="0 0 24 24">
                    <path d="M9 18l6-6-6-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
            </td>
            <td>${row.INDEX_NAME}</td>
            <td>${row.UNIQUENESS}</td>
        `;
        tr.querySelector('td:first-child').addEventListener('click', (e) => {
            e.stopPropagation();
            toggleIndexRow(indexKey, tr);
        });
        tr.querySelectorAll('td:not(:first-child)').forEach(td => {
            td.addEventListener('click', () => copyCell(td));
        });
        indexesBody.appendChild(tr);
    });
}

function renderResults(data) {
    resultsBody.innerHTML = '';
    data.forEach(row => {
        const tr = document.createElement('tr');
        if (row.notFound) tr.className = 'not-found';
        tr.innerHTML = `
            <td>${row.TABELLA_FISICA}</td>
            <td>${row.CAMPO_FISICO}</td>
            <td>${row.TABELLA_LOGICA}</td>
            <td>${row.CAMPO_LOGICO}</td>
            <td>${row.TIPO}</td>
            <td>${row.AMPIEZZA}</td>
            <td>${row.DECIMALI}</td>
        `;
        tr.querySelectorAll('td').forEach(td => {
            td.addEventListener('click', () => copyCell(td));
        });
        resultsBody.appendChild(tr);
    });
}

// --- Easter Egg: Confetti ---
function launchConfetti() {
    const container = document.createElement('div');
    container.className = 'confetti-container';
    document.body.appendChild(container);

    const colors = ['#f39c12', '#e74c3c', '#27ae60', '#3498db', '#9b59b6', '#1abc9c'];

    for (let i = 0; i < 150; i++) {
        const confetti = document.createElement('div');
        confetti.className = 'confetti';
        confetti.style.left = Math.random() * 100 + '%';
        confetti.style.background = colors[Math.floor(Math.random() * colors.length)];
        confetti.style.borderRadius = Math.random() > 0.5 ? '50%' : '0';
        confetti.style.width = (Math.random() * 8 + 6) + 'px';
        confetti.style.height = (Math.random() * 8 + 6) + 'px';
        confetti.style.animationDuration = (Math.random() * 3 + 4) + 's';
        confetti.style.animationDelay = (Math.random() * 2) + 's';
        container.appendChild(confetti);
    }

    setTimeout(() => container.remove(), 10000);
}

function showEasterEgg() {
    resultsBody.innerHTML = `
        <tr>
            <td colspan="7" class="easter-egg">
                <div class="easter-egg-title">🎉 Welcome nosy user! 🎉</div>
                <div class="easter-egg-line">I'm here to inform you that</div>
                <div class="easter-egg-line">JCTNT has been happily created on 11-12-2025!</div>
                <div class="easter-egg-signature">— Angelo J. Marin 😊</div>
            </td>
        </tr>
    `;
    setResultsEnabled(true);
    searchCard.classList.remove('expanded');
    resultsCard.classList.add('expanded');
    launchConfetti();
}

// --- Easter Egg: Snowfall ---
function launchSnowfall() {
    const container = document.createElement('div');
    container.className = 'confetti-container';
    document.body.appendChild(container);

    // Prepara accumulo neve sui bottoni
    const buttons = document.querySelectorAll('.btn');
    const snowLayers = new Map();
    
    buttons.forEach(btn => {
        btn.style.position = 'relative';
        btn.style.overflow = 'visible';
        const layer = document.createElement('div');
        layer.className = 'snow-layer';
        layer.style.cssText = `
            position: absolute;
            bottom: -2px;
            left: -4px;
            right: -4px;
            height: 0px;
            background: linear-gradient(to top, #fff 0%, #e8f4ff 100%);
            border-radius: 0 0 6px 6px;
            pointer-events: none;
            transition: height 0.3s ease;
            z-index: -1;
        `;
        btn.appendChild(layer);
        snowLayers.set(btn, { layer, height: 0 });
    });

    // Crea fiocchi
    for (let i = 0; i < 200; i++) {
        const flake = document.createElement('div');
        flake.className = 'snowflake';
        const size = Math.random() * 6 + 4;
        const startX = Math.random() * 100;
        const duration = Math.random() * 5 + 6;
        const delay = Math.random() * 8;
        
        flake.style.cssText = `
            position: absolute;
            top: -10px;
            left: ${startX}%;
            width: ${size}px;
            height: ${size}px;
            background: white;
            border-radius: 50%;
            opacity: ${Math.random() * 0.5 + 0.5};
            box-shadow: 0 0 ${size}px rgba(255,255,255,0.8);
            pointer-events: none;
        `;
        
        container.appendChild(flake);
        
        // Animazione fiocco
        let startTime = null;
        let posY = -10;
        const posXBase = startX;
        const speed = (80 + Math.random() * 40) / duration;
        const wobbleAmp = Math.random() * 3 + 1;
        const wobbleSpeed = Math.random() * 2 + 1;
        
        function animateFlake(timestamp) {
            if (!startTime) startTime = timestamp + delay * 1000;
            if (timestamp < startTime) {
                requestAnimationFrame(animateFlake);
                return;
            }
            
            const elapsed = (timestamp - startTime) / 1000;
            posY = elapsed * speed;
            const wobble = Math.sin(elapsed * wobbleSpeed) * wobbleAmp;
            
            flake.style.top = posY + 'vh';
            flake.style.left = (posXBase + wobble) + '%';
            
            // Check collisione con bottoni
            const flakeRect = flake.getBoundingClientRect();
            buttons.forEach(btn => {
                const btnRect = btn.getBoundingClientRect();
                if (flakeRect.bottom >= btnRect.top && 
                    flakeRect.top <= btnRect.bottom &&
                    flakeRect.right >= btnRect.left && 
                    flakeRect.left <= btnRect.right &&
                    flakeRect.bottom <= btnRect.top + 20) {
                    
                    const data = snowLayers.get(btn);
                    if (data && data.height < 12) {
                        data.height += 0.5;
                        data.layer.style.height = data.height + 'px';
                    }
                    flake.remove();
                    return;
                }
            });
            
            if (posY < 120) {
                requestAnimationFrame(animateFlake);
            } else {
                flake.remove();
            }
        }
        
        requestAnimationFrame(animateFlake);
    }

    // Cleanup
    setTimeout(() => {
        container.remove();
        buttons.forEach(btn => {
            const layer = btn.querySelector('.snow-layer');
            if (layer) {
                layer.style.transition = 'height 1s ease, opacity 1s ease';
                layer.style.opacity = '0';
                setTimeout(() => layer.remove(), 1000);
            }
        });
    }, 15000);
}

function showKseniiaEasterEgg() {
    resultsBody.innerHTML = `
        <tr>
            <td colspan="7" class="easter-egg">
                <div class="easter-egg-title">❄️ Привет, любопытный пользователь! ❄️</div>
                <div class="easter-egg-line">I'm here to inform you that</div>
                <div class="easter-egg-line">I requested the creation of JCTNT to help</div>
                <div class="easter-egg-line">all the development department on 11-12-2025!</div>
                <div class="easter-egg-signature">— Kseniia Hrytskova 💙💛</div>
            </td>
        </tr>
    `;
    setResultsEnabled(true);
    searchCard.classList.remove('expanded');
    resultsCard.classList.add('expanded');
    launchSnowfall();
}

// --- Helper: Hide Suggestions ---
function hideSuggestions() {
    const suggestionsContainer = $('suggestions-container');
    if (suggestionsContainer) {
        suggestionsContainer.style.display = 'none';
    }
}

// --- Helper: Show Suggestions ---
function showSuggestions(suggestions, searchInput) {
    const suggestionsContainer = $('suggestions-container');
    const suggestionsList = $('suggestions-list');
    const suggestionsTitle = $('suggestions-title');

    if (!suggestionsContainer || !suggestionsList) return;

    // Clear previous suggestions
    suggestionsList.innerHTML = '';

    if (!suggestions || suggestions.length === 0) {
        suggestionsContainer.style.display = 'none';
        return;
    }

    // Update title
    suggestionsTitle.textContent = `Non ho trovato un risultato esatto per "${searchInput}", prova con:`;

    // Render suggestions
    suggestions.forEach((suggestion) => {
        const item = document.createElement('div');
        item.className = 'suggestion-item';
        item.dataset.fisico = suggestion.fisico;
        item.dataset.logico = suggestion.logico;

        // Highlight matching parts
        const fisicoHighlighted = highlightMatch(suggestion.fisico, searchInput);
        const logicoHighlighted = highlightMatch(suggestion.logico, searchInput);

        // Badge based on match type
        let badgeClass = suggestion.type;
        let badgeText = suggestion.type.replace('_', ' ');

        item.innerHTML = `
            <div class="suggestion-content">
                <div class="suggestion-table-name">
                    ${fisicoHighlighted} → ${logicoHighlighted}
                </div>
                <div class="suggestion-meta">
                    <span class="suggestion-badge ${badgeClass}">${badgeText}</span>
                    <span class="suggestion-fields-count">${suggestion.fieldsCount} campi</span>
                    ${suggestion.similarity ? `<span class="suggestion-score">${Math.round(suggestion.similarity * 100)}% match</span>` : ''}
                </div>
            </div>
        `;

        // Click handler
        item.addEventListener('click', () => {
            // Set input and trigger search
            $('input-table').value = suggestion.fisico;
            hideSuggestions();
            btnTranslate.click();
        });

        // Hover effect
        item.addEventListener('mouseenter', () => {
            item.classList.add('selected');
        });
        item.addEventListener('mouseleave', () => {
            item.classList.remove('selected');
        });

        suggestionsList.appendChild(item);
    });

    // Show container
    suggestionsContainer.style.display = 'block';

    // Scroll into view
    suggestionsContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// --- Event: Close Suggestions ---
const btnCloseSuggestions = $('btn-close-suggestions');
if (btnCloseSuggestions) {
    btnCloseSuggestions.addEventListener('click', hideSuggestions);
}

// --- Event: Translate ---
btnTranslate.addEventListener('click', async () => {
    const tableInput = normalizeTableName($('input-table').value);
    const fieldsInput = $('input-fields').value.trim();

    // Hide suggestions from previous search
    hideSuggestions();

    if (!tableInput) {
        alert('Inserisci il nome della tabella');
        return;
    }

    // Easter eggs
    if (tableInput === 'MARIN') {
        showEasterEgg();
        return;
    }
    if (tableInput === 'KSENIIA') {
        showKseniiaEasterEgg();
        return;
    }

    // FUZZY SEARCH: Find best matches
    const { exact, suggestions } = findBestTableMatches(dictionary, tableInput, 10, 50);

    let tableRows = [];

    // Case 1: Exact match found
    if (exact.length > 0) {
        const firstExact = exact[0];
        tableRows = dictionary.filter(r => r.TABELLA_FISICA === firstExact.fisico);
    }
    // Case 2: No exact match, but suggestions exist
    else if (suggestions.length > 0) {
        // Show suggestions UI
        showSuggestions(suggestions, tableInput);
        return; // Stop here, user will click on suggestion
    }
    // Case 3: No matches at all
    else {
        alert(`Tabella "${tableInput}" non trovata nel dizionario.\n\nProva con:\n- Un nome parziale (es. "ARTI" invece di "MD_ARTI")\n- Il nome logico (es. "Articolo")\n- Verifica l'ortografia`);
        return;
    }

    currentTablePhysical = tableRows[0].TABELLA_FISICA;
    currentTableLogical = tableRows[0].TABELLA_LOGICA;
    currentTableName.textContent = `${currentTablePhysical} - ${currentTableLogical}`;

    // Save to search history
    await fetch(`${BASE}/api/add-search-history`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            fisico: tableRows[0].TABELLA_FISICA,
            logico: tableRows[0].TABELLA_LOGICA
        })
    });
    loadSearchHistory();

    let results = [];

    if (!fieldsInput) {
        results = tableRows;
    } else {
        const fields = fieldsInput.split(/[\s,]+/).filter(f => f.length > 0);
        fields.forEach(field => {
            const fieldUpper = field.toUpperCase();
            const found = tableRows.find(r =>
                r.CAMPO_FISICO.toUpperCase() === fieldUpper ||
                r.CAMPO_LOGICO.toUpperCase() === fieldUpper
            );
            if (found) {
                results.push(found);
            } else {
                results.push({
                    TABELLA_FISICA: tableRows[0].TABELLA_FISICA,
                    CAMPO_FISICO: field,
                    TABELLA_LOGICA: tableRows[0].TABELLA_LOGICA,
                    CAMPO_LOGICO: 'NOT FOUND',
                    TIPO: '-', AMPIEZZA: '-', DECIMALI: '-',
                    notFound: true
                });
            }
        });
    }

    renderResults(results);

    const tableIndexes = indexes.filter(i => matchesTableEntry(i, currentTablePhysical));
    const tableIndexColumns = indexColumns.filter(c => matchesTableEntry(c, currentTablePhysical));
    const preferredOwner = pickIndexOwner(tableIndexes, tableIndexColumns);
    const ownerFilteredIndexes = preferredOwner
        ? tableIndexes.filter(i => normalizeTableName(i.TABLE_OWNER || '') === preferredOwner)
        : tableIndexes;
    const ownerFilteredColumns = preferredOwner
        ? tableIndexColumns.filter(c => normalizeTableName(c.TABLE_OWNER || '') === preferredOwner)
        : tableIndexColumns;

    currentIndexes = dedupeIndexes(ownerFilteredIndexes);
    currentIndexColumns = dedupeIndexColumns(ownerFilteredColumns);
    renderIndexes(currentIndexes);

    setResultsEnabled(true);
    searchCard.classList.remove('expanded');
    resultsCard.classList.add('expanded');

    // Reset results to first tab
    setActiveTab('tabs-results', 'tab-fields');
});

// --- Event: Copy All Fields ---
btnCopyFields.addEventListener('click', () => {
    const rows = resultsBody.querySelectorAll('tr');
    let text = 'TABELLA_FISICA\tCAMPO_FISICO\tTABELLA_LOGICA\tCAMPO_LOGICO\tTIPO\tAMPIEZZA\tDECIMALI\n';
    rows.forEach(row => {
        const cells = row.querySelectorAll('td');
        if (cells.length === 7) {
            text += Array.from(cells).map(c => c.textContent).join('\t') + '\n';
        }
    });
    navigator.clipboard.writeText(text).then(() => {
        const original = btnCopyFields.innerHTML;
        btnCopyFields.innerHTML = '<svg class="icon"><use href="#icon-copy"/></svg> Copiato!';
        setTimeout(() => btnCopyFields.innerHTML = original, 2000);
    });
});

// --- Event: Copy All Indexes ---
btnCopyIndexes.addEventListener('click', () => {
    if (currentIndexes.length === 0) {
        alert('Nessun indice da copiare');
        return;
    }
    
    let text = 'INDICI PER TABELLA: ' + currentTablePhysical + '\n\n';
    
    currentIndexes.forEach(idx => {
        text += `INDICE: ${idx.INDEX_NAME} (${idx.UNIQUENESS})\n`;
        const cols = currentIndexColumns.filter(c => getIndexKey(c) === getIndexKey(idx));
        if (cols.length > 0) {
            text += 'COLONNE:\n';
            cols.forEach(c => {
                text += `  ${c.COLUMN_POSITION}. ${c.COLUMN_NAME}\n`;
            });
        }
        text += '\n';
    });
    
    navigator.clipboard.writeText(text).then(() => {
        const original = btnCopyIndexes.innerHTML;
        btnCopyIndexes.innerHTML = '<svg class="icon"><use href="#icon-copy"/></svg> Copiato!';
        setTimeout(() => btnCopyIndexes.innerHTML = original, 2000);
    });
});

// --- Descriptor Choice UI ---
function showDescriptorChoice(table, candidates, fieldsUsed) {
    let container = $('descriptor-choice-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'descriptor-choice-container';
        container.className = 'descriptor-choice-container';
        const statusBox = $('translate-status');
        statusBox.parentNode.insertBefore(container, statusBox.nextSibling);
    }

    container.innerHTML = `
        <div class="descriptor-choice-header">
            <svg class="icon"><use href="#icon-database"/></svg>
            <span>Multiple descriptors for <strong>${table}</strong>. Choose one:</span>
            <button class="descriptor-choice-close" onclick="hideDescriptorChoice()">×</button>
        </div>
        <div class="descriptor-choice-info">
            Fields used: <code>${fieldsUsed.join(', ')}</code>
        </div>
        <div class="descriptor-choice-list">
            ${candidates.map(desc => `
                <div class="descriptor-choice-item">
                    <div class="descriptor-name">${desc}</div>
                    <button class="btn btn-primary btn-select-descriptor" data-descriptor="${desc}">
                        Select
                    </button>
                </div>
            `).join('')}
        </div>
    `;

    container.style.display = 'block';
    container.querySelectorAll('.btn-select-descriptor').forEach(btn => {
        btn.addEventListener('click', (e) => {
            handleDescriptorSelection(e.target.dataset.descriptor);
        });
    });
}

function hideDescriptorChoice() {
    const container = $('descriptor-choice-container');
    if (container) container.style.display = 'none';
}

async function handleDescriptorSelection(descriptor) {
    const rawQuery = inputTecsql ? inputTecsql.value.trim() : '';
    if (!rawQuery) return;

    hideDescriptorChoice();
    setTranslateLoading(true);

    try {
        const res = await fetch('/api/translate-query', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: rawQuery, chosen_descriptor: descriptor, strip_params: document.getElementById('toggle-strip-params')?.checked ?? false })
        });
        const data = await res.json();

        if (data.direction === 'sql_to_tecsql' && outputSql) {
            outputSql.value = data.tecsql || '';

            // Show partial translation warning
            if (data.partial_translation) {
                showPartialTranslationWarning(data.untranslated_fields);
            }

            setTranslateStatus('success', `Completed using ${descriptor}`);
        }
    } catch (e) {
        setTranslateStatus('error', 'Server error');
    }

    setTranslateLoading(false);
}

// --- Partial Translation Warning ---
function showPartialTranslationWarning(untranslatedFields) {
    let container = $('partial-warning-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'partial-warning-container';
        container.className = 'partial-warning-container';

        const translateStatus = $('translate-status');
        if (translateStatus) {
            translateStatus.parentNode.insertBefore(container, translateStatus.nextSibling);
        }
    }

    container.innerHTML = `
        <div class="partial-warning-header">
            <svg class="icon"><use href="#icon-alert"/></svg>
            <span>Attenzione: campi non tradotti</span>
            <button class="partial-warning-close" onclick="hidePartialWarning()">×</button>
        </div>
        <div class="partial-warning-content">
            <p>I seguenti campi non sono stati trovati nel dizionario e rimangono in formato fisico:</p>
            <ul>
                ${untranslatedFields.map(f => `<li><code class="field-not-found">${f}</code></li>`).join('')}
            </ul>
            <p>Verificare l'ortografia o cercare la tabella nella scheda Ricerca.</p>
        </div>
    `;

    container.style.display = 'block';
}

function hidePartialWarning() {
    const container = $('partial-warning-container');
    if (container) container.style.display = 'none';
}

// --- Session Persistence (survives F5) ---
const SESSION_KEY = 'jctnt_session';

function saveSession(activeTab) {
    localStorage.setItem(SESSION_KEY, JSON.stringify({
        connected: true,
        activeTab: activeTab || 'tab-ricerca'
    }));
}

function clearSession() {
    localStorage.removeItem(SESSION_KEY);
}

async function tryAutoReconnect() {
    let session;
    try {
        const raw = localStorage.getItem(SESSION_KEY);
        if (!raw) return false;
        session = JSON.parse(raw);
        if (!session?.connected) return false;
    } catch {
        clearSession();
        return false;
    }

    connStatus.className = 'status-box info';
    connStatus.textContent = 'Ripristino sessione...';

    try {
        const credRes = await fetch(`${BASE}/api/connection-data`);
        const creds = await credRes.json();
        if (!creds.host) { clearSession(); return false; }

        const res = await fetch(`${BASE}/api/connect`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(creds)
        });
        const result = await res.json();

        if (result.success) {
            dictionary = result.data;
            indexes = result.indexes || [];
            indexColumns = result.index_columns || [];

            pageConnection.classList.remove('active');
            pageTranslate.classList.add('active');
            loadSearchHistory();
            setResultsEnabled(false);
            searchCard.classList.add('expanded');

            // Restore the tab the user was on before F5
            if (session.activeTab) {
                const tabEl = document.querySelector(`[data-tab="${session.activeTab}"]`);
                if (tabEl) tabEl.click();
            }

            return true;
        }
    } catch (e) { /* network error — fall through */ }

    clearSession();
    connStatus.className = 'status-box info';
    connStatus.textContent = 'In attesa di connessione...';
    return false;
}

// --- Init ---
initTabs();
clearTranslateStatus();
updateTranslateButtonState();
loadConnectionHistory();
tryAutoReconnect().then(reconnected => {
    if (!reconnected) loadConnectionData();
});
