/**
 * Fuzzy Search Module
 * Algoritmi di ricerca intelligente per tabelle e campi
 */

/**
 * Calcola la Levenshtein distance tra due stringhe
 * (numero minimo di modifiche per trasformare s1 in s2)
 */
function levenshteinDistance(s1, s2) {
    s1 = s1.toLowerCase();
    s2 = s2.toLowerCase();

    const len1 = s1.length;
    const len2 = s2.length;

    // Matrice di distanze
    const matrix = Array(len1 + 1).fill(null)
        .map(() => Array(len2 + 1).fill(0));

    // Inizializza prima riga e colonna
    for (let i = 0; i <= len1; i++) matrix[i][0] = i;
    for (let j = 0; j <= len2; j++) matrix[0][j] = j;

    // Calcola distanze
    for (let i = 1; i <= len1; i++) {
        for (let j = 1; j <= len2; j++) {
            const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
            matrix[i][j] = Math.min(
                matrix[i - 1][j] + 1,      // deletion
                matrix[i][j - 1] + 1,      // insertion
                matrix[i - 1][j - 1] + cost // substitution
            );
        }
    }

    return matrix[len1][len2];
}

/**
 * Calcola similarity ratio (0-1) tra due stringhe
 * 1 = identiche, 0 = completamente diverse
 */
function similarityRatio(s1, s2) {
    const maxLen = Math.max(s1.length, s2.length);
    if (maxLen === 0) return 1.0;

    const distance = levenshteinDistance(s1, s2);
    return 1 - (distance / maxLen);
}

/**
 * Verifica se s1 contiene s2 (case insensitive, ignora spazi)
 */
function partialMatch(s1, s2) {
    const normalize = s => s.toLowerCase().replace(/\s+/g, '');
    return normalize(s1).includes(normalize(s2));
}

/**
 * Calcola un punteggio di rilevanza per una tabella dato un input di ricerca
 *
 * Criteri di scoring:
 * 1. Match esatto = 1000 punti
 * 2. Starts with = 500 + similarity * 400
 * 3. Contains = 200 + similarity * 300
 * 4. Fuzzy match = similarity * 100
 */
function scoreTableMatch(tableFisico, tableLogico, searchInput) {
    const input = searchInput.toLowerCase().trim();
    const fisico = (tableFisico || '').toLowerCase().trim();
    const logico = (tableLogico || '').toLowerCase().trim();

    // Match esatto
    if (fisico === input || logico === input) {
        return { score: 1000, type: 'exact', match: fisico === input ? 'fisico' : 'logico' };
    }

    // Starts with (alta priorità)
    if (fisico.startsWith(input) || logico.startsWith(input)) {
        const simFisico = similarityRatio(fisico, input);
        const simLogico = similarityRatio(logico, input);
        const maxSim = Math.max(simFisico, simLogico);
        return {
            score: 500 + maxSim * 400,
            type: 'starts_with',
            match: fisico.startsWith(input) ? 'fisico' : 'logico',
            similarity: maxSim
        };
    }

    // Contains (media priorità)
    if (partialMatch(fisico, input) || partialMatch(logico, input)) {
        const simFisico = similarityRatio(fisico, input);
        const simLogico = similarityRatio(logico, input);
        const maxSim = Math.max(simFisico, simLogico);
        return {
            score: 200 + maxSim * 300,
            type: 'contains',
            match: partialMatch(fisico, input) ? 'fisico' : 'logico',
            similarity: maxSim
        };
    }

    // Fuzzy match (bassa priorità, ma utile per typos)
    const simFisico = similarityRatio(fisico, input);
    const simLogico = similarityRatio(logico, input);
    const maxSim = Math.max(simFisico, simLogico);

    // Solo se similarity > 0.5 (almeno 50% simile)
    if (maxSim > 0.5) {
        return {
            score: maxSim * 100,
            type: 'fuzzy',
            match: simFisico > simLogico ? 'fisico' : 'logico',
            similarity: maxSim
        };
    }

    return { score: 0, type: 'no_match', similarity: 0 };
}

/**
 * Trova le migliori corrispondenze per una ricerca di tabella
 *
 * @param {Array} dictionary - Array di record del dizionario
 * @param {string} searchInput - Input di ricerca dell'utente
 * @param {number} maxResults - Numero massimo di suggerimenti (default: 10)
 * @param {number} minScore - Score minimo per includere un risultato (default: 50)
 * @returns {Object} { exact: [...], suggestions: [...] }
 */
function findBestTableMatches(dictionary, searchInput, maxResults = 10, minScore = 50) {
    if (!searchInput || !dictionary || dictionary.length === 0) {
        return { exact: [], suggestions: [] };
    }

    // Raggruppa per tabella e calcola score
    const tableScores = new Map();

    dictionary.forEach(record => {
        const fisico = record.TABELLA_FISICA || '';
        const logico = record.TABELLA_LOGICA || '';

        if (!fisico) return;

        // Usa tabella fisica come chiave unica
        if (!tableScores.has(fisico)) {
            const scoreData = scoreTableMatch(fisico, logico, searchInput);

            if (scoreData.score >= minScore) {
                tableScores.set(fisico, {
                    fisico: fisico,
                    logico: logico,
                    score: scoreData.score,
                    type: scoreData.type,
                    match: scoreData.match,
                    similarity: scoreData.similarity || 0,
                    fieldsCount: 1
                });
            }
        } else {
            // Incrementa count campi
            tableScores.get(fisico).fieldsCount++;
        }
    });

    // Converti in array e ordina per score
    const sortedTables = Array.from(tableScores.values())
        .sort((a, b) => {
            // Prima per score, poi per fieldsCount (più campi = più rilevante)
            if (b.score !== a.score) return b.score - a.score;
            return b.fieldsCount - a.fieldsCount;
        });

    // Separa exact matches da suggestions
    const exact = sortedTables.filter(t => t.type === 'exact');
    const suggestions = sortedTables
        .filter(t => t.type !== 'exact')
        .slice(0, maxResults);

    return { exact, suggestions };
}

/**
 * Trova suggerimenti per campi (quando la tabella è nota)
 *
 * @param {Array} tableRows - Record della tabella selezionata
 * @param {string} fieldInput - Input campo dell'utente
 * @param {number} maxResults - Numero massimo di suggerimenti
 */
function findBestFieldMatches(tableRows, fieldInput, maxResults = 10) {
    if (!fieldInput || !tableRows || tableRows.length === 0) {
        return [];
    }

    const fieldScores = tableRows.map(record => {
        const fisico = (record.CAMPO_FISICO || '').toLowerCase().trim();
        const logico = (record.CAMPO_LOGICO || '').toLowerCase().trim();
        const input = fieldInput.toLowerCase().trim();

        let score = 0;
        let type = 'no_match';
        let match = '';

        // Match esatto
        if (fisico === input || logico === input) {
            score = 1000;
            type = 'exact';
            match = fisico === input ? 'fisico' : 'logico';
        }
        // Starts with
        else if (fisico.startsWith(input) || logico.startsWith(input)) {
            const sim = Math.max(similarityRatio(fisico, input), similarityRatio(logico, input));
            score = 500 + sim * 400;
            type = 'starts_with';
            match = fisico.startsWith(input) ? 'fisico' : 'logico';
        }
        // Contains
        else if (fisico.includes(input) || logico.includes(input)) {
            const sim = Math.max(similarityRatio(fisico, input), similarityRatio(logico, input));
            score = 200 + sim * 300;
            type = 'contains';
            match = fisico.includes(input) ? 'fisico' : 'logico';
        }
        // Fuzzy
        else {
            const sim = Math.max(similarityRatio(fisico, input), similarityRatio(logico, input));
            if (sim > 0.5) {
                score = sim * 100;
                type = 'fuzzy';
                match = similarityRatio(fisico, input) > similarityRatio(logico, input) ? 'fisico' : 'logico';
            }
        }

        return {
            record,
            score,
            type,
            match
        };
    })
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults);

    return fieldScores;
}

/**
 * Evidenzia i caratteri matching in una stringa
 *
 * @param {string} text - Testo da evidenziare
 * @param {string} query - Query di ricerca
 * @returns {string} HTML con <mark> tags
 */
function highlightMatch(text, query) {
    if (!query || !text) return text;

    const normalize = s => s.toLowerCase();
    const textLower = normalize(text);
    const queryLower = normalize(query);

    // Se contiene la query, evidenzia la sottostringa
    const index = textLower.indexOf(queryLower);
    if (index !== -1) {
        const before = text.slice(0, index);
        const match = text.slice(index, index + query.length);
        const after = text.slice(index + query.length);
        return `${before}<mark>${match}</mark>${after}`;
    }

    // Altrimenti evidenzia caratteri singoli che matchano
    let result = '';
    let queryIndex = 0;

    for (let i = 0; i < text.length && queryIndex < query.length; i++) {
        if (normalize(text[i]) === normalize(query[queryIndex])) {
            result += `<mark>${text[i]}</mark>`;
            queryIndex++;
        } else {
            result += text[i];
        }
    }

    return result || text;
}
