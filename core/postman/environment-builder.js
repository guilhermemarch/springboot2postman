function buildEnvironment({
    name = 'API Environment',
    baseUrl = 'http://localhost:8080',
    extra = {},
}) {
    const values = [
        { key: 'baseUrl', value: baseUrl, type: 'default', enabled: true },
        { key: 'token', value: '<JWT_TOKEN_HERE>', type: 'secret', enabled: true },
    ];

    for (const [key, value] of Object.entries(extra)) {
        if (!values.find((entry) => entry.key === key)) {
            values.push({ key, value: String(value), type: 'default', enabled: true });
        }
    }

    return {
        name,
        values,
        _postman_variable_scope: 'environment',
    };
}

module.exports = {
    buildEnvironment,
};
