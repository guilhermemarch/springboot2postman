const crypto = require('crypto');

/**
 * Build a Postman environment that complements the generated collection:
 * it mirrors every collection variable so the collection works after a
 * plain import + environment select.
 */
function buildEnvironment({ name = 'API Environment', collection = null, baseUrl = null } = {}) {
    const values = [];

    const push = (key, value, type = 'default') => {
        if (!values.find((entry) => entry.key === key)) {
            values.push({ key, value: value ?? '', type, enabled: true });
        }
    };

    for (const variable of collection?.variable || []) {
        const isSecret = ['token', 'password', 'apikey', 'secret'].some((hint) =>
            variable.key.toLowerCase().includes(hint),
        );
        push(variable.key, variable.value, isSecret ? 'secret' : 'default');
    }

    if (baseUrl) {
        const existing = values.find((entry) => entry.key === 'baseUrl');
        if (existing) {
            existing.value = baseUrl;
        } else {
            push('baseUrl', baseUrl);
        }
    }

    if (values.length === 0) {
        push('baseUrl', 'http://localhost:8080');
    }

    return {
        id: crypto.randomUUID(),
        name,
        values,
        _postman_variable_scope: 'environment',
        _postman_exported_using: 'springboot2postman',
    };
}

module.exports = {
    buildEnvironment,
};
