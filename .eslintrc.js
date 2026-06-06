module.exports = {
    env: {
        node: true,
        es2021: true,
        jest: true,
    },
    extends: ['eslint:recommended', 'prettier'],
    plugins: ['jest'],
    parserOptions: {
        ecmaVersion: 2021,
    },
    rules: {
        'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
};
