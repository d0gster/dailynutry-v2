// Expo flat ESLint config.
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', '.expo/*', 'node_modules/*'],
  },
  {
    // Tests place imports after their `vi.mock` calls on purpose: the mock has
    // to be declared before the module under test is read, even though Vitest
    // hoists it either way. Reading top-down then matches execution order.
    files: ['test/**/*.ts'],
    rules: { 'import/first': 'off' },
  },
]);
